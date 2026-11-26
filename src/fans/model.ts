import { clamp, humanize, PALETTE, tone, translated, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../i18n';
import type { FanPatch } from './writer';

/**
 * The fan domain of Liquid Home (plan 2.5): how every card (fan card, tile, badge, room strip) reads a fan. One view of
 * a fan state with the shared writer's optimistic values on top, HA's speed steps (snapping, keys, tile steps), the
 * readout and subline words, and the power gating by feature bits. Nothing here writes; writer.ts holds the calls.
 */

export type Glass = 'dark' | 'light';

/** HA FanEntityFeature bits. TURN_ON and TURN_OFF gate power since HA 2025.1. */
export const FAN_FEATURE = { SET_SPEED: 1, OSCILLATE: 2, DIRECTION: 4, PRESET_MODE: 8, TURN_OFF: 16, TURN_ON: 32 } as const;

/** A fan entity id (fan.*). */
export const isFanEntity = (id: unknown): id is string => typeof id === 'string' && /^fan\.[a-z0-9_]+$/.test(id);

/** Unavailable or unknown, or no state at all: "--" and "Unavailable" (P2-CHO-11). */
export const isUnavailable = (s: HassEntity | undefined): boolean => !s || s.state === 'unavailable' || s.state === 'unknown';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The entity's feature bits. */
export const fanFeatures = (e: HassEntity | undefined): number => num(e?.attributes.supported_features) ?? 0;

/** HA's speed count: `round(100 / percentage_step)`, default step 1 (100 speeds). */
export function speedCount(e: HassEntity | undefined): number {
  const step = num(e?.attributes.percentage_step);
  return Math.max(1, Math.round(100 / (step && step > 0 ? step : 1)));
}

// ---- Speed steps (Q4 a variant A, HA fan/__init__.py _async_adjust_speed) ----------------------------------------

/** The step index of a percentage, as HA: `ceil(count * p / 100)`, with the prototype's 9-digit rounding guard. */
export const haIdx = (count: number, p: number): number => Math.ceil(+((count * p) / 100).toFixed(9));

/** The percentage of a step index, as HA: `floor(i * 100 / count)`. */
export const haPct = (count: number, i: number): number => Math.floor((i * 100) / count);

/** Below 100 speeds every value snaps to a step; a fan with 100 or more speeds (or without SET_SPEED) does not. */
export const snaps = (count: number, speed = true): boolean => speed && count < 100;

/**
 * The value a raw pill position (0 to 100) is sent and read as: below 0.5 is off (0); otherwise HA's step nearest to
 * it, `haPct(round(raw / step))` (Q4 a: always snap, no marks), or the rounded value on a fan that does not snap.
 */
export function snapTo(count: number, raw: number, speed = true): number {
  if (raw < 0.5) return 0;
  if (!snaps(count, speed)) return Math.round(Math.min(100, raw));
  return haPct(count, clamp(Math.round(raw / (100 / count)), 0, count));
}

/** Page Up and Page Down move this many steps: `max(1, round(10 / step))`. */
export const pageSteps = (count: number): number => Math.max(1, Math.round(10 / (100 / Math.min(count, 100))));

/**
 * The step index of a percentage for a step: `round(cur / step)` (plan 2.5), moved up one when the next step's
 * percentage is already reached. haPct floors, so from 53 speeds on `round(haPct(i) / step)` can give i - 1 (98 on 99
 * speeds rounds to 97); a step value then maps to HA's own index, and any other value keeps the round rule.
 */
function stepIndex(c: number, cur: number): number {
  let i = Math.round(cur / (100 / c));
  if (i < c && haPct(c, i + 1) <= cur) i++;
  return i;
}

/** The step keys of every speed fan, also 100 or more speeds (1 % steps); see keyStep. */
export function stepKeys(count: number): (cur: number, key: string) => number | undefined {
  const c = Math.min(count, 100);
  const page = pageSteps(count);
  const by = (cur: number, d: number) => haPct(c, clamp(stepIndex(c, cur) + d, 0, c));
  return (cur, key) => {
    switch (key) {
      case 'ArrowUp':
      case 'ArrowRight':
        return by(cur, 1);
      case 'ArrowDown':
      case 'ArrowLeft':
        return by(cur, -1);
      case 'PageUp':
        return by(cur, page);
      case 'PageDown':
        return by(cur, -page);
      case 'Home':
        return haPct(c, 1);
      case 'End':
        return 100;
      default:
        return undefined;
    }
  };
}

/**
 * The core slider `keyStep` of a speed fan below 100 speeds (Q4): arrows one step, Page Up/Down `pageSteps` steps, Home
 * the lowest step, End 100, Down from the lowest step to 0 (off); any other key undefined. A fan with 100 or more
 * speeds gets undefined: the core level keys, exactly as the prototype, which installs its keys only while snapping.
 */
export function keyStep(count: number): ((cur: number, key: string) => number | undefined) | undefined {
  return snaps(count) ? stepKeys(count) : undefined;
}

/**
 * The pill's keyStep for a view. While the percentage is null (a preset, or on without a percentage) the core reads
 * the pill as 1 %; the keys then count from 0 instead: Up gives the lowest step, Home and End as always, and a key
 * that would give 0 does nothing (as the prototype, whose view is off without a percentage), so Down never turns a
 * preset off. The core starts that gesture at 1 % and ignores a key whose value equals it, so a lowest step of 1 % (51
 * speeds or more) goes out as a hair above 1, which snapTo sends as that step.
 */
export function pillKeyStep(v: FanView): ((cur: number, key: string) => number | undefined) | undefined {
  if (v.percentage != null) return keyStep(v.count);
  const keys = stepKeys(v.count);
  return (cur, key) => {
    const next = keys(0, key);
    if (next === 0) return cur;
    return next === cur && next !== undefined ? next + LOWEST_NUDGE : next;
  };
}

/** See pillKeyStep: far below half a step, so snapTo maps 1 + LOWEST_NUDGE to the 1 % step on every speed count. */
const LOWEST_NUDGE = 1e-6;

// ---- State ------------------------------------------------------------------------------------------------------

/**
 * The entity's value for a writer patch key, in patch terms, so echoes match what was sent: `percentage` is 0 while
 * off and null under a preset; `preset_mode` is null while off.
 */
export function stateOf(e: HassEntity, key: string): unknown {
  const a = e.attributes;
  const on = e.state === 'on';
  const preset = on ? str(a.preset_mode) : null;
  switch (key) {
    case 'on':
      return on;
    case 'percentage':
      return !on ? 0 : preset ? null : num(a.percentage);
    case 'preset_mode':
      return preset;
    case 'oscillating':
      return a.oscillating === true;
    default:
      return a[key];
  }
}

/** What every fan card draws: the HA state with the writer's optimistic values (in flight, then pending) on top. */
export interface FanView {
  entityId: string;
  /** The friendly name (the card's `name` option is applied by the card). */
  name: string;
  available: boolean;
  on: boolean;
  features: number;
  /** SET_SPEED: the speed pill; without it the toggle pill (P2-CHO-16). */
  speed: boolean;
  /** Speed count and step size in percent. */
  count: number;
  step: number;
  /** Effective percentage: the held or pending value, else HA's percentage while on without a preset, else null. */
  percentage: number | null;
  /** The active preset (null while off). */
  preset: string | null;
  presets: string[];
  oscillating: boolean;
  reverse: boolean;
  canTurnOn: boolean;
  canTurnOff: boolean;
  /** TURN_ON or TURN_OFF: the power button exists. */
  hasPower: boolean;
  hasOscillate: boolean;
  hasDirection: boolean;
  /** PRESET_MODE and a non-empty preset_modes. */
  hasPresets: boolean;
}

/** The view of `e` with the writer's local values on top. */
export function fanView(e: HassEntity, local: FanPatch = {}): FanView {
  const a = e.attributes;
  const f = fanFeatures(e);
  const has = (bit: number) => (f & bit) !== 0;
  const available = !isUnavailable(e);
  const count = speedCount(e);
  const presets = Array.isArray(a.preset_modes) ? a.preset_modes.filter((p: unknown): p is string => typeof p === 'string' && !!p) : [];
  const haOn = e.state === 'on';
  const haPreset = haOn ? str(a.preset_mode) : null;
  let on = haOn;
  // An off fan's stale percentage is ignored; a preset reads null.
  let percentage = haOn && !haPreset ? num(a.percentage) : null;
  let preset = haPreset;
  if (local.on === false) {
    on = false;
    preset = null;
  } else if (typeof local.percentage === 'number' && !(local.percentage === 0 && local.on === true)) {
    percentage = local.percentage;
    on = percentage > 0;
    preset = null;
  } else if (typeof local.preset_mode === 'string') {
    on = true;
    preset = local.preset_mode;
    percentage = null;
  } else if (local.on === true && !haOn) {
    on = true;
    percentage = null;
    preset = null;
  }
  if (!available) {
    on = false;
    preset = null;
  }
  const direction = local.direction ?? str(a.direction);
  return {
    entityId: e.entity_id,
    name: str(a.friendly_name) ?? e.entity_id,
    available,
    on,
    features: f,
    speed: has(FAN_FEATURE.SET_SPEED),
    count,
    step: 100 / count,
    percentage: on ? percentage : null,
    preset,
    presets,
    oscillating: local.oscillating ?? a.oscillating === true,
    reverse: direction === 'reverse',
    canTurnOn: has(FAN_FEATURE.TURN_ON),
    canTurnOff: has(FAN_FEATURE.TURN_OFF),
    hasPower: has(FAN_FEATURE.TURN_ON) || has(FAN_FEATURE.TURN_OFF),
    hasOscillate: has(FAN_FEATURE.OSCILLATE),
    hasDirection: has(FAN_FEATURE.DIRECTION),
    hasPresets: has(FAN_FEATURE.PRESET_MODE) && presets.length > 0,
  };
}

/** The effective percentage (the prototype's fanPct). */
export const fanPct = (v: FanView): number | null => v.percentage;

/** The fan colour (P2-COL-1): the fan_only neutral as drawn on the glass. */
export const fanColour = (glass: Glass): string => tone(PALETTE.neutral, glass);

/** Power disabled (P2-CHO-1): unavailable, off without TURN_ON, on without TURN_OFF. */
export const powerDisabled = (v: FanView): boolean => !v.available || (v.on ? !v.canTurnOff : !v.canTurnOn);

/** The preset chip disabled: unavailable, or off without TURN_ON (the chip turns the fan on with the preset). */
export const presetDisabled = (v: FanView): boolean => !v.available || (!v.on && !v.canTurnOn);

/** The preset after the active one; wraps to the first after the last (Q5 a). From off or no preset: the first. */
export function nextPreset(v: FanView): string | null {
  if (!v.presets.length) return null;
  const i = v.on && v.preset ? v.presets.indexOf(v.preset) : -1;
  return v.presets[(i + 1) % v.presets.length];
}

/**
 * The tile icon (P2-CHO-8): a fan's icon is its power button ("Switch <name>", aria-pressed), gated as the header
 * power; a fan without TURN_ON and TURN_OFF has a plain icon (`button` false, no tap).
 */
export function fanIconAction(v: FanView): { button: boolean; disabled: boolean; next: boolean; pressed: boolean } {
  return { button: v.hasPower, disabled: !v.hasPower || powerDisabled(v), next: !v.on, pressed: v.on };
}

// ---- Words ------------------------------------------------------------------------------------------------------

type Hass = HomeAssistant | undefined;

/** A preset as shown: HA's translation when it has one, else capitalised (underscores as spaces). */
export function presetLabel(hass: Hass, preset: string, entity?: HassEntity): string {
  const text = entity ? hass?.formatEntityAttributeValue?.(entity, 'preset_mode', preset) : undefined;
  return translated(text, preset) ? text : humanize(preset);
}

const entityOf = (hass: Hass, v: FanView) => hass?.states?.[v.entityId];

/** The subline on the card and tile (the prototype's fanSub): Unavailable, Off, the preset, or On with its options. */
export function fanSub(hass: Hass, v: FanView): string {
  if (!v.available) return t(hass, 'core.unavailable');
  if (!v.on) return t(hass, 'core.off');
  if (v.preset) return presetLabel(hass, v.preset, entityOf(hass, v));
  const osc = v.hasOscillate && v.oscillating;
  const rev = v.hasDirection && v.reverse;
  return t(hass, osc && rev ? 'fan.sub.onOscillatingReverse' : osc ? 'fan.sub.onOscillating' : rev ? 'fan.sub.onReverse' : 'fan.sub.on');
}

/** The badge value (P2-CHO-10): Unavailable, Off, the preset, the percentage on a speed fan, else On. */
export function fanBadge(hass: Hass, v: FanView): string {
  if (!v.available) return t(hass, 'core.unavailable');
  if (!v.on) return t(hass, 'core.off');
  if (v.preset) return presetLabel(hass, v.preset, entityOf(hass, v));
  return v.speed && v.percentage != null ? t(hass, 'core.percent', { value: Math.round(v.percentage) }) : t(hass, 'fan.readout.on');
}

/** The card readout (P2-CHO-13, 14): the big value, its unit and the label under it. */
export interface FanReadout {
  big: string;
  unit: string;
  label: string;
}

/**
 * The readout words. Speed pill: the percentage, Off, "--", or the preset with label "Preset". Toggle pill: On, Off,
 * "--" or the preset, label "Tap to switch" (P2-CHO-16). While a pill gesture runs the view carries the snapped pending
 * step (Q8 a), so the readout shows it.
 */
export function fanReadout(hass: Hass, v: FanView): FanReadout {
  const preset = v.preset ? presetLabel(hass, v.preset, entityOf(hass, v)) : null;
  if (!v.speed) {
    const label = t(hass, preset ? 'fan.readout.preset' : 'fan.readout.tap');
    const big = !v.available ? '--' : !v.on ? t(hass, 'core.off') : (preset ?? t(hass, 'fan.readout.on'));
    return { big, unit: '', label };
  }
  const speed = t(hass, 'fan.readout.speed');
  if (!v.available) return { big: '--', unit: '', label: speed };
  if (!v.on) return { big: t(hass, 'core.off'), unit: '', label: speed };
  if (preset) return { big: preset, unit: '', label: t(hass, 'fan.readout.preset') };
  if (v.percentage == null) return { big: t(hass, 'fan.readout.on'), unit: '', label: speed };
  return { big: String(Math.round(v.percentage)), unit: '%', label: speed };
}

// ---- Tile and room steps (Q7 b, P2-CHO-9) ------------------------------------------------------------------------

/**
 * The percentage one Slower (-1) or Faster (+1) press leads to: `haPct(clamp(round(base / step) + dir, 0, count))`,
 * with the step index of stepIndex.
 * The base is the view's percentage (it already carries the pending step and the hold), else 0 under a preset. Steps
 * go out as `set_percentage`, never increase_speed or decrease_speed.
 */
export function stepTarget(v: FanView, dir: 1 | -1): number {
  const c = Math.min(v.count, 100);
  return haPct(c, clamp(stepIndex(c, v.percentage ?? 0) + dir, 0, c));
}

/** What the tile and room steps show (the prototype's stepState, fan branch). */
export interface FanStepState {
  /** Steps exist only on a speed fan (hidden on toggle fans). */
  show: boolean;
  minusDisabled: boolean;
  plusDisabled: boolean;
  /** The value between the steps: the percentage, or "--" (off, preset, unavailable). */
  text: string;
  /** i18n keys of the step labels ("Slower", "Faster"). */
  minusKey: string;
  plusKey: string;
}

/**
 * Minus is disabled at the lowest step, while the percentage is null (a preset) and while off; plus while off and at
 * 100 (plus under a preset leaves it at the lowest step).
 */
export function stepState(hass: Hass, v: FanView): FanStepState {
  const p = v.percentage;
  const lowest = haPct(Math.min(v.count, 100), 1);
  return {
    show: v.speed,
    minusDisabled: !v.available || !v.on || p == null || p <= lowest,
    plusDisabled: !v.available || !v.on || (p != null && p >= 100),
    text: !v.available || !v.on || p == null ? '--' : t(hass, 'core.percent', { value: Math.round(p) }),
    minusKey: 'fan.step.slower',
    plusKey: 'fan.step.faster',
  };
}

// ---- Patches ----------------------------------------------------------------------------------------------------

/** A speed in percent (0 is off, sent on release while held). Clears a pending preset and power change. */
export const percentPatch = (p: number): FanPatch => ({ percentage: Math.max(0, Math.min(100, Math.round(p))), preset_mode: undefined, on: undefined });

/** A preset (turn_on with the preset while off). Clears a pending speed and power change. */
export const presetPatch = (preset: string): FanPatch => ({ preset_mode: preset, percentage: undefined, on: undefined });

/** Power: on restores the fan as HA has it, off turns it off. Clears a pending speed and preset. */
export const powerPatch = (on: boolean): FanPatch => ({ on, percentage: undefined, preset_mode: undefined });
