import type { HassEntity } from '@decibel95/liquid-core';
import { MEDIA_FEATURE, type MediaNowPlaying, type MediaPending, type MediaPosition, type MediaRepeat, type MediaState, type MediaView, type MediaViewFactory, type MediaVolumeKind } from './types';

const STATES: readonly string[] = ['playing', 'paused', 'buffering', 'idle', 'standby', 'on', 'off', 'unavailable', 'unknown'];

/** HA frontend `stateActive` for media players: standby, off, unknown and unavailable are inactive. */
const ACTIVE: readonly string[] = ['on', 'idle', 'playing', 'paused', 'buffering'];

/** States that draw artwork (P3-TOK-2, P3-CHO-16). */
const ART_STATES: readonly string[] = ['playing', 'paused', 'buffering'];

/** Nothing pending: the value of a view without a writer. */
export const NO_PENDING: MediaPending = {
  volume: null,
  position: null,
  positionAt: null,
  state: null,
  trackChange: false,
  muted: null,
  source: null,
  soundMode: null,
  shuffle: null,
  repeat: null,
};

export const isMediaEntity = (id: unknown): id is string => typeof id === 'string' && /^media_player\.[a-z0-9_]+$/.test(id);

/** Transport and volume bits: an on/off-only player has none of them (plan 2.4, strict). */
const TRANSPORT = MEDIA_FEATURE.PLAY | MEDIA_FEATURE.PAUSE | MEDIA_FEATURE.STOP | MEDIA_FEATURE.SEEK | MEDIA_FEATURE.PREVIOUS_TRACK | MEDIA_FEATURE.NEXT_TRACK;
const VOLUME_BITS = MEDIA_FEATURE.VOLUME_SET | MEDIA_FEATURE.VOLUME_STEP | MEDIA_FEATURE.VOLUME_MUTE;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number => (finite(v) ? v : 0);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The volume kind from the feature bits alone (plan 2.4 "Kinds"). */
export function volumeKind(features: number): MediaVolumeKind {
  const has = (bit: number) => (features & bit) !== 0;
  if (has(MEDIA_FEATURE.VOLUME_SET)) return 'volume';
  if (has(MEDIA_FEATURE.VOLUME_STEP)) return 'step';
  return has(MEDIA_FEATURE.TURN_ON | MEDIA_FEATURE.TURN_OFF) && !has(TRANSPORT | VOLUME_BITS) ? 'onoff' : 'none';
}

/**
 * HA frontend `cleanupMediaTitle`: strip a `?authSig=...` suffix; a title starting with `http` shows its decoded last
 * path segment (a TTS or announcement URL). Other characters (the demo's two leading hearts) are kept.
 */
export function cleanupMediaTitle(title: unknown): string | null {
  const raw = str(title);
  if (!raw) return null;
  const at = raw.indexOf('?authSig=');
  let out = at > 0 ? raw.slice(0, at) : raw;
  if (out.startsWith('http')) {
    const seg = out.split('/').pop() ?? '';
    try {
      out = decodeURIComponent(seg);
    } catch {
      out = seg;
    }
  }
  return out || null;
}

/** A season or episode number (HA sends strings), else null. */
const count = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * The now playing lines (P3-CHO-5). Second line as HA's `computeMediaDescription` by `media_content_type`: music or
 * image the artist, playlist the playlist else the artist, tvshow the series (with `episode` when season and episode
 * are numbers; no line without a series, where HA would print "undefined"), channel the channel, anything else none
 * (the app is the third line). Third line `app_name`, else `source`. Idle and standby have no title or second line
 * ("Nothing playing"); off, unavailable and unknown have no lines at all.
 */
export function nowPlaying(a: Record<string, unknown>, state: MediaState): MediaNowPlaying {
  if (state === 'off' || state === 'unavailable' || state === 'unknown') return { title: null, secondary: null, episode: null, tertiary: null };
  const tertiary = str(a.app_name) ?? str(a.source);
  if (state === 'idle' || state === 'standby') return { title: null, secondary: null, episode: null, tertiary };
  let secondary: string | null = null;
  let episode: MediaNowPlaying['episode'] = null;
  switch (a.media_content_type) {
    case 'music':
    case 'image':
      secondary = str(a.media_artist);
      break;
    case 'playlist':
      secondary = str(a.media_playlist) ?? str(a.media_artist);
      break;
    case 'tvshow': {
      secondary = str(a.media_series_title);
      const season = count(a.media_season);
      const ep = count(a.media_episode);
      if (secondary && season != null && ep != null) episode = { series: secondary, season, episode: ep };
      break;
    }
    case 'channel':
      secondary = str(a.media_channel);
      break;
  }
  return { title: cleanupMediaTitle(a.media_title), secondary, episode, tertiary };
}

/** `media_position_updated_at` (ISO string, epoch ms or Date) as epoch ms, else null. */
const stamp = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : finite(v) ? v : v instanceof Date ? v.getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * Playback position (GD3, P3-CHO-3). `null` without a positive duration or without a position. HA's position is
 * extrapolated only while HA reports `playing` (`media_position + (now - media_position_updated_at) / 1000`), else
 * used as is; a pending position (a seek target, or the position frozen or anchored by a pending play, pause or track
 * change) replaces it and moves on from `positionAt` only while the drawn state is `playing`. Clamped to 0..duration
 * (HA clamps only at 0); clock skew is not corrected.
 */
