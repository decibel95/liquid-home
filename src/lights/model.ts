import { brightnessPercent, entityColour, hsvToRgb, levelPercent, PALETTE, SPECTRUM, STATUS_COLORS, tone, type HassEntity, type Rgb } from '@decibel95/liquid-core';
import type { LightPatch } from './writer';

/**
 * The light domain of Liquid Home: how every card (light card, tile, badge, room card) reads a light. One view of a
 * light state with the shared writer's optimistic values on top, the lamp colour (COL-1), groups, on/off-only lights,
 * the percent mapping and the unavailable state. Nothing here writes; writer.ts holds the calls.
 */

export type Glass = 'dark' | 'light';

export type LightMode = 'brightness' | 'white' | 'colour';

/** The pill modes in their fixed order (TOK-22, CHO-21). */
export const LIGHT_MODES: readonly LightMode[] = ['brightness', 'white', 'colour'];

/** One tap on a tile or room step button moves the brightness by this many percent (the approved prototype's step). */
export const STEP_PCT = 10;

/** A light entity id (light.*), as the cards accept in `entity`, `entities` and `power_entity`. */
export const isLightEntity = (id: unknown): id is string => typeof id === 'string' && /^light\.[a-z0-9_]+$/.test(id);

/** Unavailable or unknown, or no state at all: the card shows "--" and "Unavailable" (CHO-11). */
export const isUnavailable = (s: HassEntity | undefined): boolean => !s || s.state === 'unavailable' || s.state === 'unknown';

/** Colour modes in which HA reports a lamp colour (CHO-5: rgb_color in every one of them). */
export const COLOUR_MODES = ['hs', 'rgb', 'xy', 'rgbw', 'rgbww'];

/** What the light card draws for one light: the HA state with the writer's optimistic values on top. */
export interface LightView {
  entityId: string;
  /** The entity's friendly name (the card's `name` option is applied by the card). */
  name: string;
  available: boolean;
  on: boolean;
  /** A light group (an `entity_id` list): neutral colour, no mode buttons, member chips (CHO-4). */
  group: boolean;
  members: string[];
  /** supported_color_modes is [onoff] only: the toggle pill (TOK-8, Q6). */
  onoff: boolean;
  supportsWhite: boolean;
  supportsColour: boolean;
  /** Brightness 0 to 100, unrounded; 0 while off. */
  pct: number;
  /** The level as the cards print it: integer percent 1 to 100 while on (CHO-8: never 0 while on), else null (off, on/off-only). */
  level: number | null;
  /** Colour temperature, only while the light is in color_temp mode. */
  kelvin: number | null;
  /** Hue and saturation as HA reports them (also derived in color_temp mode), or the colour sent. */
  hs: [number, number] | null;
  /** The lamp colour (HA's rgb_color, or the colour sent). */
  rgb: Rgb | null;
  colorMode: string | null;
  minKelvin: number;
  maxKelvin: number;
  effectList: string[];
  effect: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1]] : null;
const triple = (v: unknown): Rgb | null =>
  Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null;

/** Brightness percent of the last time each light was seen on, so a power-on shows a level until HA reports one. */
const lastOn = new Map<string, number>();

export function supportedModes(e: HassEntity): string[] {
  const m = e.attributes.supported_color_modes;
  return Array.isArray(m) ? m.filter((x): x is string => typeof x === 'string') : [];
}

/** A light group (core group or a light group helper) lists its members in `entity_id`. */
export const isGroup = (e: HassEntity | undefined): boolean => Array.isArray(e?.attributes.entity_id) && e!.attributes.entity_id.length > 0;

/** The members of a group, as entity ids (empty for a single light). */
export const groupMembers = (e: HassEntity | undefined): string[] =>
  isGroup(e) ? (e!.attributes.entity_id as unknown[]).filter((id): id is string => typeof id === 'string') : [];

/** Only on and off: every supported colour mode is `onoff` (TOK-8; CHO-10 hides the step buttons). */
export function isOnOffOnly(e: HassEntity | undefined): boolean {
  const modes = e ? supportedModes(e) : [];
  return modes.length > 0 && modes.every((m) => m === 'onoff');
}

