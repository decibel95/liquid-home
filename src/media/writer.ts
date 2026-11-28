import { EntityWriter, WriterRegistry, throttleWrites, type HassEntity, type HomeAssistant, type WriteCall } from '@decibel95/liquid-core';
import { t } from '../i18n';
import { mediaView, repeatOf } from './model';
import { MEDIA_FEATURE, type MediaPending, type MediaRepeat, type MediaStepDirection, type MediaView, type MediaWriter } from './types';

/** The queued change: only the volume (GD1). Every other action is a discrete call outside the queue. */
export interface MediaPatch {
  /** Volume 0..100, whole percent; sent as `volume_set {volume_level: v / 100}` and held until HA reports it. */
  volume?: number;
}

export type MediaCall = WriteCall<MediaPatch>;

/** GD1: leading write, at most one per 300 ms, the final value on release. */
export const MEDIA_THROTTLE_MS = 300;

/** GD3, the HA frontend pending-seek rule: a newer report within this many seconds of the held position ends the hold. */
export const SEEK_ECHO_S = 2;

/** A report after next or previous with a fresh position below this many seconds is a (re)started track. */
export const TRACK_RESTART_S = 3;

/** GD2: a tile or strip step with VOLUME_SET moves the volume by this many percent. */
export const VOLUME_STEP_PERCENT = 5;

/** The product string shown when a call fails without a message of its own (as the other domains). */
export const MEDIA_ERROR_KEY = 'common.commandFailed';

const DOMAIN = 'media_player';
const ERROR_MS = 6000;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const noop = (): void => undefined;

/** The entity's volume in patch terms: `volume_level` as a whole percent, else undefined. */
export function mediaStateOf(entity: HassEntity, key: string): unknown {
  if (key !== 'volume') return entity.attributes[key];
  const v = entity.attributes.volume_level;
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : undefined;
}

/**
 * The calls for a coalesced volume change (GD1): `volume_set` with `volume_level` rounded to 2 decimals, only with
 * VOLUME_SET. A value equal to the one in flight (`baseline`, the hold), else to HA's, is dropped, so a release on the
 * value last sent sends nothing.
 */
export function buildMediaCalls(change: MediaPatch, entity: HassEntity, baseline: MediaPatch): MediaCall[] {
  const v = change.volume;
  if (typeof v !== 'number' || (Number(entity.attributes.supported_features) & MEDIA_FEATURE.VOLUME_SET) === 0) return [];
  const base = 'volume' in baseline ? baseline.volume : mediaStateOf(entity, 'volume');
  if (v === base) return [];
  return [{ service: 'volume_set', data: { entity_id: entity.entity_id, volume_level: +(v / 100).toFixed(2) }, sets: { volume: v } }];
}

/** The optimistic values of discrete actions, each held until HA reports it, the call fails or `write_hold` passes. */
interface Optimistic {
  state: 'playing' | 'paused';
  muted: boolean;
  source: string;
  soundMode: string;
  shuffle: boolean;
  repeat: MediaRepeat;
}
type OptKey = keyof Optimistic;

/** The entity's value for `key`, in the terms of the held value. */
const REPORTED: { [K in OptKey]: (s: HassEntity) => unknown } = {
  state: (s) => s.state,
  muted: (s) => s.attributes.is_volume_muted === true,
  source: (s) => s.attributes.source,
  soundMode: (s) => s.attributes.sound_mode,
  shuffle: (s) => s.attributes.shuffle === true,
  repeat: (s) => repeatOf(s.attributes.repeat),
};

/**
 * The taps of one key that HA has not reported yet, oldest first (the newest is shown), and the entity's value for the
 * key when the first was sent (`seen`, then the last value reported). As core EntityWriter (parity note 1): a report
 * that leaves the key's value unchanged since `seen` ends nothing, so a quick double tap whose target equals HA's stale
 * value is not ended by an unrelated update; a reported value equal to a tap drops it and the older ones; the hold ends
 * when none is left. Play and pause also end when the state changed to a value none of the taps asked for (HA wins).
 */
