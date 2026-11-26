import { EntityWriter, WriterRegistry, throttleWrites, type HassEntity, type WriteCall } from '@decibel95/liquid-core';
import { t } from '../i18n';
import { FAN_FEATURE, fanFeatures, percentPatch, stateOf, stepTarget, type FanView } from './model';

/**
 * A fan change in writer terms. Every key is what the card wants HA to report (see stateOf in model.ts):
 * - `on`: power. `on: false` is a turn_off.
 * - `percentage`: a snapped speed, sent as `set_percentage`; 0 turns the fan off and waits for release while a drag or
 *   a held key holds the queue (sendOnRelease).
 * - `preset_mode`: `set_preset_mode` while on, `turn_on` with the preset while off.
 * - `oscillating`, `direction`: the row buttons.
 * An `undefined` value clears an older pending value of that key (the patches in model.ts use it so a speed, a
 * preset and a power change never coalesce into one change). `null` appears only in what a call sets: a percentage
 * or preset that the call ends, in stateOf terms.
 *
 * Every call's `sets` names every key it changes, so a newer call replaces each value an older one still holds (the
 * core merges what each send sets into the in-flight values) and the echo clears them all.
 */
export interface FanPatch {
  on?: boolean;
  percentage?: number | null;
  preset_mode?: string | null;
  oscillating?: boolean;
  direction?: string;
}

export type FanCall = WriteCall<FanPatch>;

/** Write timing of the fan: leading write, at most one per 300 ms, a final write on release (as the light, 0.1). */
export const FAN_THROTTLE_MS = 300;

/** The product string shown when a fan call fails without a message of its own. */
export const FAN_ERROR_KEY = 'common.commandFailed';

/**
 * The calls for a coalesced change (plan 2.5). A value equal to what is in flight (`baseline`), else to HA's current
 * value (off counts as 0 %, a preset as null), is dropped, so a release on the value last sent sends nothing. Every
 * call is gated by its feature bit. `sets` names every key the call changes, in stateOf terms (see FanPatch).
 */
export function buildFanCalls(change: FanPatch, entity: HassEntity, baseline: FanPatch): FanCall[] {
  const entity_id = entity.entity_id;
  const f = fanFeatures(entity);
  const has = (bit: number) => (f & bit) !== 0;
  const exp = <K extends keyof FanPatch>(key: K): unknown => (key in baseline ? baseline[key] : stateOf(entity, key));
  const on = exp('on') === true;
  if (change.on === false) {
    return on && has(FAN_FEATURE.TURN_OFF) ? [{ service: 'turn_off', data: { entity_id }, sets: { on: false, percentage: 0, preset_mode: null } }] : [];
  }
  const calls: FanCall[] = [];
  const p = change.percentage;
  const preset = change.preset_mode;
  if (typeof p === 'number') {
    if (has(FAN_FEATURE.SET_SPEED) && p !== exp('percentage')) {
      const sets: FanPatch = { percentage: p, preset_mode: null };
      if (p > 0 !== on) sets.on = p > 0;
      calls.push({ service: 'set_percentage', data: { entity_id, percentage: p }, sets });
    }
  } else if (typeof preset === 'string') {
    if (!has(FAN_FEATURE.PRESET_MODE)) {
      // No preset support: nothing to send.
    } else if (!on) {
      if (has(FAN_FEATURE.TURN_ON)) calls.push({ service: 'turn_on', data: { entity_id, preset_mode: preset }, sets: { on: true, preset_mode: preset, percentage: null } });
    } else if (preset !== exp('preset_mode')) {
      calls.push({ service: 'set_preset_mode', data: { entity_id, preset_mode: preset }, sets: { preset_mode: preset, percentage: null } });
    }
  } else if (change.on === true && !on && has(FAN_FEATURE.TURN_ON)) {
    calls.push({ service: 'turn_on', data: { entity_id }, sets: { on: true, percentage: null } });
  }
  if (typeof change.oscillating === 'boolean' && has(FAN_FEATURE.OSCILLATE) && change.oscillating !== exp('oscillating')) {
    calls.push({ service: 'oscillate', data: { entity_id, oscillating: change.oscillating }, sets: { oscillating: change.oscillating } });
  }
  if (typeof change.direction === 'string' && has(FAN_FEATURE.DIRECTION) && change.direction !== exp('direction')) {
    calls.push({ service: 'set_direction', data: { entity_id, direction: change.direction }, sets: { direction: change.direction } });
  }
  return calls;
}

/** A speed of 0 (off) waits for release while a drag or a held key holds the queue (the prototype's deferZero). */
export const sendOnRelease = (change: FanPatch): boolean => change.percentage === 0;

export type FanWriter = EntityWriter<FanPatch, FanCall>;

/** A fan writer: throttle 300 ms plus final, the base hold (the sent value until HA reports it or `write_hold`). */
export const createFanWriter = (entityId: string): FanWriter =>
  new EntityWriter<FanPatch, FanCall>(entityId, {
    build: buildFanCalls,
    schedule: throttleWrites(FAN_THROTTLE_MS),
    stateOf,
    sendOnRelease,
    t: (hass, key) => t(hass, key),
    errorKey: FAN_ERROR_KEY,
  });

/**
 * One shared writer per fan entity for the whole bundle: the fan card, its sheet copy, the tile and the room strip
 * coalesce into one queue. `set()` for the pill and steps, `sendNow()` for power, oscillate, direction and presets.
 */
export const fanWriters = new WriterRegistry<FanWriter>(createFanWriter);

/**
 * A tile or room step (Q7 b): `set_percentage` to the next step through the shared throttle (leading write, at most one
 * per 300 ms, the last value at the end of the window). `v` is the fan's view with this writer's local values, so a
 * pending step is the base. Returns false when the step is disabled (see stepState).
 */
export function stepFan(writer: FanWriter, v: FanView, dir: 1 | -1): boolean {
  if (!v.available || !v.on || !v.speed) return false;
  const p = v.percentage;
  if (dir < 0 && (p == null || p <= stepTarget({ ...v, percentage: 0 }, 1))) return false;
  if (dir > 0 && p != null && p >= 100) return false;
  writer.set(percentPatch(stepTarget(v, dir)));
  return true;
}
