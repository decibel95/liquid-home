import { PALETTE, tone, type HassEntity, type ICONS } from '@decibel95/liquid-core';
import { t } from '../i18n';

/**
 * The cover domain of Liquid Home: how every card (cover card, tile, badge, room strip) reads a cover. The rules are
 * the gate 2 prototype's (`canOpen`, `canClose`, `coverSub`, `coverTileSub`, `coverBadge`, `iconAction`, `iconLabel`,
 * `stepBy`, `stepState`), adapted to what Home Assistant reports (no target attribute, no tilt moving state). Nothing
 * here writes; writer.ts holds the calls.
 */

type Hass = Parameters<typeof t>[0];

/** CoverEntityFeature bits. Unknown bits (256, 1024, ...) are tolerated and ignored. */
export const COVER_BITS = {
  OPEN: 1,
  CLOSE: 2,
  SET_POSITION: 4,
  STOP: 8,
  OPEN_TILT: 16,
  CLOSE_TILT: 32,
  STOP_TILT: 64,
  SET_TILT_POSITION: 128,
} as const;

const POSITION_BITS = COVER_BITS.OPEN | COVER_BITS.CLOSE | COVER_BITS.SET_POSITION | COVER_BITS.STOP;
const TILT_BITS = COVER_BITS.OPEN_TILT | COVER_BITS.CLOSE_TILT | COVER_BITS.STOP_TILT | COVER_BITS.SET_TILT_POSITION;

/**
 * - `position`: SET_POSITION, no tilt bits: the position pill.
 * - `positionTilt`: SET_POSITION and tilt bits: the pill with Position and Tilt mode buttons (P2-CHO-2).
 * - `tilt`: tilt bits only (none of OPEN, CLOSE, SET_POSITION, STOP): the pill shows tilt, no mode buttons (P2-CHO-3).
 * - `toggle`: no position and not tilt-only: the toggle pill (P2-CHO-4).
 */
export type CoverKind = 'position' | 'positionTilt' | 'tilt' | 'toggle';
/** The pill mode of a cover card: card-local, default Position. */
export type CoverMode = 'position' | 'tilt';
/** The writer keys: what the card wants HA to report as `current_position` and `current_tilt_position`. */
export type CoverKey = 'position' | 'tilt_position';
/** Discrete cover services, sent at once (they end every hold and pending step of the entity). */
export type CoverAction =
  | 'open_cover'
  | 'close_cover'
  | 'stop_cover'
  | 'toggle'
  | 'open_cover_tilt'
  | 'close_cover_tilt'
  | 'stop_cover_tilt'
  | 'toggle_cover_tilt';
/** A button of the Open, Stop, Close row. */
export type RowButton = 'open' | 'stop' | 'close';

/** One tap on a tile or room step moves a cover by this many percent (Q2 a). */
export const COVER_STEP_PCT = 10;

/** A cover entity id (cover.*). */
export const isCoverEntity = (id: unknown): id is string => typeof id === 'string' && /^cover\.[a-z0-9_]+$/.test(id);

/** Unavailable or unknown, or no state at all: "--" and "Unavailable" (P2-CHO-11, CHO-11 of 0.1). */
export const isCoverUnavailable = (s: HassEntity | undefined): boolean => !s || s.state === 'unavailable' || s.state === 'unknown';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const coverFeatures = (s: HassEntity | undefined): number => num(s?.attributes.supported_features) ?? 0;
export const hasBit = (s: HassEntity | undefined, bit: number): boolean => (coverFeatures(s) & bit) !== 0;

export const hasTiltBits = (s: HassEntity | undefined): boolean => (coverFeatures(s) & TILT_BITS) !== 0;
export const isTiltOnly = (s: HassEntity | undefined): boolean => hasTiltBits(s) && (coverFeatures(s) & POSITION_BITS) === 0;
export const hasPositionBit = (s: HassEntity | undefined): boolean => hasBit(s, COVER_BITS.SET_POSITION);
/** No SET_POSITION and not tilt-only: the toggle pill (P2-CHO-4). */
export const isToggleCover = (s: HassEntity | undefined): boolean => !hasPositionBit(s) && !isTiltOnly(s);
/** Tilt bits beside the position bits: Position and Tilt mode buttons switch the pill and the row (P2-CHO-2, the prototype's bothMode). */
export const hasModeButtons = (s: HassEntity | undefined): boolean => hasTiltBits(s) && !isTiltOnly(s);

