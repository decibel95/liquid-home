import type { HassEntity } from '@decibel95/liquid-core';

/**
 * Media player fixtures for the H1 unit tests. REAL: the eight HA demo players as read on the test HA 2026.11.2
 * (liquid-home-0.4-research-demo.md section 3: features, titles, content types, positions; tokens shortened). DERIVED:
 * the `lh_fixture_*` states of plan 2.10 (features 914873 volume step only, 384 on/off only, 121277 TV) and the states
 * the demo lacks. Every fixture is a function, so each test gets a fresh object; times are relative to `Date.now()`
 * at the call (tests fix the clock with fake timers).
 */

const iso = (ms: number) => new Date(ms).toISOString();

export function entity(entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  const ts = iso(Date.now());
  return { entity_id, state, attributes, last_changed: ts, last_updated: ts, context: { id: entity_id, parent_id: null, user_id: null } } as HassEntity;
}

const COMMON = { volume_level: 1, is_volume_muted: false, sound_mode: 'Music', sound_mode_list: ['Music', 'Movie'], shuffle: false };
const proxy = (id: string, cache: string) => `/api/media_player_proxy/media_player.${id}?token=0a1b2c&cache=${cache}`;

export const DEMO = {
  bedroom: () =>
    entity('media_player.bedroom', 'playing', {
      ...COMMON, friendly_name: 'Bedroom', supported_features: 119695, media_title: 'Epic sax guy 10 hours', app_name: 'YouTube',
      media_content_id: 'kxopViU98Xo', media_content_type: 'movie', media_duration: 360000, media_position: 54000,
      media_position_updated_at: iso(Date.now()), entity_picture: proxy('bedroom', 'e4513e'),
    }),
  living_room: () =>
    entity('media_player.living_room', 'playing', {
      ...COMMON, friendly_name: 'Living Room', supported_features: 119695, media_title: '♥♥ The Best Fireplace Video (3 hours)',
      app_name: 'YouTube', media_content_id: 'eyU3bRy2x44', media_content_type: 'movie', media_duration: 300, media_position: 45,
      media_position_updated_at: iso(Date.now()), entity_picture: proxy('living_room', 'bc2ffb'),
    }),
  kitchen: () =>
    entity('media_player.kitchen', 'playing', {
      ...COMMON, friendly_name: 'Kitchen', supported_features: 914877, media_title: 'I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)',
      media_artist: 'Technohead', media_album_name: 'Bounzz', media_track: 1, media_content_id: 'bounzz-1', media_content_type: 'music',
      media_duration: 213, repeat: 'off', group_members: [], entity_picture: proxy('kitchen', '62c0c5'),
    }),
  walkman: () =>
    entity('media_player.walkman', 'playing', {
      ...COMMON, friendly_name: 'Walkman', supported_features: 914877, media_title: 'I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)',
      media_artist: 'Technohead', media_album_name: 'Bounzz', media_track: 1, media_content_id: 'bounzz-1', media_content_type: 'music',
      media_duration: 213, repeat: 'off', group_members: [], entity_picture: proxy('walkman', '62c0c5'),
    }),
  lounge_room: () =>
    entity('media_player.lounge_room', 'playing', {
      ...COMMON, friendly_name: 'Lounge room', supported_features: 121265, media_title: 'Chapter 1', media_series_title: 'House of Cards',
      media_season: '1', media_episode: '1', app_name: 'Netflix', device_class: 'tv', media_content_id: 'house-of-cards-1',
      media_content_type: 'tvshow', media_duration: 3600, source: 'dvd', source_list: ['dvd', 'youtube'], entity_picture: proxy('lounge_room', 'a1b2c3'),
    }),
  group: () => entity('media_player.group', 'playing', { ...COMMON, friendly_name: 'Group', supported_features: 643983, group_members: null }),
  browse: () => entity('media_player.browse', 'playing', { volume_level: 1, is_volume_muted: false, sound_mode: 'Music', shuffle: false, friendly_name: 'Browse', supported_features: 4325376 }),
  search: () => entity('media_player.search', 'playing', { volume_level: 1, is_volume_muted: false, sound_mode: 'Music', shuffle: false, friendly_name: 'Search', supported_features: 4194304 }),
};

/** Playing with a position and Previous/Next: living_room (119695) plus PREVIOUS_TRACK and NEXT_TRACK, the prototype's section 1 and 3 player. */
const TRANSPORT = 119695 | 16 | 32;