interface Held<V> {
  taps: { value: V; seq: number }[];
  seen: unknown;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A sent seek target (GD3): it moves on from `at` while the drawn state is playing and is frozen (`at` null) while it
 * is not, so a pause during the hold keeps the held position. `from` is the entity state at the send: only a newer
 * state within 2 s ends it, besides `write_hold`, a failure, another seek and a next or previous tap.
 */
interface SeekHold {
  pos: number;
  at: number | null;
  from: HassEntity | undefined;
  seq: number;
  timer: ReturnType<typeof setTimeout>;
}

/** The position at a play or pause tap without a seek hold (`state`), or at a next or previous tap (`track`, frozen). */
interface Freeze {
  kind: 'state' | 'track';
  pos: number;
  at: number | null;
}

/** A next or previous tap: the track it left and the state it was sent from. */
interface TrackChange {
  from: HassEntity | undefined;
  title: unknown;
  contentId: unknown;
  picture: unknown;
  /** `media_position_updated_at` at the tap: a previous that restarts the same track only shows a fresh position. */
  stamp: unknown;
  seq: number;
  timer: ReturnType<typeof setTimeout>;
}

const shownTap = <V>(h: Held<V> | undefined): V | null => (h && h.taps.length ? h.taps[h.taps.length - 1].value : null);

/**
 * The media writer (plan 2.4 "Writes"): a core EntityWriter on throttleWrites(300) for the volume (leading write, at
 * most one per window, final on release, the sent value held until HA reports it, `write_hold` or a failure), plus
 * discrete calls sent at once outside the queue, so they never cancel or delay a running volume throttle. Each
 * discrete action that shows a value before HA does keeps it until HA reports it, the call fails (revert) or `hold`
 * seconds pass. Every call goes through `hass.callService('media_player', ...)`.
 */
export class MediaPlayerWriter extends EntityWriter<MediaPatch, MediaCall> implements MediaWriter {
  private opt: { [K in OptKey]?: Held<Optimistic[K]> } = {};
  private seekHold?: SeekHold;
  private freeze?: Freeze;
  private track?: TrackChange;
  /** The seek target while dragging or between keys (nothing sent yet). */
  private draft: number | null = null;
  private seq = 0;
  private gone = false;
  private errorClear?: ReturnType<typeof setTimeout>;

  constructor(entityId: string) {
    super(entityId, {
      build: buildMediaCalls,
      schedule: throttleWrites(MEDIA_THROTTLE_MS),
      stateOf: mediaStateOf,
      t: (hass, key) => t(hass, key),
      errorKey: MEDIA_ERROR_KEY,
      logLabel: 'liquid-home',
    });
    // One timer clears the error, whoever set it (a discrete call here or a volume send in the core), so every new
    // error shows its full 6 s; the core's own clearing (assigning null) is ignored, its timer would cut a newer error
    // short. No subclass may declare an `error` field: it would replace this accessor (and its single timer).
    let error: string | null = null;
    Object.defineProperty(this, 'error', {
      configurable: true,
      enumerable: true,
      get: () => error,
      set: (v: string | null) => {
        if (v == null || this.gone) return;
        error = v;
        clearTimeout(this.errorClear);
        this.errorClear = setTimeout(() => {
          error = null;
          this.changed();
        }, ERROR_MS);
      },
    });
  }

  /** Pending values without the seek draft: what the shown position is built from. */
  private settled(): MediaPending {
    const vol = this.local.volume;
    const at = this.seekHold ?? this.freeze;
    return {
      volume: typeof vol === 'number' ? vol : null,
      position: at ? at.pos : null,
      positionAt: at ? at.at : null,
      state: shownTap(this.opt.state),
      trackChange: !!this.track,
      muted: shownTap(this.opt.muted),
      source: shownTap(this.opt.source),
      soundMode: shownTap(this.opt.soundMode),
      shuffle: shownTap(this.opt.shuffle),
      repeat: shownTap(this.opt.repeat),
    };
  }

  get pending(): MediaPending {
    const p = this.settled();
    return this.draft == null ? p : { ...p, position: this.draft, positionAt: null };
  }

  private view(now = Date.now(), pending: MediaPending = this.pending): MediaView {
    return mediaView(this.entity(), { entityId: this.entityId, now, pending });
  }

