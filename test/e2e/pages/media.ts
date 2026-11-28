import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import { applyMediaCall } from '../../cards/media/fixtures';
import { loadBundle } from './fake-hass';

/**
 * The built bundle (dist/liquid-home.js, as HACS ships it) with one controllable media player on a fake hass. Used by
 * media.spec.ts and rtl.spec.ts. Query:
 * - show=card,tile,badge (default card,tile): what is mounted; the card and the tile share the player.
 * - state=playing|paused|buffering|off (default playing); art=<url>|none (default /dev/covers/cover-dark.png).
 * - glass=dark|light, dir=ltr|rtl, lang=en, motion=rich|subtle|minimal, hold=<write_hold seconds>.
 * - echo=<ms>|none: the fake player applies a call after this long (default 800), or never.
 * - spacer=<px>: height of the block under the card (default 1800) so a test can scroll the card off screen.
 * - sources=<a,b,c>: the source list (the first is the current one).
 * - tilename=<text>: friendly name of the player (a long one for the overflow checks).
 * window.__media: ready, calls (service calls with the page time), patch(attrs, state?), setPicture(url), sheetOpen().
 */
const ID = 'media_player.e2e_player';
/** PAUSE, SEEK, VOLUME_SET, VOLUME_MUTE, PREVIOUS, NEXT, TURN_ON, TURN_OFF, VOLUME_STEP, SELECT_SOURCE, STOP, PLAY, SHUFFLE_SET, SELECT_SOUND_MODE, REPEAT_SET. */
const FEATURES = 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 1024 | 2048 | 4096 | 16384 | 32768 | 65536 | 262144;

type El = HTMLElement & { hass?: HomeAssistant; setConfig(c: unknown): void; updateComplete?: Promise<unknown> };
interface Call {
  t: number;
  domain: string;
  service: string;
  data: Record<string, unknown>;
}
interface Api {
  ready: boolean;
  error?: string;
  calls: Call[];
  patch(attrs: Record<string, unknown>, state?: string): void;
  setPicture(url: string | null): void;
}
const w = window as unknown as { __media: Api };

const params = new URLSearchParams(location.search);
const glass = params.get('glass') === 'light' ? 'light' : 'dark';
const show = (params.get('show') ?? 'card,tile').split(',');
const echo = params.get('echo') === 'none' ? null : Number(params.get('echo') ?? 800);
const art = params.get('art') ?? '/dev/covers/cover-dark.png';
const lang = params.get('lang') ?? 'en';
const motion = params.get('motion') ?? undefined;
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
if (glass === 'light') document.body.classList.add('light');

const calls: Call[] = [];
const iso = (ms: number) => new Date(ms).toISOString();
let player = {
  entity_id: ID,
  state: params.get('state') ?? 'playing',
  attributes: {
    friendly_name: params.get('tilename') ?? 'Kitchen speaker',
    supported_features: FEATURES,
    volume_level: 0.6,
    is_volume_muted: false,
    media_title: 'Paper Lanterns',
    media_artist: 'Synthetic Set',
    app_name: 'Bounzz',
    media_content_id: 'track-1',
    media_content_type: 'music',
    media_duration: 300,
    media_position: 45,
    media_position_updated_at: iso(Date.now()),
    source: (params.get('sources') ?? 'HDMI 1,HDMI 2,Netflix,YouTube').split(',')[0],
    source_list: (params.get('sources') ?? 'HDMI 1,HDMI 2,Netflix,YouTube').split(','),
    sound_mode: 'Music',
    sound_mode_list: ['Music', 'Movie', 'Night'],
    shuffle: false,
    repeat: 'off',
    ...(art === 'none' ? {} : { entity_picture: art }),
  },
  last_changed: iso(Date.now()),
  last_updated: iso(Date.now()),
  context: { id: ID, parent_id: null, user_id: null },
} as unknown as HassEntity;

const els: El[] = [];
let hass: HomeAssistant;
const publish = () => {
  hass = {
    states: { [ID]: player },
    entities: {},
    devices: {},
    areas: {},
    language: lang,
    locale: { language: lang, number_format: 'language', time_format: 'language' },
    themes: { darkMode: glass === 'dark' },
    config: { unit_system: { temperature: '°C' } },
    callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
      calls.push({ t: performance.now(), domain, service, data });
      if (echo === null) return;
      setTimeout(() => {
        player = applyMediaCall(player, service, data);
        publish();
      }, echo);
    },
  } as unknown as HomeAssistant;
  for (const e of els) e.hass = hass;
};

w.__media = {
  ready: false,
  calls,
  patch(attrs, state) {
    player = { ...player, state: state ?? player.state, attributes: { ...player.attributes, ...attrs }, last_updated: iso(Date.now()) } as HassEntity;
    publish();
  },
  setPicture(url) {
    const attributes = { ...player.attributes } as Record<string, unknown>;
    if (url) attributes.entity_picture = url;
    else delete attributes.entity_picture;
    player = { ...player, attributes, last_updated: iso(Date.now()) } as HassEntity;
    publish();
  },
};

try {
  await loadBundle('liquid-home');
  const stage = document.getElementById('stage')!;
  const mount = (tag: string, id: string, extra: Record<string, unknown> = {}, parent: HTMLElement = stage): El => {
    const el = document.createElement(tag) as El;
    el.id = id;
    el.setConfig({ type: `custom:${tag}`, entity: ID, look: { glass, ...(motion ? { motion } : {}) }, ...(params.has('hold') ? { write_hold: Number(params.get('hold')) } : {}), ...extra });
    els.push(el);
    parent.append(el);
    return el;
  };
  if (show.includes('card')) mount('liquid-home-media-card', 'card');
  if (show.includes('tile')) mount('liquid-home-tile', 'tile', { tap_action: 'sheet' });
  if (show.includes('badge')) {
    const row = document.createElement('div');
    row.id = 'badges';
    stage.append(row);
    mount('liquid-home-badge', 'badge', { tap_action: 'sheet' }, row);
  }
  const below = document.createElement('div');
  below.id = 'below';
  below.style.height = `${Number(params.get('spacer') ?? 1800)}px`;
  stage.append(below);
  publish();
  await Promise.all(els.map((e) => e.updateComplete));
  w.__media.ready = true;
} catch (err) {
  w.__media.error = String((err as Error)?.stack ?? err);
  w.__media.ready = true;
  throw err;
}
