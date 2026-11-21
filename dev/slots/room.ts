import type { HomeAssistant } from '@decibel95/liquid-core';
import type { SlotMount } from './types';
import '../../src/cards/room';

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

/**
 * Dev harness slot of the room card. Two configurations, each on dark and light glass at the three widths:
 * - CHO-12 (list): one member on (Ceiling Lights, 2631 K), one off (Living Room RGBWW), one unavailable (Office RGBW),
 *   with the derived group as power entity.
 * - Area: every light in the Living Room area (the group members, the dimmed Kitchen Lights, the unavailable Office
 *   light) with the group as power entity; Entrance is on/off-only.
 */
export const mount: SlotMount = ({ container, hass, ids, onHass, log }) => {
  const configs = [
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
  ];

  container.style.flexDirection = 'column';
  const cards: HTMLElement[] = [];
  for (const { label, config } of configs) {
    for (const glass of GLASSES) {
      const heading = document.createElement('p');
      heading.className = 'note';
      heading.textContent = `${label}, ${glass} glass`;
      container.append(heading);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start';
      for (const w of WIDTHS) {
        const box = document.createElement('div');
        box.dataset.room = `${'area' in config ? 'area' : 'list'}-${glass}-${w.key}`;
        box.style.cssText = `width:${w.px}px;max-width:100%`;
        const card = document.createElement('liquid-home-room') as HTMLElement & { setConfig(c: unknown): void; hass: HomeAssistant };
        card.setConfig({ ...config, look: { glass } });
        card.hass = withRegistry(hass, ids);
        card.addEventListener('click', (e) => {
          const target = e.composedPath()[0] as HTMLElement | undefined;
          if (target?.closest?.('.who, .mode')) log(`room: openLightSheet() called (stub until P12)`);
        });
        box.append(card);
        row.append(box);
        cards.push(card);
      }
      container.append(row);
    }
  }
  onHass((next) => {
    const h = withRegistry(next, ids);
    for (const c of cards) (c as unknown as { hass: HomeAssistant }).hass = h;
  });
};
