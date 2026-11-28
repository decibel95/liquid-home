import type { HassEntity } from '@decibel95/liquid-core';

/**
 * Media player fixtures for the media card (plan 2.5). REAL: the HA demo players kitchen (914877), living_room
 * (119695), lounge_room (121265) and group (643983) as read on the test HA 2026.11.2 (liquid-home-0.4-research-demo.md).
 * DERIVED: the `lh_fixture_*` states of plan 2.10 with the feature numbers of the test HA fixtures (30141 generic,
 * 21439 paused, buffering and seek_live, 21391 standby and unavailable, 30137 volume_step, 554429 grouped, 95677
 * speaker_modes, 325053 shuffle_repeat, 22973 tv_sources, 384 onoff_only). Covers are the six synthetic covers
 * (dev/covers, from lh04-canvas/calc/covers.py); no real artwork. Each fixture is a function, so every use gets a fresh
 * object; positions are stamped at the call.
 */

const iso = (ms: number) => new Date(ms).toISOString();

export function entity(entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  const ts = iso(Date.now());
  return {
    entity_id,
    state,
    attributes,
    last_changed: ts,
    last_updated: ts,
    context: { id: entity_id, parent_id: null, user_id: null },
  } as HassEntity;
}

/** The synthetic covers, served by the dev harness from dev/covers. */
export const COVER = {
  dark: '/dev/covers/cover-dark.png',
  light: '/dev/covers/cover-light.png',
  saturated: '/dev/covers/cover-saturated.png',
  busy: '/dev/covers/cover-busy.png',
  r43: '/dev/covers/cover-43.png',
  wide: '/dev/covers/cover-wide.png',
} as const;

const KITCHEN = {
  volume_level: 1,
  is_volume_muted: false,
  sound_mode: 'Music',
  sound_mode_list: ['Music', 'Movie'],
  shuffle: false,
  repeat: 'off',
  media_title: 'I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)',
  media_artist: 'Technohead',
  media_album_name: 'Bounzz',
  media_content_id: 'bounzz-1',
  media_content_type: 'music',
  media_duration: 213,
  group_members: [],
};

/** A playing music track with a position (duration 245, at 83 s), the prototype's section 1 player. */
const track = (a: Record<string, unknown> = {}) => ({
  ...KITCHEN,
  volume_level: 1,
  media_title: 'Paper Lanterns',
  media_artist: 'Synthetic Set',
  app_name: 'Bounzz',
  media_content_id: 'track-1',
  media_duration: 245,
  media_position: 83,
  media_position_updated_at: iso(Date.now()),
  entity_picture: COVER.dark,
  ...a,
});

