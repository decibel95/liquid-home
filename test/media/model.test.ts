import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupMediaTitle, formatMediaTime, mediaView, NO_PENDING, type MediaPending } from '../../src/media';
import { DEMO, entity, FIX } from './fixtures';

/** Plan 2.4 "Tests that pin the rules", model part. The clock is fixed so positions are exact. */

const T0 = Date.parse('2026-11-27T12:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const pend = (p: Partial<MediaPending>): MediaPending => ({ ...NO_PENDING, ...p });
const iso = (ms: number) => new Date(ms).toISOString();

describe('states', () => {
  it('reads every HA state, active as HA stateActive (standby inactive)', () => {
    const cases: [string, boolean, boolean][] = [
      ['playing', true, true],
      ['paused', true, true],
      ['buffering', true, true],
      ['idle', true, true],
      ['on', true, true],
      ['standby', false, true],
      ['off', false, true],
      ['unknown', false, true],
      ['unavailable', false, false],
    ];
    for (const [state, active, available] of cases) {
      const v = mediaView(entity('media_player.x', state, { supported_features: 119695, volume_level: 0.5 }));
      expect([v.state, v.haState, v.active, v.available], state).toEqual([state, state, active, available]);
    }
  });

  it('a missing entity is unavailable and keeps the configured id; an unknown state string reads as unknown', () => {
    const v = mediaView(undefined, { entityId: 'media_player.gone' });
    expect([v.state, v.available, v.entityId, v.name]).toEqual(['unavailable', false, 'media_player.gone', 'media_player.gone']);
    expect(mediaView(entity('media_player.x', 'warming_up')).state).toBe('unknown');
  });

  it('an off player with no attributes: no volume, no lines, no position, no art, kind none', () => {
    const v = mediaView(FIX.bare_off());
    expect(v).toMatchObject({ state: 'off', features: 0, kind: 'none', volume: null, muted: false, position: null, artwork: null, groupedWith: 0, sources: [], soundModes: [], source: null, soundMode: null, shuffle: false, repeat: 'off' });
    expect(v.now).toEqual({ title: null, secondary: null, episode: null, tertiary: null });
    expect(v.name).toBe('media_player.lh_fixture_bare');
    expect(v.can.stepDown || v.can.stepUp).toBe(false);
  });

  it('standby is drawn like idle with no volume and "Nothing playing"; unknown and unavailable have no lines', () => {
    const sb = mediaView(entity('media_player.x', 'standby', { supported_features: 119695, volume_level: 0.4, media_title: 'X', app_name: 'TV' }));
    expect([sb.volume, sb.now.title, sb.now.tertiary, sb.can.stepUp, sb.artwork]).toEqual([null, null, 'TV', false, null]);
    for (const state of ['unknown', 'unavailable']) {
      const v = mediaView(entity('media_player.x', state, { supported_features: 119695, media_title: 'X', app_name: 'TV', volume_level: 0.4 }));
      expect(v.now).toEqual({ title: null, secondary: null, episode: null, tertiary: null });
      expect(v.volume).toBeNull();
    }
    expect(mediaView(FIX.idle()).now).toEqual({ title: null, secondary: null, episode: null, tertiary: 'Spotify' });
  });

  it('pending play/pause and a track change override the drawn state, never an unavailable one', () => {
    expect(mediaView(FIX.transport(), { pending: pend({ state: 'paused' }) })).toMatchObject({ state: 'paused', haState: 'playing' });
    expect(mediaView(FIX.transport(), { pending: pend({ state: 'paused', trackChange: true }) }).state).toBe('buffering');
    expect(mediaView(FIX.unavailable(), { pending: pend({ trackChange: true }) }).state).toBe('unavailable');
  });
});

describe('kinds', () => {
  it('demo features: 119695, 914877, 643983 volume; 121265, 4325376, 4194304 none', () => {
    const kinds = Object.fromEntries(Object.entries(DEMO).map(([k, make]) => [k, mediaView(make()).kind]));
    expect(kinds).toEqual({ bedroom: 'volume', living_room: 'volume', kitchen: 'volume', walkman: 'volume', lounge_room: 'none', group: 'volume', browse: 'none', search: 'none' });
  });

  it('fixture features: 914873 step, 384 onoff, 121277 volume; onoff is strict', () => {
    expect(mediaView(FIX.volume_step()).kind).toBe('step');
    expect(mediaView(FIX.onoff_only()).kind).toBe('onoff');
    expect(mediaView(FIX.tv_sources()).kind).toBe('volume');
    expect(mediaView(entity('media_player.x', 'on', { supported_features: 128 })).kind).toBe('onoff');
    expect(mediaView(entity('media_player.x', 'on', { supported_features: 384 | 8 })).kind).toBe('none');
    expect(mediaView(entity('media_player.x', 'on', { supported_features: 384 | 16384 })).kind).toBe('none');
    expect(mediaView(entity('media_player.x', 'on', { supported_features: 384 | 4096 })).kind).toBe('none');
    // Unknown bits (64, 512, a future one) are tolerated.
    expect(mediaView(entity('media_player.x', 'on', { supported_features: 384 | 64 | 512 | 8388608 })).kind).toBe('onoff');
  });

  it('feature booleans follow the bits', () => {
    const k = mediaView(DEMO.kitchen()).can;
    expect(k).toMatchObject({ pause: true, play: true, seek: false, volumeSet: true, volumeStep: true, mute: true, previous: true, next: true, turnOn: true, turnOff: true, stop: true, source: false, soundMode: true, shuffle: true, repeat: true });
    const l = mediaView(DEMO.lounge_room()).can;
    expect(l).toMatchObject({ seek: false, volumeSet: false, volumeStep: false, mute: false, source: true, repeat: false });
  });

  it('volume: HA percent rounded, pending first; steps disabled at the ends with VOLUME_SET, never with VOLUME_STEP only', () => {
    expect(mediaView(FIX.volume_mid())).toMatchObject({ volume: 35, volumeOrigin: 'ha' });
    expect(mediaView(FIX.volume_mid(), { pending: pend({ volume: 50 }) })).toMatchObject({ volume: 50, volumeOrigin: 'pending' });
    expect(mediaView(DEMO.living_room()).can).toMatchObject({ stepUp: false, stepDown: true });
    expect(mediaView(FIX.volume_zero()).can).toMatchObject({ stepUp: true, stepDown: false });
    expect(mediaView(FIX.volume_step())).toMatchObject({ volume: null, can: { stepUp: true, stepDown: true } });
    expect(mediaView(DEMO.lounge_room()).can).toMatchObject({ stepUp: false, stepDown: false });
    expect(mediaView(FIX.off()).can).toMatchObject({ stepUp: false, stepDown: false });
    expect(mediaView(FIX.muted()).muted).toBe(true);
    expect(mediaView(FIX.muted(), { pending: pend({ muted: false }) }).muted).toBe(false);
  });
});

describe('now playing lines', () => {
  const np = (a: Record<string, unknown>, state = 'playing') => mediaView(entity('media_player.x', state, a)).now;

  it('music: artist; app on the third line', () => {
    expect(mediaView(DEMO.kitchen()).now).toEqual({ title: 'I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)', secondary: 'Technohead', episode: null, tertiary: null });
    expect(np({ media_content_type: 'music', media_title: 'T', media_artist: 'A', app_name: 'Spotify', source: 'Wifi' })).toEqual({ title: 'T', secondary: 'A', episode: null, tertiary: 'Spotify' });
  });

  it('tvshow with a series: the episode pieces; without a series: no line (never "undefined")', () => {
    expect(mediaView(DEMO.lounge_room()).now).toEqual({ title: 'Chapter 1', secondary: 'House of Cards', episode: { series: 'House of Cards', season: 1, episode: 1 }, tertiary: 'Netflix' });
    expect(np({ media_content_type: 'tvshow', media_title: 'Chapter 1', media_season: '1', media_episode: '1' })).toEqual({ title: 'Chapter 1', secondary: null, episode: null, tertiary: null });
    expect(np({ media_content_type: 'tvshow', media_series_title: 'S', media_season: '2' }).episode).toBeNull();
  });

  it('channel, playlist (else artist), image, other types; the app falls back to the source', () => {
    expect(np({ media_content_type: 'channel', media_channel: 'NPO 1' }).secondary).toBe('NPO 1');
    expect(np({ media_content_type: 'playlist', media_playlist: 'Mix', media_artist: 'A' }).secondary).toBe('Mix');
    expect(np({ media_content_type: 'playlist', media_artist: 'A' }).secondary).toBe('A');
    expect(np({ media_content_type: 'image', media_artist: 'A' }).secondary).toBe('A');
    expect(np({ media_content_type: 'movie', media_artist: 'A', app_name: 'YouTube' })).toMatchObject({ secondary: null, tertiary: 'YouTube' });
    expect(np({ media_content_type: 'movie', source: 'HDMI 1' }).tertiary).toBe('HDMI 1');
    expect(np({ media_content_type: 7, media_artist: 3, app_name: ['x'] })).toEqual({ title: null, secondary: null, episode: null, tertiary: null });
  });

  it('title cleanup as HA cleanupMediaTitle; the two leading hearts are kept', () => {
    expect(mediaView(DEMO.living_room()).now.title).toBe('♥♥ The Best Fireplace Video (3 hours)');
    expect(cleanupMediaTitle('https://tts.example/api/tts_proxy/Hello%20there.mp3?authSig=abc.def')).toBe('Hello there.mp3');
    expect(cleanupMediaTitle('Song?authSig=xyz')).toBe('Song');
    expect(cleanupMediaTitle('http://x/y/%E0%A4%A')).toBe('%E0%A4%A');
    expect(cleanupMediaTitle('')).toBeNull();
    expect(cleanupMediaTitle(undefined)).toBeNull();
  });
});

describe('grouped subline count', () => {
  const g = (members: unknown) => mediaView(entity('media_player.me', 'playing', { group_members: members })).groupedWith;
  it('null, empty and self only are 0; self plus one is 1', () => {
    expect(g(null)).toBe(0);
    expect(g([])).toBe(0);
    expect(g(['media_player.me'])).toBe(0);
    expect(g(['media_player.me', 'media_player.other'])).toBe(1);
    expect(g(undefined)).toBe(0);
    expect(mediaView(FIX.grouped()).groupedWith).toBe(1);
    expect(mediaView(DEMO.group()).groupedWith).toBe(0);
  });
});

describe('position', () => {
  const at = (state: string, a: Record<string, unknown>, now = T0 + 10_000, pending?: MediaPending) =>
    mediaView(entity('media_player.x', state, { media_duration: 300, media_position: 45, media_position_updated_at: iso(T0), ...a }), { now, pending }).position;

  it('extrapolates only while playing', () => {
    expect(at('playing', {})).toEqual({ seconds: 55, duration: 300, held: false });
    for (const s of ['paused', 'buffering', 'idle', 'on']) expect(at(s, {})!.seconds, s).toBe(45);
  });

  it('clamps to the duration; a future stamp (clock skew) is clamped at 0', () => {
    expect(at('playing', {}, T0 + 400_000)!.seconds).toBe(300);
    expect(at('playing', { media_position: 2, media_position_updated_at: iso(T0 + 5000) }, T0)!.seconds).toBe(0);
    expect(at('playing', { media_position: 10, media_position_updated_at: iso(T0 + 5000) }, T0)!.seconds).toBe(5);
  });

  it('no line without a duration or a position; an unreadable stamp is not extrapolated', () => {
    expect(at('playing', { media_duration: 0 })).toBeNull();
    expect(at('playing', { media_duration: undefined })).toBeNull();
    expect(at('playing', { media_position: undefined })).toBeNull();
    expect(mediaView(DEMO.kitchen()).position).toBeNull();
    expect(at('playing', { media_position_updated_at: 'never' })!.seconds).toBe(45);
    expect(at('playing', { media_position_updated_at: T0 + 5000 })!.seconds).toBe(50);
  });

  it('a pending seek target replaces HA\'s position and moves on from its send time only while playing', () => {
    const sent = pend({ position: 120, positionAt: T0 + 8000 });
    expect(at('playing', {}, T0 + 10_000, sent)).toEqual({ seconds: 122, duration: 300, held: true });
    expect(at('paused', {}, T0 + 10_000, sent)!.seconds).toBe(120);
    expect(at('playing', {}, T0 + 10_000, pend({ position: 120, positionAt: null }))!.seconds).toBe(120);
    expect(at('playing', {}, T0 + 10_000, pend({ position: 120, positionAt: null, trackChange: true }))!.held).toBe(false);
  });

  it('formats m:ss and h:mm:ss as HA formatMediaTime', () => {
    expect([formatMediaTime(45), formatMediaTime(300), formatMediaTime(3730), formatMediaTime(-3), formatMediaTime(Infinity)]).toEqual(['0:45', '5:00', '1:02:10', '0:00', '']);
  });
});

describe('artwork', () => {
  const art = (state: string, a: Record<string, unknown>, hass?: { hassUrl?: (p?: string) => string }) => mediaView(entity('media_player.x', state, a), { hass }).artwork;
  const hassUrl = vi.fn((p = '') => `http://ha.local:8123${p}`);

  it('entity_picture_local first, then entity_picture', () => {
    expect(art('playing', { entity_picture: 'https://cdn/a.jpg', entity_picture_local: '/api/media_player_proxy/x?token=t' })).toBe('/api/media_player_proxy/x?token=t');
    expect(art('playing', { entity_picture: 'https://cdn/a.jpg', entity_picture_local: '' })).toBe('https://cdn/a.jpg');
  });

  it('through hassUrl when it exists, as is without it; an empty URL never reaches hassUrl', () => {
    expect(art('playing', { entity_picture: '/api/p' }, { hassUrl })).toBe('http://ha.local:8123/api/p');
    expect(art('playing', { entity_picture: '/api/p' }, {})).toBe('/api/p');
    hassUrl.mockClear();
    expect(art('playing', { entity_picture: '' }, { hassUrl })).toBeNull();
    expect(hassUrl).not.toHaveBeenCalled();
  });

  it('only while playing, paused or buffering', () => {
    const a = { entity_picture: '/api/p' };
    expect(['playing', 'paused', 'buffering', 'idle', 'standby', 'on', 'off', 'unavailable', 'unknown'].map((s) => art(s, a))).toEqual(['/api/p', '/api/p', '/api/p', null, null, null, null, null, null]);
    expect(mediaView(DEMO.group()).artwork).toBeNull();
  });
});
