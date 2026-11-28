import type { HassEntity, HomeAssistant, SharedWriter, WriterRegistry } from '@decibel95/liquid-core';

/**
 * The media domain contract of Liquid Home 0.4 (plan 2.4). H1 implements it in src/media/ (model, writer, clock); H2
 * (card), H3 (sheet), H4 (tile and badge) and H5 (room) build against these types only. The interface is stable: a
 * change needs the orchestrator, because four pieces compile against it in parallel.
 *
 * Rules that hold for every view: every attribute of a media player may be missing (an `off` player reports almost
 * none), so every field here is a plain value or an explicit `null`, never `undefined`; text fields are untranslated
 * data (the views translate state words through t()); nothing here reads the clock or the DOM.
 */

/** `MediaPlayerEntityFeature` bits as verified on the test HA. Unknown bits are tolerated and ignored. */
export const MEDIA_FEATURE = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  VOLUME_STEP: 1024,
  SELECT_SOURCE: 2048,
  STOP: 4096,
  PLAY: 16384,
  SHUFFLE_SET: 32768,
  SELECT_SOUND_MODE: 65536,
  REPEAT_SET: 262144,
  GROUPING: 524288,
} as const;

/** The media player states HA reports, `unavailable` and `unknown` included. A missing entity is read as `unavailable`. */
export type MediaState = 'playing' | 'paused' | 'buffering' | 'idle' | 'standby' | 'on' | 'off' | 'unavailable' | 'unknown';

/**
 * How the player is controlled (plan 2.4 "Kinds"), decided by the feature bits:
 * - `onoff`: TURN_ON and/or TURN_OFF and no transport and no volume bits (toggle pill, P3-CHO-8).
 * - `volume`: VOLUME_SET (the pill).
 * - `step`: VOLUME_STEP without VOLUME_SET (two step buttons, P3-CHO-7).
 * - `none`: no volume at all (no pill, no readout).
 */
export type MediaVolumeKind = 'onoff' | 'volume' | 'step' | 'none';

/** HA's repeat attribute. Anything else HA reports is read as `off`. */
export type MediaRepeat = 'off' | 'all' | 'one';

/** Whether the value is what HA reports or what the card sent and still waits for (hold, see MediaPending). */
export type MediaOrigin = 'ha' | 'pending';

/** One line of the now playing block (plan 2.4, P3-CHO-5). `null` when the line is empty. */
export interface MediaNowPlaying {
  /** `media_title` cleaned as HA's `cleanupMediaTitle`; `null` means "Nothing playing" (idle, standby) or no title. */
  title: string | null;
  /** Second line by `media_content_type` as HA's `computeMediaDescription`; the episode form is built by the view with `media.now.episode` from `episode`. */
  secondary: string | null;
  /** Set for `tvshow` content: the pieces of "{series}, S{season} E{episode}" when `media_series_title` is present. */
  episode: { series: string; season: number; episode: number } | null;
  /** Third line: `app_name`, else `source`; `null` when neither exists. */
  tertiary: string | null;
}

/** Playback position (GD3). `null` as a whole when there is no duration or no position (no line, no times). */
export interface MediaPosition {
  /** Seconds, extrapolated while playing, clamped to 0..duration. */
  seconds: number;
  /** `media_duration`, seconds, greater than 0. */
  duration: number;
  /** True while the shown position is a held seek target that HA has not confirmed yet. */
  held: boolean;
}

/** What the card sent and still waits for. Readable by every view so tile, strip and card agree. */
export interface MediaPending {
  /** Volume 0..100 sent and not yet reported, else `null`. */
  volume: number | null;
  /** Seek target in seconds sent and not yet reported, else `null`. */
  position: number | null;
  /** Epoch ms when that seek was sent, else `null`; the pure `mediaView` extrapolates the held position from it while playing (plan 2.4 seek hold). */
  positionAt: number | null;
  /** Optimistic play/pause target (`playing` or `paused`) until HA reports it, else `null`. */
  state: 'playing' | 'paused' | null;
  /** True after next or previous until the track changes (the card shows "Buffering", position frozen). */
  trackChange: boolean;
  /** Optimistic mute value, else `null`. */
  muted: boolean | null;
  /** Source and sound mode chosen and not yet reported, else `null`. */
  source: string | null;
  soundMode: string | null;
  /** (path S) Optimistic shuffle and repeat values, else `null`. */
  shuffle: boolean | null;
  repeat: MediaRepeat | null;
}