export const MEDIA_FIXTURES = {
  // ---- REAL demo players -------------------------------------------------
  /** kitchen: 914877, music, no SEEK, no position: no seek line. Square art. */
  kitchen: () =>
    entity('media_player.kitchen', 'playing', {
      ...KITCHEN,
      friendly_name: 'Kitchen',
      supported_features: 914877,
      entity_picture: COVER.light,
    }),
  /** living_room: 119695, video, 4:3 art, SEEK, 45 of 300 s, no previous or next. */
  living_room: () =>
    entity('media_player.living_room', 'playing', {
      ...KITCHEN,
      media_artist: undefined,
      friendly_name: 'Living Room',
      supported_features: 119695,
      media_title: '♥♥ The Best Fireplace Video (3 hours)',
      app_name: 'YouTube',
      media_content_id: 'eyU3bRy2x44',
      media_content_type: 'movie',
      media_duration: 300,
      media_position: 45,
      media_position_updated_at: iso(Date.now()),
      entity_picture: COVER.r43,
    }),
  /** lounge_room: 121265, tvshow, no volume bits, source dvd. */
  lounge_room: () =>
    entity('media_player.lounge_room', 'playing', {
      friendly_name: 'Lounge room',
      supported_features: 121265,
      media_title: 'Chapter 1',
      media_series_title: 'House of Cards',
      media_season: '1',
      media_episode: '1',
      app_name: 'Netflix',
      device_class: 'tv',
      media_content_id: 'house-of-cards-1',
      media_content_type: 'tvshow',
      media_duration: 3600,
      source: 'dvd',
      source_list: ['dvd', 'youtube'],
      sound_mode: 'Music',
      sound_mode_list: ['Music', 'Movie'],
      shuffle: false,
      entity_picture: COVER.saturated,
    }),
  /** group: 643983, no title, no picture. */
  group: () =>
    entity('media_player.group', 'playing', {
      volume_level: 1,
      is_volume_muted: false,
      sound_mode: 'Music',
      sound_mode_list: ['Music', 'Movie'],
      shuffle: false,
      friendly_name: 'Group',
      supported_features: 643983,
      group_members: null,
    }),

  // ---- DERIVED lh_fixture_* states ---------------------------------------
  playing: () => entity('media_player.lh_fixture_playing', 'playing', track({ friendly_name: 'Kitchen', supported_features: 30141 })),
  artwork_16x9: () =>
    entity(
      'media_player.lh_fixture_artwork_16x9',
      'playing',
      track({
        friendly_name: 'Kitchen',
        supported_features: 30141,
        entity_picture: COVER.wide,
      }),
    ),
  paused: () =>
    entity(
      'media_player.lh_fixture_paused',
      'paused',
      track({
        friendly_name: 'Living Room',
        supported_features: 21439,
        media_position: 45,
        media_duration: 300,
        entity_picture: COVER.r43,
      }),
    ),
  buffering: () =>
    entity(
      'media_player.lh_fixture_buffering',
      'buffering',
      track({
        friendly_name: 'Living Room',
        supported_features: 21439,
        media_position: 45,
        media_duration: 300,
        entity_picture: COVER.r43,
      }),
    ),
  seek_live: () =>
    entity(
      'media_player.lh_fixture_seek_live',
      'playing',
      track({
        friendly_name: 'Seek live',
        supported_features: 21439,
        entity_picture: COVER.busy,
      }),
    ),
  long_track: () =>
    entity(
      'media_player.lh_fixture_long_track',
      'playing',
      track({
        friendly_name: 'Living Room',
        supported_features: 21439,
        media_duration: 12300,
        media_position: 3730,
        entity_picture: COVER.r43,
      }),
    ),
  idle: () =>
    entity('media_player.lh_fixture_idle', 'idle', {
      ...KITCHEN,
      media_title: undefined,
      media_artist: undefined,
      friendly_name: 'Kitchen',
      supported_features: 30141,
    }),
  standby: () =>
    entity('media_player.lh_fixture_standby', 'standby', {
      friendly_name: 'Living Room',
      supported_features: 21391,
    }),
  off: () =>
    entity('media_player.lh_fixture_off', 'off', {
      friendly_name: 'Kitchen',
      supported_features: 30141,
    }),
  off_no_turn_on: () =>
    entity('media_player.lh_fixture_off_no_turn_on', 'off', {
      friendly_name: 'Kitchen',
      supported_features: 30141 & ~128,
    }),
  unavailable: () =>
    entity('media_player.lh_fixture_unavailable', 'unavailable', {
      friendly_name: 'Kitchen',
      supported_features: 21391 | 16 | 32,
      restored: true,
    }),
  unknown: () =>
    entity('media_player.lh_fixture_unknown', 'unknown', {
      friendly_name: 'Kitchen',
      supported_features: 30141,
    }),
  muted: () =>
    entity(
      'media_player.lh_fixture_muted',
      'playing',
      track({
        friendly_name: 'Kitchen',
        supported_features: 30141,
        volume_level: 0.35,
        is_volume_muted: true,
      }),
    ),
  volume_mid: () =>
    entity(
      'media_player.lh_fixture_volume_mid',
      'playing',
      track({
        friendly_name: 'Kitchen',
        supported_features: 30141,
        volume_level: 0.35,
        entity_picture: COVER.saturated,
      }),
    ),
  volume_step: () => {
    const { volume_level: _v, ...rest } = track({
      friendly_name: 'Kitchen',
      supported_features: 30137,
      entity_picture: COVER.light,
    });
    return entity('media_player.lh_fixture_volume_step', 'playing', rest);
  },
  tv_sources: () =>
    entity('media_player.lh_fixture_tv_sources', 'playing', {
      ...MEDIA_FIXTURES.lounge_room().attributes,
      friendly_name: 'TV',
      supported_features: 22973,
      volume_level: 0.6,
      is_volume_muted: false,
      source: 'HDMI 1',
      source_list: ['HDMI 1', 'HDMI 2', 'Netflix', 'YouTube', 'Plex'],
      sound_mode_list: undefined,
      entity_picture: COVER.wide,
    }),
  speaker_modes: () =>
    entity(
      'media_player.lh_fixture_speaker_modes',
      'playing',
      track({
        friendly_name: 'Kitchen',
        supported_features: 95677,
        sound_mode: 'Night',
        sound_mode_list: ['Music', 'Movie', 'Night', 'Voice'],
      }),
    ),
  shuffle_repeat: () =>
    entity(
      'media_player.lh_fixture_shuffle_repeat',
      'playing',
      track({
        friendly_name: 'Kitchen',
        supported_features: 325053,
        shuffle: true,
        repeat: 'all',
        entity_picture: COVER.busy,
      }),
    ),
  onoff_only: () =>
    entity('media_player.lh_fixture_onoff_only', 'on', {
      friendly_name: 'Amplifier',
      supported_features: 384,
    }),
  onoff_off: () =>
    entity('media_player.lh_fixture_onoff_off', 'off', {
      friendly_name: 'Amplifier',
      supported_features: 384,
    }),
  no_artwork: () => {
    const { entity_picture: _p, ...rest } = track({
      friendly_name: 'Kitchen',
      supported_features: 30141,
    });
    return entity('media_player.lh_fixture_no_artwork', 'playing', rest);
  },
  long_title: () =>
    entity(
      'media_player.lh_fixture_long_title',
      'playing',
      track({
        friendly_name: 'Kitchen speaker with a rather long name for a small card',
        supported_features: 30141,
        media_title: 'A very long track title that runs well past two lines because some albums really do name their songs like this one',
        media_artist: 'An equally long artist name, featuring several guests and an orchestra',
        app_name: 'A streaming service with a long name',
        entity_picture: COVER.r43,
      }),
    ),
  rtl_title: () =>
    entity(
      'media_player.lh_fixture_rtl_title',
      'playing',
      track({
        friendly_name: 'Kitchen',
        supported_features: 30141,
        media_title: 'שיר ארוך מאוד 🎵 עם אימוג׳י',
        media_artist: 'فنان عربي',
        entity_picture: COVER.light,
      }),
    ),
  grouped: () =>
    entity(
      'media_player.lh_fixture_grouped',
      'playing',
      track({
        friendly_name: 'Downstairs',
        supported_features: 554429,
        entity_picture: COVER.saturated,
        group_members: ['media_player.lh_fixture_grouped', 'media_player.lh_fixture_group_member'],
      }),
    ),
};