export function coverKind(s: HassEntity | undefined): CoverKind {
  if (isTiltOnly(s)) return 'tilt';
  if (isToggleCover(s)) return 'toggle';
  return hasTiltBits(s) ? 'positionTilt' : 'position';
}

/** The pill mode in use: tilt on a tilt-only cover, the picked mode where the mode buttons show, else position. */
export function coverMode(s: HassEntity | undefined, picked: CoverMode = 'position'): CoverMode {
  if (isTiltOnly(s)) return 'tilt';
  return hasModeButtons(s) ? picked : 'position';
}

export const keyOf = (mode: CoverMode): CoverKey => (mode === 'tilt' ? 'tilt_position' : 'position');

/** HA reports a cover moving only as the states `opening` and `closing`; tilt has no moving state. */
export const isMoving = (s: HassEntity | undefined): boolean => s?.state === 'opening' || s?.state === 'closing';

export const positionOf = (s: HassEntity | undefined): number | null => num(s?.attributes.current_position);
export const tiltOf = (s: HassEntity | undefined): number | null => num(s?.attributes.current_tilt_position);

/** The entity's value for a writer key (writer.ts): `current_position` and `current_tilt_position`. */
export function coverStateOf(s: HassEntity, key: string): unknown {
  if (key === 'position') return positionOf(s);
  if (key === 'tilt_position') return tiltOf(s);
  return s.attributes[key];
}

/** Open, opening or closing: tinted on the tile and badge, the header icon in the neutral (P2-CHO-10, 22). */
export const isCoverActive = (s: HassEntity | undefined): boolean => !isCoverUnavailable(s) && (s!.state === 'open' || isMoving(s));

const assumed = (s: HassEntity): boolean => s.attributes.assumed_state === true;

/**
 * HA frontend canOpen: false when unavailable; otherwise true with assumed_state (P2-CHO-5), else not fully open and
 * not opening. Fully open is position 100 when the cover reports a position, else the state `open`.
 */
export function canOpen(s: HassEntity | undefined): boolean {
  if (isCoverUnavailable(s)) return false;
  if (assumed(s!)) return true;
  const p = positionOf(s);
  return (p !== null ? p !== 100 : s!.state !== 'open') && s!.state !== 'opening';
}

/** HA frontend canClose, the mirror of canOpen. */
export function canClose(s: HassEntity | undefined): boolean {
  if (isCoverUnavailable(s)) return false;
  if (assumed(s!)) return true;
  const p = positionOf(s);
  return (p !== null ? p !== 0 : s!.state !== 'closed') && s!.state !== 'closing';
}

/** Tilt Open is disabled at tilt 100 (HA canOpenTilt), never for assumed_state. */
export const canOpenTilt = (s: HassEntity | undefined): boolean => !isCoverUnavailable(s) && (assumed(s!) || tiltOf(s) !== 100);
/** Tilt Close is disabled at tilt 0 (HA canCloseTilt), never for assumed_state. */
export const canCloseTilt = (s: HassEntity | undefined): boolean => !isCoverUnavailable(s) && (assumed(s!) || tiltOf(s) !== 0);

/** One button of the Open, Stop, Close row. */
export interface RowAction {
  button: RowButton;
  action: CoverAction;
  /** Only with its feature bit (P2-CHO-5). */
  visible: boolean;
  /** Disabled at DISABLED_OPACITY per HA canOpen and canClose. */
  disabled: boolean;
  /** Stop while the cover moves: the active tint (no aria-pressed). */
  active: boolean;
  /** i18n key of the label: "Open", or "Open tilt" in tilt mode (Q1 b). */
  label: string;
}

const ROW: Record<CoverMode, Record<RowButton, { action: CoverAction; bit: number; label: string }>> = {
  position: {
    open: { action: 'open_cover', bit: COVER_BITS.OPEN, label: 'cover.action.open' },
    stop: { action: 'stop_cover', bit: COVER_BITS.STOP, label: 'cover.action.stop' },
    close: { action: 'close_cover', bit: COVER_BITS.CLOSE, label: 'cover.action.close' },
  },
  tilt: {
    open: { action: 'open_cover_tilt', bit: COVER_BITS.OPEN_TILT, label: 'cover.action.openTilt' },
    stop: { action: 'stop_cover_tilt', bit: COVER_BITS.STOP_TILT, label: 'cover.action.stopTilt' },
    close: { action: 'close_cover_tilt', bit: COVER_BITS.CLOSE_TILT, label: 'cover.action.closeTilt' },
  },
};