/** The view model of one media player: everything a card, tile, badge, room strip or sheet reads. Built by `mediaView()`. */
export interface MediaView {
  entityId: string;
  /** `friendly_name`, else the entity id. */
  name: string;
  /** False for `unavailable` (and a missing entity); controls are disabled at 0.3. */
  available: boolean;
  /** The state to draw, after the optimistic play/pause and the buffering of next/previous (`pending`). */
  state: MediaState;
  /** The state HA reports. */
  haState: MediaState;
  /** Active in HA's `stateActive` sense: `on`, `idle`, `playing`, `paused`, `buffering` (standby is not). */
  active: boolean;
  /** Raw `supported_features`, 0 when missing. */
  features: number;
  /** Feature bits as booleans, so views never mask by hand. */
  can: {
    pause: boolean;
    play: boolean;
    seek: boolean;
    volumeSet: boolean;
    volumeStep: boolean;
    mute: boolean;
    previous: boolean;
    next: boolean;
    turnOn: boolean;
    turnOff: boolean;
    stop: boolean;
    /** Volume step enabled (Minus at 0 and Plus at 100 are disabled with VOLUME_SET; never disabled with VOLUME_STEP only; false without volume support or when unavailable). Computed from kind and volume so views need not ask the writer. */
    stepDown: boolean;
    stepUp: boolean;
    source: boolean;
    soundMode: boolean;
    shuffle: boolean;
    repeat: boolean;
  };
  kind: MediaVolumeKind;
  /** Volume 0..100 (pending value first, else HA's `volume_level` times 100, rounded); `null` when the player reports none or is `off`/`standby`. */
  volume: number | null;
  volumeOrigin: MediaOrigin;
  /** Muted (pending first, else `is_volume_muted`). */
  muted: boolean;
  /** Now playing block; all lines `null` for `off`, `unavailable`, `unknown`. */
  now: MediaNowPlaying;
  /** `shuffle` attribute (pending first). */
  shuffle: boolean;
  repeat: MediaRepeat;
  /** Current `source` and `sound_mode` (pending first), `null` when absent. */
  source: string | null;
  soundMode: string | null;
  /** `source_list` and `sound_mode_list`, empty when absent. */
  sources: string[];
  soundModes: string[];
  /** Number of other members in `group_members` (this entity excluded); 0 when not grouped. Subline form "<state>, grouped with N" when 1 or more (P3-CHO-10). */
  groupedWith: number;
  /** Playback position at `now`, or `null` (see MediaPosition). */
  position: MediaPosition | null;
  /** Artwork URL per plan 2.4 (`entity_picture_local || entity_picture`, through `hassUrl` when present); `null` unless playing, paused or buffering with a non-empty URL. */
  artwork: string | null;
  /** What is still pending. All fields `null`/false when nothing is. */
  pending: MediaPending;
}

/** Options of `mediaView()`. All optional so tests and the harness can call it with the entity alone. */
export interface MediaViewOptions {
  /** The configured entity id, kept in the view when the entity is missing from hass. */
  entityId?: string;
  /** `Date.now()` by default; tests and the ticker pass their own so a view is a pure function of its inputs. */
  now?: number;
  /** The hass, only for `hassUrl()`; without it the artwork URL is used as is. */
  hass?: { hassUrl?: (path?: string) => string };
  /** The writer's pending state (`MediaWriter.pending`), so views show held values. */
  pending?: MediaPending;
}