export type MediaFixtureName = keyof typeof MEDIA_FIXTURES;

export const mediaIds = Object.fromEntries(Object.entries(MEDIA_FIXTURES).map(([k, make]) => [k, make().entity_id])) as Record<MediaFixtureName, string>;

const NEXT_TITLES = ['Static Bloom', 'Paper Lanterns', 'Night Ferry'];

/**
 * A media service applied as a fake player would answer it (the dev harness and the echo tests): state, volume, mute,
 * position, source, sound mode, and a new title on next or previous. Unknown services leave the state as it is.
 */
export function applyMediaCall(s: HassEntity, service: string, data: Record<string, unknown>): HassEntity {
  const a = { ...s.attributes } as Record<string, unknown>;
  let state = s.state;
  const now = iso(Date.now());
  const position = () => {
    const pos = typeof a.media_position === 'number' ? a.media_position : 0;
    const at = typeof a.media_position_updated_at === 'string' ? Date.parse(a.media_position_updated_at) : Date.now();
    return state === 'playing' ? pos + (Date.now() - at) / 1000 : pos;
  };
  switch (service) {
    case 'media_play':
      if (typeof a.media_position === 'number')
        Object.assign(a, {
          media_position: position(),
          media_position_updated_at: now,
        });
      state = 'playing';
      break;
    case 'media_pause':
      if (typeof a.media_position === 'number')
        Object.assign(a, {
          media_position: position(),
          media_position_updated_at: now,
        });
      state = 'paused';
      break;
    case 'media_next_track':
    case 'media_previous_track': {
      const i = (NEXT_TITLES.indexOf(String(a.media_title)) + (service === 'media_next_track' ? 1 : -1) + NEXT_TITLES.length) % NEXT_TITLES.length;
      Object.assign(a, {
        media_title: NEXT_TITLES[i],
        media_content_id: `track-${i}`,
        media_position: 0,
        media_position_updated_at: now,
      });
      state = 'playing';
      break;
    }
    case 'media_seek':
      Object.assign(a, {
        media_position: data.seek_position,
        media_position_updated_at: now,
      });
      break;
    case 'volume_set':
      a.volume_level = data.volume_level;
      break;
    case 'volume_up':
    case 'volume_down':
      a.volume_level = Math.min(
        1,
        Math.max(0, Math.round(((typeof a.volume_level === 'number' ? a.volume_level : 0.5) + (service === 'volume_up' ? 0.1 : -0.1)) * 100) / 100),
      );
      break;
    case 'volume_mute':
      a.is_volume_muted = data.is_volume_muted;
      break;
    case 'select_source':
      a.source = data.source;
      break;
    case 'select_sound_mode':
      a.sound_mode = data.sound_mode;
      break;
    case 'turn_on':
      state = 'on';
      break;
    case 'turn_off':
      state = 'off';
      break;
    default:
      return s;
  }
  return { ...s, state, attributes: a, last_updated: now };
}