  private has(bit: number): boolean {
    return (Number(this.entity()?.attributes.supported_features) & bit) !== 0;
  }

  // ---- Calls ---------------------------------------------------------------------------------------------------

  /** One discrete call, sent now. Rejects (after setting `error`) when it fails, so the caller can revert. */
  private call(service: string, data: Record<string, unknown> = {}): Promise<void> {
    const hass = this.hass;
    if (!hass) return Promise.reject(new Error('no hass'));
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(hass.callService(DOMAIN, service, { entity_id: this.entityId, ...data }));
    } catch (err) {
      p = Promise.reject(err);
    }
    return p.then(noop, (err: unknown) => {
      console.error('liquid-home: service call failed', err);
      if (!this.gone) {
        this.error = err instanceof Error && err.message ? err.message : t(hass, MEDIA_ERROR_KEY);
        this.changed();
      }
      throw err;
    });
  }

  /** Show `value` for `key` at once and send the call; see Held for when it ends. */
  private optimistic<K extends OptKey>(key: K, value: Optimistic[K], service: string, data: Record<string, unknown> = {}): void {
    const seq = ++this.seq;
    const s = this.entity();
    const h = this.opt[key] as Held<Optimistic[K]> | undefined;
    clearTimeout(h?.timer);
    const next: Held<Optimistic[K]> = {
      taps: [...(h?.taps ?? []), { value, seq }],
      seen: h ? h.seen : s ? REPORTED[key](s) : undefined,
      timer: setTimeout(() => this.endOpt(key), this.hold * 1000),
    };
    (this.opt as Record<OptKey, Held<unknown>>)[key] = next;
    if (key === 'state') this.syncSeek();
    this.changed();
    this.call(service, data).catch(() => this.dropTap(key, seq));
  }

  /** A tap's call failed: drop that tap; the hold ends when none is left (revert). */
  private dropTap(key: OptKey, seq: number): void {
    const h = this.opt[key] as Held<unknown> | undefined;
    if (!h || !h.taps.some((x) => x.seq === seq)) return;
    h.taps = h.taps.filter((x) => x.seq !== seq);
    if (!h.taps.length) return this.endOpt(key);
    if (key === 'state') this.syncSeek();
    this.changed();
  }

  private endOpt(key: OptKey, quiet = false): void {
    const h = this.opt[key];
    if (!h) return;
    clearTimeout(h.timer);
    delete this.opt[key];
    if (key === 'state') {
      if (this.freeze?.kind === 'state') this.freeze = undefined;
      this.syncSeek();
    }
    if (!quiet) this.changed();
  }

  /** Keep a seek hold moving while the drawn state is playing and frozen at its shown value while it is not. */
  private syncSeek(now = Date.now()): void {
    const sk = this.seekHold;
    if (!sk) return;
    const moving = this.view(now, this.settled()).state === 'playing';
    if (moving && sk.at == null) sk.at = now;
    else if (!moving && sk.at != null) {
      sk.pos += (now - sk.at) / 1000;
      sk.at = null;
    }
  }

  private endSeek(seq?: number, quiet = false): void {
    const sk = this.seekHold;
    if (!sk || (seq !== undefined && sk.seq !== seq)) return;
    clearTimeout(sk.timer);
    this.seekHold = undefined;
    if (!quiet) this.changed();
  }

  private endTrack(seq?: number, quiet = false): void {
    const tc = this.track;
    if (!tc || (seq !== undefined && tc.seq !== seq)) return;
    clearTimeout(tc.timer);
    this.track = undefined;
    if (this.freeze?.kind === 'track') this.freeze = undefined;
    if (!quiet) this.changed();
  }

  // ---- Echoes --------------------------------------------------------------------------------------------------