const track = (id: string, a: Record<string, unknown> = {}) => ({
  ...COMMON, friendly_name: id, supported_features: TRANSPORT, media_title: 'Paper Lanterns', media_artist: 'Synthetic Set', app_name: 'Bounzz',
  media_content_type: 'music', media_content_id: 'track-1', media_duration: 245, media_position: 83, media_position_updated_at: iso(Date.now()),
  entity_picture: proxy(id, 'c0ffee'), ...a,
});

export const FIX = {
  /** Off: HA reports only the features and the name. */
  off: () => entity('media_player.lh_fixture_off', 'off', { friendly_name: 'Off', supported_features: 119695 }),
  /** Off with no attributes at all. */
  bare_off: () => entity('media_player.lh_fixture_bare', 'off', {}),
  standby: () => entity('media_player.lh_fixture_standby', 'standby', { friendly_name: 'Standby', supported_features: 119695, entity_picture: proxy('standby', 'aa') }),
  idle: () => entity('media_player.lh_fixture_idle', 'idle', { ...COMMON, friendly_name: 'Idle', supported_features: TRANSPORT, app_name: 'Spotify', entity_picture: proxy('idle', 'bb') }),
  on: () => entity('media_player.lh_fixture_on', 'on', { ...COMMON, friendly_name: 'On', supported_features: TRANSPORT }),
  paused: () => entity('media_player.lh_fixture_paused', 'paused', track('lh_fixture_paused')),
  buffering: () => entity('media_player.lh_fixture_buffering', 'buffering', track('lh_fixture_buffering')),
  unavailable: () => entity('media_player.lh_fixture_unavailable', 'unavailable', { friendly_name: 'Unavailable', supported_features: 119695, restored: true }),
  unknown: () => entity('media_player.lh_fixture_unknown', 'unknown', { friendly_name: 'Unknown', supported_features: 119695 }),
  /** Plays with a live position (duration 245): the seek, play and next tests. */
  transport: () => entity('media_player.lh_fixture_seek_live', 'playing', track('lh_fixture_seek_live')),
  /** kitchen (914877) without VOLUME_SET: 914873, no volume_level. */
  volume_step: () => {
    const { volume_level: _v, ...rest } = DEMO.kitchen().attributes;
    return entity('media_player.lh_fixture_volume_step', 'playing', { ...rest, friendly_name: 'Volume step', supported_features: 914873 });
  },
  /** TURN_ON and TURN_OFF only (384). */
  onoff_only: () => entity('media_player.lh_fixture_onoff_only', 'on', { friendly_name: 'Amplifier', supported_features: 384 }),
  /** lounge_room (121265) plus VOLUME_SET and VOLUME_MUTE: 121277, five sources, volume 60 %. */
  tv_sources: () =>
    entity('media_player.lh_fixture_tv_sources', 'playing', {
      ...DEMO.lounge_room().attributes, friendly_name: 'TV', supported_features: 121277, volume_level: 0.6,
      source: 'HDMI 1', source_list: ['HDMI 1', 'HDMI 2', 'Netflix', 'YouTube', 'Plex'],
    }),
  volume_mid: () => entity('media_player.lh_fixture_volume_mid', 'playing', track('lh_fixture_volume_mid', { volume_level: 0.35 })),
  muted: () => entity('media_player.lh_fixture_muted', 'playing', track('lh_fixture_muted', { volume_level: 0.35, is_volume_muted: true })),
  volume_zero: () => entity('media_player.lh_fixture_volume_zero', 'playing', track('lh_fixture_volume_zero', { volume_level: 0 })),
  speaker_modes: () =>
    entity('media_player.lh_fixture_speaker_modes', 'playing', track('lh_fixture_speaker_modes', { sound_mode: 'Music', sound_mode_list: ['Music', 'Movie', 'Night', 'Voice'] })),
  shuffle_repeat: () =>
    entity('media_player.lh_fixture_shuffle_repeat', 'playing', track('lh_fixture_shuffle_repeat', { supported_features: TRANSPORT | 262144, shuffle: true, repeat: 'off' })),
  grouped: () =>
    entity('media_player.lh_fixture_grouped', 'playing', track('lh_fixture_grouped', { supported_features: TRANSPORT | 524288, group_members: ['media_player.lh_fixture_grouped', 'media_player.lh_fixture_group_member'] })),
};
