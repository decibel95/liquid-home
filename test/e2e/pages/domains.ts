import type { HomeAssistant } from '@decibel95/liquid-core';
import { COVER_FIXTURES } from '../../covers/fixtures';
import { FAN_FIXTURES } from '../../fans/fixtures';
import { MEDIA_FIXTURES } from '../../cards/media/fixtures';
import { loadBundle } from './fake-hass';

/**
 * The built bundle (dist/liquid-home.js, as HACS ships it) on a plain page with a fake hass of cover, fan and light
 * entities. Pieces, chosen with ?show= (comma separated):
 * - badges-ha: a long-name badge of each domain in a row with Home Assistant's rule `.badges > * { min-width: fit-content }`
 * - badges-plain: the same badges in a plain wrapping row
 * - history: a cover tile (cover.hall_window) and a fan badge (fan.living_room_fan), both opening the sheet
 * - media-history: a media tile and a media badge (media_player.lh_fixture_playing), both opening the sheet
 * - badges-media: the long-name media badges (fixture name, and a long `name` option) in the Home Assistant badge row
 * - tiles-media: the long-name media tile (long friendly name, title and artist) and a short one, in a column that fills the page
 * - room: a room card (list source) with a fan whose preset word is wider than its tile value
 * `?glass=dark|light`. Calls and `location-changed` events are recorded on window.__domains.
 */
const LONG = 'Upstairs Guest Bathroom Skylight Over The Bathtub Left Side Near The Window';
type El = HTMLElement & { hass?: HomeAssistant; setConfig(c: unknown): void };
const w = window as unknown as { __domains: { ready: boolean; calls: { domain: string; service: string; data: unknown }[]; locations: string[] } };
w.__domains = { ready: false, calls: [], locations: [] };
window.addEventListener('location-changed', () => w.__domains.locations.push(location.pathname + location.search));

const params = new URLSearchParams(location.search);
const glass = params.get('glass') === 'light' ? 'light' : 'dark';
const show = (params.get('show') ?? 'badges-ha').split(',');
if (glass === 'light') document.body.style.background = '#e7e9ee';

const states: Record<string, unknown> = {};
const add = (s: { entity_id: string }) => (states[s.entity_id] = s);
const cover = COVER_FIXTURES.hall();
add(cover);
const longCover = COVER_FIXTURES.longName();
add(longCover);
const fan = FAN_FIXTURES.off();
add(fan);
const longFan = FAN_FIXTURES.longName();
add(longFan);
const mediaPlaying = MEDIA_FIXTURES.playing();
add(mediaPlaying);
const mediaLong = MEDIA_FIXTURES.long_title();
add(mediaLong);
const light = {
  entity_id: 'light.long_light',
  state: 'on',
  attributes: { friendly_name: `${LONG} Lights`, supported_features: 0, supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 180 },
  last_changed: '',
  last_updated: '',
  context: { id: '', parent_id: null, user_id: null },
};
add(light);
// A fan with a preset word wider than a room tile value.
const presetFan = FAN_FIXTURES.presetAuto();
presetFan.entity_id = 'fan.preset_fan';
presetFan.attributes = { ...presetFan.attributes, friendly_name: 'Preset Fan', preset_mode: 'Extraordinarily long preset' };
add(presetFan);

const hass = {
  states,
  entities: {},
  devices: {},
  areas: {},
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: 'language' },
  themes: { darkMode: glass === 'dark' },
  config: { unit_system: { temperature: '°C' } },
  callService: async (domain: string, service: string, data: unknown) => {
    w.__domains.calls.push({ domain, service, data });
  },
} as unknown as HomeAssistant;

function mount(tag: string, config: Record<string, unknown>, parent: HTMLElement): El {
  const el = document.createElement(tag) as El;
  el.setConfig({ type: `custom:${tag}`, look: { glass }, ...config });
  el.hass = hass;
  parent.append(el);
  return el;
}

try {
  await loadBundle('liquid-home');
  const stage = document.getElementById('stage')!;
  for (const piece of show) {
    const holder = document.createElement('div');
    holder.id = piece;
    stage.append(holder);
    if (piece === 'badges-ha' || piece === 'badges-plain') {
      const row = document.createElement('div');
      row.className = `badges ${piece === 'badges-ha' ? 'ha' : 'plain'}`;
      holder.append(row);
      const items: [string, Record<string, unknown>][] = [
        [light.entity_id, {}],
        [longCover.entity_id, {}],
        [cover.entity_id, { name: `${LONG} Blind` }],
        [longFan.entity_id, {}],
        [fan.entity_id, { name: `${LONG} Ceiling Fan` }],
      ];
      for (const [entity, extra] of items) {
        const b = mount('liquid-home-badge', { entity, tap_action: 'sheet', ...extra }, row);
        b.dataset.entity = entity;
      }
    } else if (piece === 'history') {
      mount('liquid-home-tile', { entity: cover.entity_id, tap_action: 'sheet' }, holder).id = 'hist-tile';
      const row = document.createElement('div');
      row.className = 'badges plain';
      holder.append(row);
      mount('liquid-home-badge', { entity: fan.entity_id, tap_action: 'sheet' }, row).id = 'hist-badge';
    } else if (piece === 'media-history') {
      mount('liquid-home-tile', { entity: mediaPlaying.entity_id, tap_action: 'sheet' }, holder).id = 'hist-media-tile';
      const row = document.createElement('div');
      row.className = 'badges plain';
      holder.append(row);
      mount('liquid-home-badge', { entity: mediaPlaying.entity_id, tap_action: 'sheet' }, row).id = 'hist-media-badge';
    } else if (piece === 'badges-media') {
      const row = document.createElement('div');
      row.className = 'badges ha';
      holder.append(row);
      for (const extra of [{}, { name: `${LONG} Speaker` }]) {
        const b = mount('liquid-home-badge', { entity: mediaLong.entity_id, tap_action: 'sheet', ...extra }, row);
        b.dataset.entity = mediaLong.entity_id;
      }
    } else if (piece === 'tiles-media') {
      mount('liquid-home-tile', { entity: mediaLong.entity_id, tap_action: 'sheet' }, holder).id = 'long-media-tile';
      mount('liquid-home-tile', { entity: mediaLong.entity_id, name: `${LONG} Speaker`, tap_action: 'sheet' }, holder).id = 'long-media-tile-named';
    } else if (piece === 'room') {
      const el = mount('liquid-home-room', { title: 'Room', domains: ['light', 'cover', 'fan'], entities: [presetFan.entity_id, cover.entity_id] }, holder);
      el.id = 'room-card';
    }
  }
  await Promise.all([...stage.querySelectorAll<El & { updateComplete?: Promise<unknown> }>('*')].filter((e) => e.updateComplete).map((e) => e.updateComplete));
  w.__domains.ready = true;
} catch (err) {
  console.error(err);
  w.__domains.ready = true;
  throw err;
}