/** Build the view of one player. Pure: no timers, no DOM, no HA calls. H1 implements it; the stub only reads the basics. */
export type MediaViewFactory = (entity: HassEntity | undefined, options?: MediaViewOptions) => MediaView;

// ---- Writer interface (plan 2.4 "Writes") ---------------------------------------------------------------------

export type MediaStepDirection = 1 | -1;

/**
 * The one writer per entity, shared by the card, its sheet copy, the tile and the room strip through the core
 * `WriterRegistry` (`mediaWriters` in writer.ts, same shape as `fanWriters`), so their gestures coalesce. It extends
 * the core `SharedWriter` contract (`subscribe`, `holdFor`, `endHoldFor`, `sendPending`, `dispose`). Cards acquire it
 * through `WriterLease<MediaWriter>` (`new WriterLease(mediaWriters, onChange)`), never `new`. Every method is a no-op
 * for a feature the player lacks. Discrete actions go out at once and never cancel a running volume throttle.
 *
 * Gestures and the owner-based hold, as the fan card:
 * - Volume pill and keys: on pointerdown or the first keydown the card calls `lease.hold()`; each previewed value goes
 *   to `setVolume(v)`; on pointerup or keyup the card calls `lease.endHold()`, which flushes the final value. There is
 *   no begin/commit pair on the writer: the hold belongs to the card's lease.
 * - Seek: nothing is held and nothing is sent while dragging. `seekPreview(s)` only moves the shown target;
 *   `seekCommit()` sends one `media_seek` (and does nothing when equal to the shown position); `seekCancel()` aborts.
 *   A key gesture calls `seekPreview` per key and `seekCommit` at keyup.
 */
export interface MediaWriter extends SharedWriter {
  /** Hold time in seconds for sent values (`write_hold`, default 10); the card that interacts sets it. */
  hold: number;
  /** The latest hass, so calls and the translated error toasts use it. */
  hass?: HomeAssistant;
  /** Feed every new hass so held values end when HA reports them (echo), and next/previous ends on a track change. */
  observe(hass: HomeAssistant): void;
  /** What is pending right now; pass it to `mediaView` so views show held values. */
  readonly pending: MediaPending;
  /** The last failed call's message (translated `common.commandFailed` without one), cleared after 6 s; as core EntityWriter. */
  readonly error: string | null;

  /** Volume 0..100: `volume_set {volume_level: v / 100}` rounded to 2 decimals, throttled 300 ms (leading, one per window, final on `endHold`). */
  setVolume(value: number): void;
  /**
   * Tile and strip volume step (P3-CHO-17). With VOLUME_SET: base (pending, else hold, else HA) plus or minus 5 clamped
   * 0..100 through the same throttle. With only VOLUME_STEP: `volume_up`/`volume_down` at once, one call per tap.
   * Returns false when nothing was sent. Views read the disabled state from `MediaView.can.stepDown/stepUp`.
   */
  step(direction: MediaStepDirection): boolean;
  /** Seek gesture (GD3), see the interface comment. Seconds. */
  seekPreview(seconds: number): void;
  seekCommit(): void;
  seekCancel(): void;

  /** Play when `paused`/`idle`/`on` (needs PLAY), pause when `playing` (needs PAUSE); optimistic, reverts on failure. Disabled while buffering. */
  playPause(): void;
  next(): void;
  previous(): void;
  /** `volume_mute {is_volume_muted: !muted}`, optimistic with revert. */
  mute(): void;
  /** `turn_on` while `off`, else `turn_off`, at once, no optimism. */
  power(): void;
  /** `select_source` / `select_sound_mode`, once per selection, held on the chip until HA reports it. */
  selectSource(source: string): void;
  selectSoundMode(mode: string): void;
  /** (path S) `shuffle_set {shuffle: !shuffle}`; `repeat_set` cycling off, all, one, off. */
  toggleShuffle(): void;
  cycleRepeat(): void;
}

/** The shared registry type: `mediaWriters` in writer.ts. */
export type MediaWriterRegistry = WriterRegistry<MediaWriter>;
