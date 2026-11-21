import { describe, expect, it } from 'vitest';
import { PALETTE, STATUS_COLORS, entityColour, tone, type HassEntity } from '@decibel95/liquid-core';
import { CARD_TYPES } from '../../../src/const';
import { normalizeConfig, pruneConfig, roomEntries } from '../../../src/cards/room/config';
import { firstAreaWithLights, needsSetup, roomMembers, roomTitle } from '../../../src/cards/room/members';
import { memberView, powerState, roomSummary } from '../../../src/cards/room/model';
import { AREA, GROUP, makeHass } from './helpers';

const cfg = (raw: Record<string, unknown>) => normalizeConfig({ type: CARD_TYPES.room, ...raw });

describe('room config', () => {
  it('stamps config_version 1 and infers source: entities present gives list, otherwise area', () => {
    expect(cfg({}).config_version).toBe(1);
    expect(cfg({}).source).toBe('area');
    expect(cfg({ area: AREA }).source).toBe('area');
    expect(cfg({ entities: ['light.a'] }).source).toBe('list');
    expect(cfg({ entities: [] }).source).toBe('list');
    expect(cfg({ source: 'area', entities: ['light.a'] }).source).toBe('area');
  });

  it('reads entities as strings or {entity, name}, dropping anything else', () => {
    expect(roomEntries(cfg({ entities: ['light.a', { entity: 'light.b', name: 'Sofa' }, { entity: 'light.c' }, 3, null, { name: 'x' }, ''] }))).toEqual([
      { entity: 'light.a' },
      { entity: 'light.b', name: 'Sofa' },
      { entity: 'light.c' },
    ]);
    expect(roomEntries(cfg({ area: AREA }))).toEqual([]);
  });

  it('pruneConfig keeps the source explicitly and drops defaults', () => {
    expect(pruneConfig(cfg({ entities: ['light.a'], exclude: [], look: { glass: 'theme' } }))).toEqual({
      type: CARD_TYPES.room,
      source: 'list',
      entities: ['light.a'],
      config_version: 1,
    });
  });

  it('needs setup (the "choose an area" placeholder) with neither an area nor entities', () => {
    expect(needsSetup(cfg({}))).toBe(true);
    expect(needsSetup(cfg({ entities: [] }))).toBe(true);
    expect(needsSetup(cfg({ area: AREA }))).toBe(false);
    expect(needsSetup(cfg({ entities: ['light.a'] }))).toBe(false);
  });
});