/** The row in `mode` (P2-CHO-2, 5; Q1 b). Tilt has no moving state in HA, so Stop tilt is never tinted. */
export function rowActions(s: HassEntity | undefined, mode: CoverMode): RowAction[] {
  const un = isCoverUnavailable(s);
  return (['open', 'stop', 'close'] as const).map((button) => {
    const r = ROW[mode][button];
    let disabled = un;
    if (!disabled && button === 'open') disabled = mode === 'tilt' ? !canOpenTilt(s) : !canOpen(s);
    if (!disabled && button === 'close') disabled = mode === 'tilt' ? !canCloseTilt(s) : !canClose(s);
    return { button, action: r.action, visible: hasBit(s, r.bit), disabled, active: button === 'stop' && !disabled && mode === 'position' && isMoving(s), label: r.label };
  });
}

/** Q3 b: a toggle cover without STOP (the garage) hides the row; so does a row with no button at all. */
export const rowHidden = (s: HassEntity | undefined, mode: CoverMode): boolean =>
  (isToggleCover(s) && !hasBit(s, COVER_BITS.STOP)) || !rowActions(s, mode).some((a) => a.visible);

/**
 * The toggle pill (P2-CHO-4): only with OPEN and CLOSE; while moving it is full and a tap stops (`cover.toggle`,
 * which needs STOP); without STOP it is disabled while moving.
 */
export const togglePillUsable = (s: HassEntity | undefined): boolean =>
  !isCoverUnavailable(s) && hasBit(s, COVER_BITS.OPEN) && hasBit(s, COVER_BITS.CLOSE) && (!isMoving(s) || hasBit(s, COVER_BITS.STOP));

/** The pill in `mode` can set a value: SET_POSITION, or SET_TILT_POSITION in tilt mode. */
export const pillSettable = (s: HassEntity | undefined, mode: CoverMode): boolean =>
  !isCoverUnavailable(s) && hasBit(s, mode === 'tilt' ? COVER_BITS.SET_TILT_POSITION : COVER_BITS.SET_POSITION);

/** The state word as an i18n key: Open, Closed, Opening, Closing, or core Unavailable. */
export function coverStateKey(s: HassEntity | undefined): string {
  if (isCoverUnavailable(s)) return 'core.unavailable';
  if (s!.state === 'opening') return 'cover.state.opening';
  if (s!.state === 'closing') return 'cover.state.closing';
  return s!.state === 'open' ? 'cover.state.open' : 'cover.state.closed';
}

/** Card subline (prototype coverSub): Unavailable, Opening, Closing, Open, Closed. */
export const coverSub = (hass: Hass, s: HassEntity | undefined): string => t(hass, coverStateKey(s));

/** Tile subline (prototype coverTileSub): the card subline plus the tilt, when the cover reports one. */
export function coverTileSub(hass: Hass, s: HassEntity | undefined): string {
  const sub = coverSub(hass, s);
  const tilt = tiltOf(s);
  return !isCoverUnavailable(s) && tilt !== null ? t(hass, 'cover.sub.tilt', { state: sub, value: t(hass, 'core.percent', { value: Math.round(tilt) }) }) : sub;
}

/** Badge value (prototype coverBadge, P2-CHO-10): Unavailable, Opening, Closing, 70%, Closed, Open. */
export function coverBadge(hass: Hass, s: HassEntity | undefined): string {
  if (isCoverUnavailable(s) || isMoving(s)) return coverSub(hass, s);
  const p = positionOf(s);
  if (hasPositionBit(s) && p !== null) return p === 0 ? t(hass, 'cover.state.closed') : t(hass, 'core.percent', { value: Math.round(p) });
  return coverSub(hass, s);
}

/** The device glyph (P2-CHO-7): `door` for the door, garage and gate classes, `blinds` for every other cover. */
export const coverGlyph = (s: HassEntity | undefined): keyof typeof ICONS =>
  ['door', 'garage', 'gate'].includes(String(s?.attributes.device_class)) ? 'door' : 'blinds';

/** The header icon state (plan 2.8): open, opening and closing in the neutral, closed quiet, unavailable dimmed. */
export const coverIconState = (s: HassEntity | undefined): 'active' | 'inactive' | 'unavailable' =>
  isCoverUnavailable(s) ? 'unavailable' : isCoverActive(s) ? 'active' : 'inactive';

