import type { HomeAssistant } from '@decibel95/liquid-core';
import { LIGHT_FIXTURES, type LightFixtureName, type LightState } from '../../fixtures/lights';
import { COVER_FIXTURES } from '../../covers/fixtures';
import { FAN_FIXTURES } from '../../fans/fixtures';

export type Call = { domain: string; service: string; data: Record<string, any> };
export type AnyEl = HTMLElement & Record<string, any>;

export const AREA = 'living_room';
export const GROUP = 'light.lh_fixture_living_room_lights';

/** Every derived fixture by name, as fresh states. */
export function fixtureStates(): { states: Record<string, LightState>; ids: Record<LightFixtureName, string> } {
  const states: Record<string, LightState> = {};
  const ids = {} as Record<LightFixtureName, string>;
  for (const [name, make] of Object.entries(LIGHT_FIXTURES) as [LightFixtureName, () => LightState][]) {
    const s = make();
    states[s.entity_id] = s;
    ids[name] = s.entity_id;
  }
  return { states, ids };
}

/**
 * A fake hass over the fixtures. The Living Room area holds, as the test HA (plan 2.8): the group's three members and the
 * dimmed Kitchen Lights through their devices, and the unavailable Office light assigned directly. The brightness-only
 * Ceiling copy sits in a second area (Hallway) so area filtering is visible; the group helper sits in Living Room too.
 */
export function makeHass(calls: Call[] = [], tweak?: (h: HomeAssistant, ids: Record<LightFixtureName, string>) => void) {
  const { states, ids } = fixtureStates();
  const entities: HomeAssistant['entities'] = {};
  const devices: HomeAssistant['devices'] = {};
  const viaDevice = (id: string, area: string) => {
    const device = `dev_${id}`;
    devices[device] = { id: device, area_id: area };
    entities[id] = { entity_id: id, device_id: device, platform: 'demo' };
  };
  for (const id of ['light.ceiling_lights', 'light.living_room_rgbww_lights', 'light.entrance_color_white_lights', ids.dimmed]) viaDevice(id, AREA);
  entities[ids.unavailable] = { entity_id: ids.unavailable, platform: 'demo', area_id: AREA };
  entities[GROUP] = { entity_id: GROUP, platform: 'group', area_id: AREA };
  viaDevice(ids.brightnessOnly, 'hallway');
  const hass = {
    states,
    entities,
    devices,
    areas: { [AREA]: { area_id: AREA, name: 'Living Room' }, hallway: { area_id: 'hallway', name: 'Hallway' }, attic: { area_id: 'attic', name: 'Attic' } },
    config: { unit_system: { temperature: '°C' } },
    language: 'en',
    locale: { language: 'en' },
    themes: { darkMode: false },
    callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
      calls.push({ domain, service, data: data as Record<string, any> });
    },
  } as unknown as HomeAssistant;
  tweak?.(hass, ids);
  return { hass, ids };
}

export function mountRoom(raw: Record<string, unknown>, hass: HomeAssistant, width?: number): AnyEl {
  const card = document.createElement('liquid-home-room') as AnyEl;
  card.setConfig({ type: 'custom:liquid-home-room', ...raw });
  card.hass = hass;
  if (width) card.style.width = `${width}px`;
  document.body.append(card);
  return card;
}

export const $ = (el: AnyEl, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement | null;
export const $$ = (el: AnyEl, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
export const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
export const tiles = (c: AnyEl) => $$(c, 'button.room') as HTMLButtonElement[];
export const tile = (c: AnyEl, name: string) => tiles(c).find((b) => text(b.querySelector('.rname')) === name)!;

/** The test HA blind fixture (plan 2.11: cover.lh_fixture_blind, device class blind, position on an input_number). */
export const BLIND = 'cover.lh_fixture_blind';

/**
 * makeHass plus the covers and fans of the test HA Living Room (plan 2.11, H5 brief): `area_entities('living_room')`
 * holds 3 covers and 3 fans besides the lights. Hall Window and Living Room Window get the area from their device,
 * the blind fixture and the three fans (no device) from the entity. A cover in the Hallway shows area filtering, a
 * hidden fan in the Living Room the hidden filter.
 */
export function makeMixedHass(calls: Call[] = [], tweak?: (h: HomeAssistant, ids: Record<LightFixtureName, string>) => void) {
  const { hass, ids } = makeHass(calls);
  const cover = (id: string, state: string, attributes: Record<string, unknown>) =>
    ({ entity_id: id, state, attributes, last_changed: '', last_updated: '', context: { id: '', parent_id: null, user_id: null } }) as never;
  const states = hass.states as Record<string, unknown>;
  const add = (s: { entity_id: string }) => (states[s.entity_id] = s);
  add(COVER_FIXTURES.hall());
  add(COVER_FIXTURES.living());
  add(cover(BLIND, 'open', { friendly_name: 'Blind', device_class: 'blind', supported_features: 15, current_position: 40 }));
  add(COVER_FIXTURES.garage());
  add(FAN_FIXTURES.off());
  add(FAN_FIXTURES.onoff());
  add(FAN_FIXTURES.ten());
  add(FAN_FIXTURES.ceiling());
  for (const id of ['cover.hall_window', 'cover.living_room_window']) {
    const device = `dev_${id}`;
    hass.devices[device] = { id: device, area_id: AREA };
    hass.entities[id] = { entity_id: id, device_id: device, platform: 'demo' };
  }
  for (const id of [BLIND, 'fan.living_room_fan', 'fan.lh_fixture_onoff', 'fan.lh_fixture_ten']) hass.entities[id] = { entity_id: id, platform: 'template', area_id: AREA };
  hass.entities['cover.garage_door'] = { entity_id: 'cover.garage_door', platform: 'demo', area_id: 'hallway' };
  hass.entities['fan.ceiling_fan'] = { entity_id: 'fan.ceiling_fan', platform: 'demo', area_id: AREA, hidden_by: 'user' };
  tweak?.(hass, ids);
  return { hass, ids };
}