describe('room members', () => {
  it('area: devices in the area plus entities assigned directly, by name; other areas and the power entity left out', () => {
    const { hass, ids } = makeHass();
    const names = (raw: Record<string, unknown>) => roomMembers(hass, cfg(raw)).map((m) => m.entity);
    expect(names({ area: AREA, power_entity: GROUP })).toEqual([
      'light.ceiling_lights',
      'light.entrance_color_white_lights',
      ids.dimmed,
      'light.living_room_rgbww_lights',
      ids.unavailable,
    ]);
    // Without a power entity the group helper in the area is a member like any light.
    expect(names({ area: AREA })).toContain(GROUP);
    expect(names({ area: 'hallway' })).toEqual([ids.brightnessOnly]);
    expect(names({ area: 'attic' })).toEqual([]);
  });

  it("area: an entity's own area_id overrides its device's area", () => {
    const { hass, ids } = makeHass([], (h, ids) => {
      h.entities[ids.dimmed] = { ...h.entities[ids.dimmed], area_id: 'hallway' };
    });
    // The device still sits in the Living Room; the entity itself is assigned to the Hallway.
    expect(hass.devices[hass.entities[ids.dimmed].device_id!]?.area_id).toBe(AREA);
    expect(roomMembers(hass, cfg({ area: AREA, power_entity: GROUP })).map((m) => m.entity)).not.toContain(ids.dimmed);
    expect(roomMembers(hass, cfg({ area: 'hallway' })).map((m) => m.entity)).toEqual([ids.brightnessOnly, ids.dimmed]);
  });

  it('area: exclude and hidden or disabled entities are left out', () => {
    const { hass, ids } = makeHass([], (h) => {
      h.entities['light.entrance_color_white_lights'].hidden_by = 'user';
    });
    const members = roomMembers(hass, cfg({ area: AREA, power_entity: GROUP, exclude: [ids.dimmed] })).map((m) => m.entity);
    expect(members).toEqual(['light.ceiling_lights', 'light.living_room_rgbww_lights', ids.unavailable]);
  });

  it('list: entities in their own order with name overrides, non-lights and excluded ones dropped', () => {
    const { hass, ids } = makeHass();
    const members = roomMembers(hass, cfg({ entities: [ids.off, { entity: 'light.ceiling_lights', name: 'Sofa' }, 'switch.x', ids.dimmed], exclude: [ids.dimmed] }));
    expect(members).toEqual([
      { entity: ids.off, name: 'Living Room RGBWW Lights' },
      { entity: 'light.ceiling_lights', name: 'Sofa' },
    ]);
  });

  it('title: the configured title, else the area name (D-16), else "Lights"', () => {
    const { hass } = makeHass();
    expect(roomTitle(hass, cfg({ area: AREA }))).toBe('Living Room');
    expect(roomTitle(hass, cfg({ area: AREA, title: 'Lounge' }))).toBe('Lounge');
    expect(roomTitle(hass, cfg({ area: 'unknown_area' }))).toBe('unknown_area');
    expect(roomTitle(hass, cfg({ entities: ['light.a'] }))).toBe('Lights');
  });

  it('stub config area: the first area by name that holds a light', () => {
    const { hass } = makeHass();
    // Attic (no lights) sorts first, Hallway holds the brightness-only light.
    expect(firstAreaWithLights(hass)).toBe('hallway');
    expect(firstAreaWithLights(undefined)).toBeUndefined();
  });
});

describe('member views (COL-1, CHO-1 B, CHO-4, CHO-10, CHO-11)', () => {
  const { hass, ids } = makeHass();
  const view = (id: string, glass: 'dark' | 'light' = 'dark', pct?: number) => memberView(hass, { entity: id, name: id }, glass, pct === undefined ? {} : { brightness_pct: pct });
  const neutral = { dark: tone(PALETTE.neutral, 'dark'), light: tone(PALETTE.neutral, 'light') };

  it('on, colour temperature: level, neutral colour (CHO-1 B), kelvin in the status', () => {
    const v = view(ids.colourTemp);
    expect([v.on, v.available, v.pct, v.value, v.unit, v.status]).toEqual([true, true, 71, '71', '%', 'On, 2631 K']);
    expect(v.colour).toBe(neutral.dark);
    expect([v.white, v.colourMode, v.whiteActive, v.colourActive]).toEqual([true, true, true, false]);
  });

  it('on, hs colour: the lamp colour through entityColour on each glass', () => {
    for (const glass of ['dark', 'light'] as const) {
      const v = view(ids.colourHs, glass);
      expect(v.colour).toBe(entityColour([255, 64, 112], glass).hex);
      expect(v.colourActive).toBe(true);
    }
    // CON-6: #ff4070 kept on dark glass, #e51f5c on light glass.
    expect(view(ids.colourHs, 'dark').colour).toBe('#ff4070');
    expect(view(ids.colourHs, 'light').colour).toBe('#e51f5c');
  });

  it('rgbww and rgbw draw rgb_color (CHO-5); brightness-only and on/off-only draw the neutral', () => {
    expect(view(ids.rgbww, 'light').colour).toBe('#c74c4e'); // CON-7
    expect(view(ids.rgbw, 'light').colour).toBe('#c74e51'); // CON-8
    expect(view(ids.brightnessOnly, 'light').colour).toBe(neutral.light);
    expect(view(ids.onOffOnly, 'dark').colour).toBe(neutral.dark);
  });

  it('a group draws the neutral (CHO-4) and says how many of its members are on', () => {
    const v = view(ids.group, 'dark');
    expect(v.group).toBe(true);
    expect(v.colour).toBe(neutral.dark);
    expect(v.status).toBe('3 of 3 on'); // the fixture group's members are all on
  });

  it('off and unavailable: "Off" and "--" (CHO-11), no unit', () => {
    expect([view(ids.off).value, view(ids.off).unit, view(ids.off).status, view(ids.off).on]).toEqual(['Off', '', 'Off', false]);
    const u = view(ids.unavailable);
    expect([u.value, u.unit, u.status, u.available, u.on]).toEqual(['--', '', 'Unavailable', false, false]);
    expect(view('light.missing').available).toBe(false);
  });

  it('on/off-only: "On" without a level (CHO-10)', () => {
    const v = view(ids.onOffOnly);
    expect([v.onOffOnly, v.pct, v.value, v.unit]).toEqual([true, null, 'On', '']);
  });

  it('a held level from the writer is shown instead of the reported one', () => {
    expect(view(ids.dimmed).pct).toBe(10);
    expect(view(ids.dimmed, 'dark', 20).pct).toBe(20);
    expect(view(ids.off, 'dark', 20).pct).toBeNull();
  });

  it('a missing state is the neutral, unavailable; no status colour is ever used for a lamp', () => {
    expect([view('light.missing').colour, view('light.missing').available]).toEqual([neutral.dark, false]);
    expect(Object.values(STATUS_COLORS)).not.toContain(view(ids.colourHs).colour);
  });

  it('summary counts members on out of all members', () => {
    const vs = [ids.colourTemp, ids.off, ids.unavailable].map((id) => view(id));
    expect(roomSummary(hass, vs)).toBe('1 of 3 on');
  });
});

