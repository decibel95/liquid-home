import { EntityWriter, throttleWrites, WriterRegistry, type HassEntity, type WriteCall } from '@decibel95/liquid-core';
import { t } from '../i18n';
import { stateOf } from './model';

/**
 * A light change in writer terms. Every key is what the card wants HA to report:
 * - `on`: the light's state. `on: false` is a turn_off; it is sent only on release while a drag holds the queue.
 * - `brightness_pct`: integer percent, sent as is (plan 2.5) and reconciled in percent.
 * - `color_temp_kelvin`, `hs_color`: the White and Colour pill values. `null` (only in what a call sets) means
 *   "no longer in that colour mode", so the hold ends when HA reports the other mode.
 * - `effect`: an entry of the light's effect_list (CHO-15).
 * An `undefined` value clears an older pending value of that key.
 */
export interface LightPatch {
  on?: boolean;
  brightness_pct?: number;
  color_temp_kelvin?: number | null;
  hs_color?: [number, number] | null;
  effect?: string;
}

export type LightCall = WriteCall<LightPatch>;

/** Write timing approved at gate 2 (CHO-9): leading write, at most one per 300 ms, a final write on release. */
export const LIGHT_THROTTLE_MS = 300;

const same = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => same(v, b[i])) : Object.is(a, b);

/**
 * Does HA's reported value count as the value sent? Colour temperature goes through mireds in HA, so 2700 K comes
 * back as 2702 K: one mired of difference counts as equal. hs_color comes back with decimals: one degree of hue
 * (around the circle) and one point of saturation count as equal.
 */
export function matches(key: string, actual: unknown, sent: unknown): boolean {
  if (key === 'color_temp_kelvin' && typeof actual === 'number' && typeof sent === 'number' && actual > 0 && sent > 0) {
    return Math.abs(1e6 / actual - 1e6 / sent) <= 1;
  }
  if (key === 'hs_color' && Array.isArray(actual) && Array.isArray(sent)) {
    const dh = Math.abs(Number(actual[0]) - Number(sent[0])) % 360;
    return Math.min(dh, 360 - dh) <= 1 && Math.abs(Number(actual[1]) - Number(sent[1])) <= 1;
  }
  return same(actual, sent);
}

/** What HA will report for `key` once the calls in flight land: the value we sent (in flight), else the entity's own. */
export const expectedValue = <K extends keyof LightPatch>(entity: HassEntity, baseline: LightPatch, key: K): unknown =>
  key in baseline ? baseline[key] : stateOf(entity, key);

/**
 * Is `wanted` already what the light has or will have once the calls in flight land? A value we sent is compared
 * exactly: it is our own number, so 6480 K after 6450 K in flight, or one degree more hue, is a change and goes out.
 * Only a value HA reported is compared with the tolerant `matches` (mireds, hs decimals), as the writer's observe() does.
 */
export function settled<K extends keyof LightPatch>(entity: HassEntity, baseline: LightPatch, key: K, wanted: unknown): boolean {
  const value = expectedValue(entity, baseline, key);
  if (value == null) return false;
  return key in baseline ? same(value, wanted) : matches(key, value, wanted);
}

function expected(entity: HassEntity, baseline: LightPatch) {
  return {
    on: expectedValue(entity, baseline, 'on') === true,
    current: <K extends keyof LightPatch>(key: K): unknown => expectedValue(entity, baseline, key),
    settled: <K extends keyof LightPatch>(key: K, wanted: unknown): boolean => settled(entity, baseline, key, wanted),
  };
}

/**
 * The calls for a coalesced change (plan 2.5, gate 2 payloads). Values the light has or will have once the calls in
 * flight land are dropped, so a release on the value last sent sends nothing. `sets` holds only the keys that change,
 * so a hold never pins a value the user did not touch.
 */
export function buildLightCalls(change: LightPatch, entity: HassEntity, baseline: LightPatch): LightCall[] {
  const entity_id = entity.entity_id;
  const exp = expected(entity, baseline);
  if (change.on === false) return exp.on ? [{ service: 'turn_off', data: { entity_id }, sets: { on: false } }] : [];
  const data: Record<string, unknown> = { entity_id };
  const sets: LightPatch = {};
  const pct = change.brightness_pct;
  if (pct !== undefined && pct > 0 && (!exp.on || !exp.settled('brightness_pct', pct))) {
    data.brightness_pct = sets.brightness_pct = pct;
  }
  const k = change.color_temp_kelvin;
  if (typeof k === 'number' && (!exp.on || !exp.settled('color_temp_kelvin', k))) {
    data.color_temp_kelvin = sets.color_temp_kelvin = k;
    if (exp.current('hs_color') != null) sets.hs_color = null;
  }
  const hs = change.hs_color;
  if (Array.isArray(hs) && (!exp.on || !exp.settled('hs_color', hs))) {
    data.hs_color = sets.hs_color = [hs[0], hs[1]];
    if (exp.current('color_temp_kelvin') != null) sets.color_temp_kelvin = null;
  }
  if (typeof change.effect === 'string' && change.effect !== exp.current('effect')) data.effect = sets.effect = change.effect;
  if (change.on === true && !exp.on) sets.on = true;
  if (Object.keys(sets).length === 0) return [];
  return [{ service: 'turn_on', data, sets }];
}

/** A turn-off waits for release while a drag or a held key holds the queue (release at 0 sends light.turn_off). */
export const sendOnRelease = (change: LightPatch): boolean => change.on === false;

/** The product string shown when a light call fails without a message of its own. */
export const LIGHT_ERROR_KEY = 'common.commandFailed';

export type LightWriter = EntityWriter<LightPatch, LightCall>;

export const createLightWriter = (entityId: string): LightWriter =>
  new EntityWriter<LightPatch, LightCall>(entityId, {
    build: buildLightCalls,
    schedule: throttleWrites(LIGHT_THROTTLE_MS),
    stateOf,
    matches,
    sendOnRelease,
    t: (hass, key) => t(hass, key),
    errorKey: LIGHT_ERROR_KEY,
  });

/**
 * One shared writer per light entity for the whole bundle: the light card, the tile, the room card and the card in a
 * sheet coalesce into one queue and agree on what is pending. A card reaches it through a WriterLease; `set()` for
 * steps (drag, key, step button), `sendNow()` for a power or toggle tap, `discard()` before a call made another way.
 */
export const lightWriters = new WriterRegistry<LightWriter>(createLightWriter);