/** The entity's value for a writer patch key, in patch terms (see writer.ts). */
export function stateOf(e: HassEntity, key: string): unknown {
  const a = e.attributes;
  const on = e.state === 'on';
  switch (key) {
    case 'on':
      return on;
    case 'brightness_pct': {
      const b = num(a.brightness);
      return on && b !== null ? Math.round(b / 2.55) : 0;
    }
    case 'color_temp_kelvin':
      return on && a.color_mode === 'color_temp' ? num(a.color_temp_kelvin) : null;
    case 'hs_color':
      return on && COLOUR_MODES.includes(a.color_mode) ? pair(a.hs_color) : null;
    case 'effect':
      return typeof a.effect === 'string' ? a.effect : null;
    default:
      return a[key];
  }
}

/** The view of `e` with the writer's local values (in flight, then pending) on top. */
export function lightView(e: HassEntity, local: LightPatch = {}): LightView {
  const a = e.attributes;
  const modes = supportedModes(e);
  const group = isGroup(e);
  const available = !isUnavailable(e);
  // A group can be on/off only too (all members switch only): it gets the toggle, and keeps its member chips.
  const onoff = isOnOffOnly(e);
  const stateOn = e.state === 'on';
  const on = available && (local.on !== undefined ? local.on : stateOn);
  const reported = num(a.brightness);
  if (stateOn && reported !== null && reported > 0) lastOn.set(e.entity_id, brightnessPercent(reported));
  let pct = 0;
  if (on) {
    if (local.brightness_pct !== undefined) pct = local.brightness_pct;
    else if (stateOn && reported !== null) pct = brightnessPercent(reported);
    else pct = lastOn.get(e.entity_id) ?? 100;
  }
  let colorMode: string | null = typeof a.color_mode === 'string' ? a.color_mode : null;
  let kelvin = stateOn && colorMode === 'color_temp' ? num(a.color_temp_kelvin) : null;
  let hs = pair(a.hs_color);
  let rgb = triple(a.rgb_color);
  if (local.color_temp_kelvin != null) {
    kelvin = local.color_temp_kelvin;
    colorMode = 'color_temp';
  }
  if (local.hs_color != null) {
    hs = local.hs_color;
    rgb = hsvToRgb(hs[0], hs[1] / 100, 1);
    colorMode = COLOUR_MODES.includes(colorMode ?? '') ? colorMode : 'hs';
    // A colour and a colour temperature are never both local: each patch clears the other.
    kelvin = null;
  }
  const effectList = Array.isArray(a.effect_list) ? a.effect_list.filter((x: unknown): x is string => typeof x === 'string') : [];
  const effect = local.effect !== undefined ? local.effect : typeof a.effect === 'string' ? a.effect : null;
  return {
    entityId: e.entity_id,
    name: typeof a.friendly_name === 'string' && a.friendly_name ? a.friendly_name : e.entity_id,
    available,
    on,
    group,
    members: groupMembers(e),
    onoff,
    // White needs a real colour temperature range; an empty one (min == max) hides it.
    supportsWhite: modes.includes('color_temp') && (num(a.max_color_temp_kelvin) ?? SPECTRUM.kelvinMax) > (num(a.min_color_temp_kelvin) ?? SPECTRUM.kelvinMin),
    supportsColour: modes.some((m) => COLOUR_MODES.includes(m)),
    pct,
    level: on && !onoff ? levelPercent(pct, true) : null,
    kelvin,
    hs,
    rgb,
    colorMode,
    minKelvin: num(a.min_color_temp_kelvin) ?? SPECTRUM.kelvinMin,
    maxKelvin: num(a.max_color_temp_kelvin) ?? SPECTRUM.kelvinMax,
    effectList,
    effect,
  };
}

/**
 * The colour a light is drawn in (COL-1): the entity colour for a light in an hs, rgb or xy colour mode (CHO-5,
 * through core entityColour, never the raw lamp colour); the neutral for colour temperature (CHO-1 option B),
 * brightness-only and on/off-only lights and every group (CHO-4).
 */
export function colourOf(v: LightView, glass: Glass): string {
  const neutral = neutralColour(glass);
  if (v.group || v.onoff || !v.supportsColour || !v.rgb || !v.colorMode || !COLOUR_MODES.includes(v.colorMode)) return neutral;
  return entityColour(v.rgb, glass).hex;
}