describe('header power rule (plan 2.5)', () => {
  const { hass, ids } = makeHass();
  const views = (list: string[]) => list.map((id) => memberView(hass, { entity: id, name: id }, 'dark'));

  it('members only: any member on means on, and a press turns every available member off in one call', () => {
    const p = powerState(hass, views([ids.colourTemp, ids.off, ids.unavailable]));
    expect(p).toEqual({ on: true, disabled: false, call: { service: 'turn_off', entity_id: [ids.colourTemp, ids.off] } });
  });

  it('members only: all off means off, and a press turns every available member on in one call', () => {
    const p = powerState(hass, views([ids.off, ids.unavailable]));
    expect(p).toEqual({ on: false, disabled: false, call: { service: 'turn_on', entity_id: [ids.off] } });
  });

  it('members only: nothing available disables the button', () => {
    expect(powerState(hass, views([ids.unavailable]))).toEqual({ on: false, disabled: true, call: null });
  });

  it('power_entity: its own state decides, and the one call goes to it alone', () => {
    expect(powerState(hass, views([ids.off]), GROUP)).toEqual({ on: true, disabled: false, call: { service: 'turn_off', entity_id: GROUP } });
    const off = makeHass([], (h) => {
      h.states[GROUP] = { ...h.states[GROUP], state: 'off' } as HassEntity as any;
    }).hass;
    expect(powerState(off, views([ids.colourTemp]), GROUP).call).toEqual({ service: 'turn_on', entity_id: GROUP });
  });

  it('power_entity unavailable or missing: disabled; on/off falls back to the members while it has no on/off state', () => {
    const un = makeHass([], (h) => {
      h.states[GROUP] = { ...h.states[GROUP], state: 'unavailable' } as any;
    }).hass;
    expect(powerState(un, views([ids.colourTemp]), GROUP)).toEqual({ on: true, disabled: true, call: null });
    expect(powerState(hass, views([ids.off]), 'light.nope')).toEqual({ on: false, disabled: true, call: null });
  });
});