/** P2-COL-1: covers draw the fan_only neutral only (TOK-14, tone(PALETTE.neutral)) for fill, tints and active buttons. */
export const coverColour = (glass: 'dark' | 'light'): string => tone(PALETTE.neutral, glass);

/** What the tile icon does (P2-CHO-8, D-15). */
export interface IconAction {
  /** Toggle, toggle tilt, or a Stop button; the icon is always a button, so nothing appears or disappears. */
  kind: 'toggle' | 'toggleTilt' | 'stop';
  /** The service a tap sends, or null while the button is disabled. */
  action: CoverAction | null;
  disabled: boolean;
  /** i18n key of the aria label ("Toggle, <name>", "Toggle tilt, <name>", "Stop, <name>"); no aria-pressed on covers. */
  label: string;
}

/**
 * The tile icon (prototype iconAction and iconLabel, P2-CHO-8, D-15): a tilt-only cover with OPEN_TILT and
 * CLOSE_TILT toggles the tilt; a cover with OPEN and CLOSE toggles, and while moving it is Stop (needs STOP, else
 * disabled); any other cover gets a Stop button, enabled only while moving with STOP.
 */
export function iconAction(s: HassEntity | undefined): IconAction {
  const un = isCoverUnavailable(s);
  const stop = (): IconAction => {
    const ok = !un && isMoving(s) && hasBit(s, COVER_BITS.STOP);
    return { kind: 'stop', action: ok ? 'stop_cover' : null, disabled: !ok, label: 'cover.aria.stop' };
  };
  if (isTiltOnly(s)) {
    if (!hasBit(s, COVER_BITS.OPEN_TILT) || !hasBit(s, COVER_BITS.CLOSE_TILT)) return stop();
    return { kind: 'toggleTilt', action: un ? null : 'toggle_cover_tilt', disabled: un, label: 'cover.aria.toggleTilt' };
  }
  if (!hasBit(s, COVER_BITS.OPEN) || !hasBit(s, COVER_BITS.CLOSE) || isMoving(s)) return stop();
  return { kind: 'toggle', action: un ? null : 'toggle', disabled: un, label: 'cover.aria.toggle' };
}

/** The tile icon's aria label with the name filled in. */
export const iconLabel = (hass: Hass, s: HassEntity | undefined, name: string): string => t(hass, iconAction(s).label, { name });

// ---- Steps (tile and room strip, Q2 a) -----------------------------------------

/** Tile and room steps show on a positioned cover and on a tilt-only cover that sets its tilt; hidden on toggle covers. */
export const stepsShown = (s: HassEntity | undefined): boolean => hasPositionBit(s) || (isTiltOnly(s) && hasBit(s, COVER_BITS.SET_TILT_POSITION));

/** Tilt-only covers step the tilt, every other cover the position. */
export const stepKey = (s: HassEntity | undefined): CoverKey => (isTiltOnly(s) ? 'tilt_position' : 'position');

/** The next step from `base`: rounded to 10, then plus or minus 10, clamped 0 to 100 (prototype stepBy). */
export const nextStep = (base: number, dir: 1 | -1): number =>
  Math.max(0, Math.min(100, Math.round(base / COVER_STEP_PCT) * COVER_STEP_PCT + dir * COVER_STEP_PCT));

/** What a tile or room strip draws for the steps (prototype stepState): a pending step shows as the value. */
export interface StepState {
  show: boolean;
  key: CoverKey;
  /** The pending step, else the cover's value; null when unknown. */
  value: number | null;
  minusDisabled: boolean;
  plusDisabled: boolean;
  /** i18n keys: "Close 10%" and "Open 10%", or the tilt forms. */
  minusLabel: string;
  plusLabel: string;
}

/** `pending` is the writer's pending change (`writer.queue.pending`). */
export function stepState(s: HassEntity | undefined, pending: { position?: number; tilt_position?: number } = {}): StepState {
  const key = stepKey(s);
  const un = isCoverUnavailable(s);
  const p = pending[key];
  const value = typeof p === 'number' ? p : s ? (coverStateOf(s, key) as number | null) : null;
  const tilt = key === 'tilt_position';
  return {
    show: stepsShown(s),
    key,
    value,
    minusDisabled: un || value === 0,
    plusDisabled: un || value === 100,
    minusLabel: tilt ? 'cover.step.closeTilt' : 'cover.step.close',
    plusLabel: tilt ? 'cover.step.openTilt' : 'cover.step.open',
  };
}