  /**
   * Feed every new hass: the core drops the volume HA caught up with; here the discrete taps HA reports end (see
   * Held), next or previous ends on a track change or a change to a state other than playing or buffering, and a newer
   * state within 2 s of the held seek position ends the seek hold. Nothing is announced: the hass change re-renders
   * the cards anyway.
   */
  override observe(hass: HomeAssistant): void {
    super.observe(hass);
    const s = this.entity();
    if (!s) return;
    for (const key of Object.keys(this.opt) as OptKey[]) {
      const h = this.opt[key] as Held<unknown> | undefined;
      if (!h) continue;
      const actual = REPORTED[key](s);
      if (Object.is(actual, h.seen)) continue;
      h.seen = actual;
      const i = h.taps.findIndex((x) => x.value === actual);
      if (i >= 0) h.taps = h.taps.slice(i + 1);
      if (!h.taps.length || (key === 'state' && i < 0)) this.endOpt(key, true);
    }
    const tc = this.track;
    if (tc && s !== tc.from) {
      const a = s.attributes;
      const moved = a.media_title !== tc.title || a.media_content_id !== tc.contentId || a.entity_picture !== tc.picture;
      const left = s.state !== tc.from?.state && s.state !== 'playing' && s.state !== 'buffering';
      // Previous more than a few seconds in restarts the same track on most players: a fresh position near 0.
      const restarted = a.media_position_updated_at !== tc.stamp && typeof a.media_position === 'number' && a.media_position < TRACK_RESTART_S;
      if (moved || left || restarted) this.endTrack(undefined, true);
    }
    const sk = this.seekHold;
    if (sk && s !== sk.from) {
      const now = Date.now();
      // An echo can arrive with a change from playing to paused: freeze the held value at it first.
      this.syncSeek(now);
      const reported = mediaView(s, { now }).position;
      const held = this.view(now, this.settled()).position;
      if (reported && held && Math.abs(reported.seconds - held.seconds) <= SEEK_ECHO_S) this.endSeek(undefined, true);
    }
    this.syncSeek();
  }

  // ---- Volume --------------------------------------------------------------------------------------------------

  setVolume(value: number): void {
    const v = this.view();
    if (!v.active || !v.can.volumeSet || !Number.isFinite(value)) return;
    this.set({ volume: clamp(Math.round(value), 0, 100) });
  }

  step(direction: MediaStepDirection): boolean {
    const v = this.view();
    if (direction > 0 ? !v.can.stepUp : !v.can.stepDown) return false;
    if (v.kind === 'step') {
      this.call(direction > 0 ? 'volume_up' : 'volume_down').catch(noop);
      return true;
    }
    const base = v.volume!;
    const next = clamp(base + VOLUME_STEP_PERCENT * direction, 0, 100);
    if (next === base) return false;
    this.set({ volume: next });
    return true;
  }

  // ---- Seek ----------------------------------------------------------------------------------------------------

  seekPreview(seconds: number): void {
    const v = this.view();
    if (!v.available || !v.can.seek || !v.position || !Number.isFinite(seconds)) return;
    this.draft = clamp(seconds, 0, v.position.duration);
    this.changed();
  }

  seekCommit(): void {
    const target = this.draft;
    if (target == null) return;
    this.draft = null;
    const now = Date.now();
    const shown = this.view(now, this.settled()).position;
    const pos = Math.round(target);
    if (!shown || pos === Math.round(shown.seconds)) {
      this.changed();
      return;
    }
    const seq = ++this.seq;
    clearTimeout(this.seekHold?.timer);
    if (this.freeze?.kind === 'state') this.freeze = undefined;
    this.seekHold = { pos, at: now, from: this.entity(), seq, timer: setTimeout(() => this.endSeek(seq), this.hold * 1000) };
    this.syncSeek(now);
    this.changed();
    this.call('media_seek', { seek_position: pos }).catch(() => this.endSeek(seq));
  }

  seekCancel(): void {
    if (this.draft == null) return;
    this.draft = null;
    this.changed();
  }

  // ---- Transport -----------------------------------------------------------------------------------------------

