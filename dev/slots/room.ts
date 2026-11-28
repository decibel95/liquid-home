import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import type { SlotMount } from './types';
import '../../src/cards/room';
import { createCoverSim } from '../../test/covers/sim';
import { applyFanCall, FAN_FIXTURES, type FanState } from '../../test/fans/fixtures';
import { applyMediaCall, MEDIA_FIXTURES } from '../../test/cards/media/fixtures';

/** The three layouts of the room card (the Liquid Climate cluster's container widths): wide, medium, narrow. */
const WIDTHS = [
  { key: 'wide', px: 780 },
  { key: 'medium', px: 560 },
  { key: 'narrow', px: 360 },
] as const;
const GLASSES = ['dark', 'light'] as const;

const AREA = 'living_room';
const GROUP = 'light.lh_fixture_living_room_lights';

/**
 * The fake hass has no registries; the room card reads areas through them. DERIVED, as the test HA (plan 2.8): the
 * group's three members and the dimmed Kitchen Lights sit in the Living Room area, each through its own device (as the
 * test HA assigns devices); the unavailable Office light is assigned to the area directly, as an entity.
 */
export function withRegistry(hass: HomeAssistant, ids: Record<string, string>): HomeAssistant {
  const viaDevice = ['light.ceiling_lights', 'light.living_room_rgbww_lights', 'light.entrance_color_white_lights', ids.dimmed];
  const entities: HomeAssistant['entities'] = {};
  const devices: HomeAssistant['devices'] = {};
  for (const id of viaDevice) {
    const device = `dev_${id.slice('light.'.length)}`;
    devices[device] = { id: device, name: hass.states[id]?.attributes.friendly_name, area_id: AREA };
    entities[id] = { entity_id: id, device_id: device, platform: 'demo' };
  }
  entities[ids.unavailable] = { entity_id: ids.unavailable, platform: 'demo', area_id: AREA };
  return { ...hass, entities, devices, areas: { [AREA]: { area_id: AREA, name: 'Living Room' } } };
}

/** DERIVED, as the test HA Living Room (plan 2.11): covers through their device or the entity, fans as entities. */
const COVERS_VIA_DEVICE = ['cover.hall_window', 'cover.living_room_window'];
const DIRECT = ['cover.garage_door', 'fan.living_room_fan', 'fan.lh_fixture_onoff', 'fan.lh_fixture_ten'];

/** withRegistry plus the covers and fans of the mixed room: the Garage Door stands in for the test HA blind fixture. */
export function withMixedRegistry(hass: HomeAssistant, ids: Record<string, string>): HomeAssistant {
  const h = withRegistry(hass, ids);
  const entities = { ...h.entities };
  const devices = { ...h.devices };
  for (const id of COVERS_VIA_DEVICE) {
    const device = `dev_${id.slice('cover.'.length)}`;
    devices[device] = { id: device, area_id: AREA };
    entities[id] = { entity_id: id, device_id: device, platform: 'demo' };
  }
  for (const id of DIRECT) entities[id] = { entity_id: id, platform: 'demo', area_id: AREA };
  return { ...h, entities, devices };
}

/**
 * DERIVED media players of the canvas Room board (P3-CHO-22 to 25): the demo Kitchen player (playing, 100 %), the
 * Lounge room paused (the demo one plays) and an unavailable Walkman in the Living Room; for the media-only Kitchen room
 * the Walkman paused at 100 % (the paused fixture renamed), the demo Group (no title, no picture) and an unavailable
 * Bedroom. The demo players have no area on the test HA, so the Living Room ones get it here, through the entity.
 */
function mediaPlayers(): Record<string, HassEntity> {
  const out: Record<string, HassEntity> = {};
  const add = (s: HassEntity, patch: { id?: string; name?: string; state?: string } = {}) => {
    const id = patch.id ?? s.entity_id;
    out[id] = { ...s, entity_id: id, state: patch.state ?? s.state, attributes: { ...s.attributes, ...(patch.name ? { friendly_name: patch.name } : {}) } };
  };
  add(MEDIA_FIXTURES.kitchen());
  add(MEDIA_FIXTURES.lounge_room(), { state: 'paused' });
  add(MEDIA_FIXTURES.unavailable(), { id: 'media_player.walkman', name: 'Walkman' });
  add(MEDIA_FIXTURES.paused(), { id: 'media_player.walkman_paused', name: 'Walkman' });
  add(MEDIA_FIXTURES.group());
  add(MEDIA_FIXTURES.unavailable(), { id: 'media_player.bedroom', name: 'Bedroom' });
  return out;
}
const MEDIA_IN_AREA = ['media_player.kitchen', 'media_player.lounge_room', 'media_player.walkman'];
const KITCHEN_ROOM = ['media_player.kitchen', 'media_player.walkman_paused', 'media_player.group', 'media_player.bedroom'];

/**
 * Dev harness slot of the room card. Three configurations, each on dark and light glass at the three widths:
 * - CHO-12 (list): one member on (Ceiling Lights, 2631 K), one off (Living Room RGBWW), one unavailable (Office RGBW),
 *   with the derived group as power entity.
 * - Area: every light in the Living Room area (the group members, the dimmed Kitchen Lights, the unavailable Office
 *   light) with the group as power entity; Entrance is on/off-only.
 * - Mixed (0.3, P2-CHO-17 to 19): the same area with `domains: [light, cover, fan]`: the lights, Hall Window and Living
 *   Room Window (device area), the Garage Door and three fans (entity area). Covers run on the cover simulator (echo
 *   250 ms, motor 10 % per second), fans as HA's demo fan after 0.8 s; calls are logged.
 * - Media (0.4, P3-CHO-22 to 25): the mixed room with `domains: [light, cover, fan, media_player]` and the Living Room
 *   players of mediaPlayers(); Kitchen: a media-only room (`domains: [media_player]`, list source) without a power
 *   button. Media calls are logged and applied as a fake player after 0.8 s (test/cards/media/fixtures.ts).
 * `?room=mixed|media|kitchen` shows only that room, `?glass=dark|light` one glass (for screenshots).
 */