/** The neutral (TOK-14), tone(PALETTE.neutral): colour temperature, brightness-only, on/off-only lights and groups. */
export const neutralColour = (glass: Glass): string => tone(PALETTE.neutral, glass);

/** Status off grey (CHO-11, as the climate badge), as drawn on the glass: off and unavailable on the badge. */
export const offColour = (glass: Glass): string => tone(STATUS_COLORS.off, glass);

/** How many members of a group are on, from the page's states ("2 of 3 on"). */
export const membersOn = (states: Record<string, HassEntity | undefined>, v: LightView): number => v.members.filter((id) => states[id]?.state === 'on').length;

/**
 * The pill modes this light offers, in order (TOK-22): Brightness always, White and Colour when supported and
 * configured. A group has Brightness only (the prototype); an on/off-only light none (it gets the toggle).
 */
export function modesFor(v: LightView, configured?: readonly LightMode[]): LightMode[] {
  if (v.onoff) return [];
  if (v.group) return ['brightness'];
  const allowed = LIGHT_MODES.filter((m) => (m === 'white' ? v.supportsWhite : m === 'colour' ? v.supportsColour : true));
  const picked = configured ? allowed.filter((m) => configured.includes(m)) : allowed;
  return picked.length ? picked : ['brightness'];
}

/** Position 0 to 100 along the pill for a mode (the prototype's posOf). */
export function positionOf(v: LightView, mode: LightMode): number {
  if (mode === 'brightness') return v.pct;
  if (!v.on) return 0;
  if (mode === 'white') {
    const range = v.maxKelvin - v.minKelvin;
    return v.kelvin !== null && range > 0 ? Math.max(0, Math.min(100, ((v.kelvin - v.minKelvin) / range) * 100)) : 0;
  }
  return v.hs ? v.hs[0] / 3.6 : 0;
}

/** Kelvin at a White pill position. */
export const kelvinAt = (v: LightView, pos: number): number => Math.round(v.minKelvin + (pos / 100) * (v.maxKelvin - v.minKelvin));

/** Hue at a Colour pill position, as the prototype sends it (0 to 360, 360 kept). */
export const hueAt = (pos: number): number => Math.round(pos * 3.6) % 361;

/** Everything a turn-off clears, so a later turn-on does not resend an older pending value. */
const CLEAR: LightPatch = { brightness_pct: undefined, color_temp_kelvin: undefined, hs_color: undefined, effect: undefined };

/** Power: on restores the light as HA has it, off turns it off. */
export const powerPatch = (on: boolean): LightPatch => ({ ...CLEAR, on });

/** A brightness in percent: an integer 1 to 100 turns the light on at that level, under 0.5 turns it off (sent on release). */
export const brightnessPatch = (pct: number): LightPatch => {
  const p = Math.max(0, Math.min(100, pct));
  return p < 0.5 ? powerPatch(false) : { on: true, brightness_pct: Math.max(1, Math.round(p)) };
};

/** The level one step button press leads to (STEP_PCT, between 1 and 100), or null when the light cannot step. */
export function stepLevel(v: LightView, dir: 1 | -1): number | null {
  if (!v.available || v.level === null) return null;
  const next = Math.min(100, Math.max(1, v.level + dir * STEP_PCT));
  return next === v.level ? null : next;
}

/**
 * The writer patch for a pill position in a mode (gate 2 payloads, plan 2.5):
 * Brightness sends `brightness_pct` as an integer, 0 is off (turn_off, sent on release); White sends
 * `color_temp_kelvin`; Colour sends `hs_color` [hue, the light's saturation or 100], exactly as the prototype.
 */
export function patchFor(v: LightView, mode: LightMode, pos: number): LightPatch {
  const p = Math.max(0, Math.min(100, pos));
  if (mode === 'brightness') return brightnessPatch(p);
  if (mode === 'white') return { on: true, color_temp_kelvin: kelvinAt(v, p), hs_color: undefined };
  return { on: true, hs_color: [hueAt(p), Math.round(v.hs ? v.hs[1] : 100)], color_temp_kelvin: undefined };
}