  /** A tap during a seek hold freezes (pause) or restarts (play) the held position; otherwise the position at the tap is anchored. */
  playPause(): void {
    const now = Date.now();
    const v = this.view(now);
    if (!v.available || v.state === 'buffering') return;
    let target: 'playing' | 'paused';
    if (v.state === 'playing' && v.can.pause) target = 'paused';
    else if ((v.state === 'paused' || v.state === 'idle' || v.state === 'on') && v.can.play) target = 'playing';
    else return;
    if (!this.seekHold && v.position) this.freeze = { kind: 'state', pos: v.position.seconds, at: target === 'playing' ? now : null };
    this.optimistic('state', target, target === 'playing' ? 'media_play' : 'media_pause');
  }

  next(): void {
    this.skip(MEDIA_FEATURE.NEXT_TRACK, 'media_next_track');
  }

  previous(): void {
    this.skip(MEDIA_FEATURE.PREVIOUS_TRACK, 'media_previous_track');
  }

  /** Next or previous: Buffering with the position frozen until the track changes; it ends a seek hold (a new track has its own position). */
  private skip(bit: number, service: string): void {
    const v = this.view();
    const s = this.entity();
    if (!v.available || !this.has(bit)) return;
    const seq = ++this.seq;
    clearTimeout(this.track?.timer);
    const a = s?.attributes ?? {};
    this.track = { from: s, title: a.media_title, contentId: a.media_content_id, picture: a.entity_picture, stamp: a.media_position_updated_at, seq, timer: setTimeout(() => this.endTrack(seq), this.hold * 1000) };
    this.endSeek(undefined, true);
    this.freeze = v.position ? { kind: 'track', pos: v.position.seconds, at: null } : undefined;
    this.changed();
    this.call(service).catch(() => this.endTrack(seq));
  }

  mute(): void {
    const v = this.view();
    if (!v.available || !v.can.mute) return;
    this.optimistic('muted', !v.muted, 'volume_mute', { is_volume_muted: !v.muted });
  }

  power(): void {
    const v = this.view();
    if (!v.available) return;
    const off = v.haState === 'off' || v.haState === 'unknown' || v.haState === 'standby';
    if (off ? !v.can.turnOn : !v.can.turnOff) return;
    this.call(off ? 'turn_on' : 'turn_off').catch(noop);
  }

  // ---- Chips and (path S) shuffle and repeat --------------------------------------------------------------------

  selectSource(source: string): void {
    const v = this.view();
    if (!v.available || !v.can.source || typeof source !== 'string' || source === v.source) return;
    this.optimistic('source', source, 'select_source', { source });
  }

  selectSoundMode(mode: string): void {
    const v = this.view();
    if (!v.available || !v.can.soundMode || typeof mode !== 'string' || mode === v.soundMode) return;
    this.optimistic('soundMode', mode, 'select_sound_mode', { sound_mode: mode });
  }

  toggleShuffle(): void {
    const v = this.view();
    if (!v.available || !v.can.shuffle) return;
    this.optimistic('shuffle', !v.shuffle, 'shuffle_set', { shuffle: !v.shuffle });
  }

  /** D-20, the HA frontend cycle: off to all, all to one, anything else to off. */
  cycleRepeat(): void {
    const v = this.view();
    if (!v.available || !v.can.repeat) return;
    const repeat: MediaRepeat = v.repeat === 'off' ? 'all' : v.repeat === 'all' ? 'one' : 'off';
    this.optimistic('repeat', repeat, 'repeat_set', { repeat });
  }

  // ---- Lifetime ------------------------------------------------------------------------------------------------

  override dispose(): void {
    this.gone = true;
    for (const h of Object.values(this.opt)) clearTimeout(h?.timer);
    this.opt = {};
    clearTimeout(this.seekHold?.timer);
    clearTimeout(this.track?.timer);
    clearTimeout(this.errorClear);
    this.seekHold = undefined;
    this.freeze = undefined;
    this.track = undefined;
    this.draft = null;
    super.dispose();
  }
}

/** A media writer for one entity (the registry's factory). */
export const createMediaWriter = (entityId: string): MediaWriter => new MediaPlayerWriter(entityId);

/**
 * One shared, ref-counted writer per media player entity for the whole bundle: the media card, its sheet copy, the
 * tile and the room strip coalesce into one queue. Same shape as `fanWriters`; cards use `WriterLease`.
 */
export const mediaWriters = new WriterRegistry<MediaWriter>(createMediaWriter);