export const mount: SlotMount = ({ container, hass, ids, onHass, log }) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('room');
  const glasses = GLASSES.filter((g) => !params.get('glass') || params.get('glass') === g);
  const sim = createCoverSim({ travelMs: 4000, onCall: (c) => log(`${new Date().toLocaleTimeString()}  ${c.domain}.${c.service} ${JSON.stringify(c.data)}`) });
  const fans: Record<string, FanState> = {};
  for (const make of [FAN_FIXTURES.off, FAN_FIXTURES.onoff, FAN_FIXTURES.ten]) {
    const f = make();
    fans[f.entity_id] = f;
  }
  const players = mediaPlayers();
  let base = hass;
  /** The mixed hass plus the media players (Living Room ones in the area registry); media calls go to their fakes. */
  const mediaHass = (): HomeAssistant => {
    const h = mixedHass();
    const entities = { ...h.entities };
    for (const id of MEDIA_IN_AREA) entities[id] = { entity_id: id, platform: 'demo', area_id: AREA };
    return {
      ...h,
      entities,
      states: { ...h.states, ...players },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        if (domain !== 'media_player') return h.callService(domain, service, data);
        log(`${new Date().toLocaleTimeString()}  media_player.${service} ${JSON.stringify(data)}`);
        setTimeout(() => {
          const id = data.entity_id as string;
          if (players[id]) players[id] = applyMediaCall(players[id], service, data);
          publish();
        }, 800);
      },
    } as HomeAssistant;
  };
  /** The harness hass with the cover simulator's states and the fans on top; cover and fan calls go to their fakes. */
  const mixedHass = (): HomeAssistant =>
    ({
      ...withMixedRegistry(base, ids),
      states: { ...base.states, ...sim.hass.states, ...fans },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        if (domain === 'cover') return sim.hass.callService(domain, service, data);
        if (domain !== 'fan') return base.callService(domain, service, data);
        log(`${new Date().toLocaleTimeString()}  fan.${service} ${JSON.stringify(data)}`);
        setTimeout(() => {
          const id = data.entity_id as string;
          if (fans[id]) fans[id] = applyFanCall(fans[id], service, data);
          publish();
        }, 800);
      },
    }) as HomeAssistant;

  const allConfigs = [
    {
      label: 'CHO-12: one on, one off, one unavailable (source list)',
      config: {
        type: 'custom:liquid-home-room',
        title: 'Living Room',
        power_entity: GROUP,
        entities: [ids.colourTemp, ids.off, ids.unavailable],
      },
    },
    {
      label: 'Area living_room with the group as power entity (source inferred: area)',
      config: { type: 'custom:liquid-home-room', area: AREA, power_entity: GROUP },
    },
    {
      key: 'mixed',
      label: 'Mixed: area living_room with domains light, cover and fan (0.3)',
      config: { type: 'custom:liquid-home-room', area: AREA, domains: ['light', 'cover', 'fan'] },
    },
    {
      key: 'media',
      label: 'Media: area living_room with domains light, cover, fan and media_player (0.4, P3-CHO-22 to 24)',
      config: { type: 'custom:liquid-home-room', area: AREA, domains: ['light', 'cover', 'fan', 'media_player'] },
    },
    {
      key: 'kitchen',
      label: 'Kitchen: media players only, no power button (0.4, P3-CHO-25)',
      config: { type: 'custom:liquid-home-room', title: 'Kitchen', domains: ['media_player'], entities: KITCHEN_ROOM },
    },
  ];
  const configs = allConfigs.filter((c) => !only || ('key' in c && c.key === only));

  container.style.flexDirection = 'column';
  type Kind = 'plain' | 'mixed' | 'media';
  const cards: { card: HTMLElement; kind: Kind }[] = [];
  const hassFor = (kind: Kind) => (kind === 'media' ? mediaHass() : kind === 'mixed' ? mixedHass() : withRegistry(base, ids));
  for (const entry of configs) {
    const { label, config } = entry;
    const key = 'key' in entry ? entry.key : undefined;
    const kind: Kind = key === 'media' || key === 'kitchen' ? 'media' : key ? 'mixed' : 'plain';
    for (const glass of glasses) {
      const heading = document.createElement('p');
      heading.className = 'note';
      heading.textContent = `${label}, ${glass} glass`;
      container.append(heading);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start';
      for (const w of WIDTHS) {
        const box = document.createElement('div');
        box.dataset.room = `${key ?? ('area' in config ? 'area' : 'list')}-${glass}-${w.key}`;
        box.style.cssText = `width:${w.px}px;max-width:100%`;
        const card = document.createElement('liquid-home-room') as HTMLElement & { setConfig(c: unknown): void; hass: HomeAssistant };
        card.setConfig({ ...config, look: { glass } });
        card.hass = hassFor(kind);
        box.append(card);
        row.append(box);
        cards.push({ card, kind });
      }
      container.append(row);
    }
  }
  function publish() {
    const by = { plain: withRegistry(base, ids), mixed: mixedHass(), media: mediaHass() };
    for (const c of cards) (c.card as unknown as { hass: HomeAssistant }).hass = by[c.kind];
  }
  sim.onHass(() => publish());
  onHass((next) => {
    base = next;
    publish();
  });
};