function positionOf(a: Record<string, unknown>, haState: MediaState, state: MediaState, now: number, pending: MediaPending): MediaPosition | null {
  const duration = a.media_duration;
  const pos = a.media_position;
  if (!finite(duration) || duration <= 0 || !finite(pos)) return null;
  let seconds = pos;
  if (pending.position != null) {
    seconds = pending.position + (pending.positionAt != null && state === 'playing' ? (now - pending.positionAt) / 1000 : 0);
  } else if (haState === 'playing') {
    const at = stamp(a.media_position_updated_at);
    if (at != null) seconds += (now - at) / 1000;
  }
  return { seconds: clamp(seconds, 0, duration), duration, held: pending.position != null && pending.state == null && !pending.trackChange };
}

/** Artwork (plan 2.4): `entity_picture_local || entity_picture`, through `hass.hassUrl` when it exists; only in ART_STATES. */
function artworkOf(a: Record<string, unknown>, haState: MediaState, hass: { hassUrl?: (path?: string) => string } | undefined): string | null {
  if (!ART_STATES.includes(haState)) return null;
  const raw = str(a.entity_picture_local) ?? str(a.entity_picture);
  // hassUrl('') returns the base URL, so an empty picture never reaches it.
  if (!raw || typeof hass?.hassUrl !== 'function') return raw;
  try {
    return str(hass.hassUrl(raw)) ?? raw;
  } catch {
    return raw;
  }
}

/** HA `formatMediaTime`: `m:ss`, or `h:mm:ss` from one hour; negative values count as 0; `''` for a non-finite value. */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  const two = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** The repeat value HA reports, anything else read as `off`. */
export const repeatOf = (v: unknown): MediaRepeat => (v === 'all' || v === 'one' ? v : 'off');

/**
 * The view of one media player (plan 2.4). Pure: a function of the entity, `now`, `hass.hassUrl` and the writer's
 * pending values; every attribute read is guarded, since an `off` player reports almost none.
 */
export const mediaView: MediaViewFactory = (entity: HassEntity | undefined, options = {}): MediaView => {
  const entityId = entity?.entity_id ?? options.entityId ?? '';
  const a: Record<string, unknown> = entity?.attributes ?? {};
  const features = num(a.supported_features);
  const has = (bit: number) => (features & bit) !== 0;
  const haState = (entity ? (STATES.includes(entity.state) ? entity.state : 'unknown') : 'unavailable') as MediaState;
  const available = haState !== 'unavailable';
  const active = ACTIVE.includes(haState);
  const pending = options.pending ?? NO_PENDING;
  const state: MediaState = !available ? haState : pending.trackChange ? 'buffering' : (pending.state ?? haState);
  const kind = volumeKind(features);
  const haVolume = finite(a.volume_level) ? clamp(Math.round(a.volume_level * 100), 0, 100) : null;
  const volume = active ? (pending.volume ?? haVolume) : null;
  const stepOn = active && (kind === 'step' || (kind === 'volume' && volume != null));
  return {
    entityId,
    name: str(a.friendly_name) ?? entityId,
    available,
    state,
    haState,
    active,
    features,
    can: {
      pause: has(MEDIA_FEATURE.PAUSE),
      play: has(MEDIA_FEATURE.PLAY),
      seek: has(MEDIA_FEATURE.SEEK),
      volumeSet: has(MEDIA_FEATURE.VOLUME_SET),
      volumeStep: has(MEDIA_FEATURE.VOLUME_STEP),
      mute: has(MEDIA_FEATURE.VOLUME_MUTE),
      previous: has(MEDIA_FEATURE.PREVIOUS_TRACK),
      next: has(MEDIA_FEATURE.NEXT_TRACK),
      turnOn: has(MEDIA_FEATURE.TURN_ON),
      turnOff: has(MEDIA_FEATURE.TURN_OFF),
      stop: has(MEDIA_FEATURE.STOP),
      stepDown: stepOn && (kind === 'step' || volume! > 0),
      stepUp: stepOn && (kind === 'step' || volume! < 100),
      source: has(MEDIA_FEATURE.SELECT_SOURCE),
      soundMode: has(MEDIA_FEATURE.SELECT_SOUND_MODE),
      shuffle: has(MEDIA_FEATURE.SHUFFLE_SET),
      repeat: has(MEDIA_FEATURE.REPEAT_SET),
    },
    kind,
    volume,
    volumeOrigin: active && pending.volume != null ? 'pending' : 'ha',
    muted: pending.muted ?? a.is_volume_muted === true,
    now: nowPlaying(a, haState),
    shuffle: pending.shuffle ?? a.shuffle === true,
    repeat: pending.repeat ?? repeatOf(a.repeat),
    source: pending.source ?? str(a.source),
    soundMode: pending.soundMode ?? str(a.sound_mode),
    sources: list(a.source_list),
    soundModes: list(a.sound_mode_list),
    groupedWith: new Set(list(a.group_members).filter((m) => m !== entityId)).size,
    position: positionOf(a, haState, state, options.now ?? Date.now(), pending),
    artwork: artworkOf(a, haState, options.hass),
    pending,
  };
};
