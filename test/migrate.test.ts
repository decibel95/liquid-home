// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { CARD_TYPES, CONFIG_VERSION } from '../src/const';
import { migrateConfig } from '../src/migrate';

describe('migrateConfig', () => {
  it('is at config version 1', () => {
    expect(CONFIG_VERSION).toBe(1);
  });

  it.each(Object.entries(CARD_TYPES))('stamps a %s config without config_version and changes nothing else', (_card, type) => {
    const raw = { type, entity: 'light.a', name: 'A' };
    expect(migrateConfig(raw)).toEqual({ ...raw, config_version: 1 });
  });

  it('leaves a current config alone and does not mutate its input', () => {
    const raw = { type: CARD_TYPES.light, entity: 'light.a', config_version: 1 };
    const copy = structuredClone(raw);
    expect(migrateConfig(raw)).toEqual(copy);
    expect(raw).toEqual(copy);
  });

  it('stamps an unknown type too', () => {
    expect(migrateConfig({ type: 'custom:other' })).toEqual({ type: 'custom:other', config_version: 1 });
  });

  it('does not downgrade a newer config', () => {
    expect(migrateConfig({ type: CARD_TYPES.badge, config_version: 7 }).config_version).toBe(7);
  });

  it.each(Object.entries(CARD_TYPES))('stamps a %s config silently: nothing logged, nothing thrown', (_card, type) => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(migrateConfig({ type, entity: 'light.a' }).config_version).toBe(1);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it.each(Object.entries(CARD_TYPES))('leaves a %s config of an unknown future version alone, every key as it is', (_card, type) => {
    const raw = { type, entity: 'light.a', some_new_option: { deep: [1, 2] }, config_version: CONFIG_VERSION + 5 };
    const copy = structuredClone(raw);
    expect(migrateConfig(raw)).toEqual(copy);
    expect(raw).toEqual(copy);
  });

  it.each(Object.entries(CARD_TYPES))('every %s step map starts at 0 and reaches CONFIG_VERSION', async (card) => {
    const { STEPS } = await import(`../src/cards/${card}/migrate.ts`);
    let cfg: Record<string, unknown> = { type: 'x' };
    for (let v = 0; v < CONFIG_VERSION; v++) {
      expect(typeof STEPS[v], `${card} step ${v}`).toBe('function');
      cfg = STEPS[v](cfg);
    }
    expect(cfg.config_version).toBe(CONFIG_VERSION);
  });

  it('stops when a step does not advance config_version', async () => {
    vi.resetModules();
    vi.doMock('../src/cards/light/migrate', () => ({ STEPS: { 0: (c: Record<string, unknown>) => ({ ...c, config_version: 0, touched: true }) } }));
    const { migrateConfig: migrate } = await import('../src/migrate');
    expect(migrate({ type: CARD_TYPES.light })).toEqual({ type: CARD_TYPES.light, config_version: 0, touched: true });
    vi.doUnmock('../src/cards/light/migrate');
  });

  it.each(['light', 'tile', 'badge', 'room', 'cover', 'fan'] as const)('runs the %s card its own steps (wired in BY_TYPE)', async (card) => {
    vi.resetModules();
    vi.doMock(`../src/cards/${card}/migrate`, () => ({ STEPS: { 0: (c: Record<string, unknown>) => ({ ...c, config_version: 1, own: card }) } }));
    const { migrateConfig: migrate } = await import('../src/migrate');
    expect(migrate({ type: CARD_TYPES[card] })).toEqual({ type: CARD_TYPES[card], config_version: 1, own: card });
    vi.doUnmock(`../src/cards/${card}/migrate`);
    vi.resetModules();
  });
});

/**
 * Plan section 4: no config_version bump, every 0.3 option is additive. A config the 0.2 editors saved stays byte-equal
 * through migrate, normalize and the editor's prune, and a 0.2 room shows exactly its 0.2 members (lights only) even
 * when its area now also holds covers and fans.
 */
describe('0.2 configs in 0.3', () => {
  /**
   * What the 0.2.2 editors save (pruneConfig(normalizeConfig(...)) of 8fb5b03, run once against these inputs): the key
   * order is part of the bytes (the room's `source` last, the light's `effects` before `modes`).
   */
  const V02 = {
    light: { type: CARD_TYPES.light, entity: 'light.bed_light', name: 'Bed', controls: { effects: false, modes: ['brightness', 'white'] }, write_hold: 30, look: { glass: 'dark' }, config_version: 1 },
    tile: { type: CARD_TYPES.tile, entity: 'light.ceiling_lights', tap_action: 'more-info', controls: { modes: ['white'] }, write_hold: 60, config_version: 1 },
    badge: { type: CARD_TYPES.badge, entity: 'light.kitchen_lights', tap_action: 'sheet', icon_only: true, look: { blur: 12 }, config_version: 1 },
    roomArea: { type: CARD_TYPES.room, area: 'living_room', power_entity: 'light.lh_fixture_living_room_lights', exclude: ['light.ceiling_lights'], config_version: 1, source: 'area' },
    roomList: { type: CARD_TYPES.room, title: 'Lounge', entities: ['light.ceiling_lights', { entity: 'light.kitchen_lights', name: 'Kitchen' }], config_version: 1, source: 'list' },
  } as const;
  const MODULES = { light: 'light', tile: 'tile', badge: 'badge', roomArea: 'room', roomList: 'room' } as const;

  it.each(Object.keys(V02) as (keyof typeof V02)[])('%s: migrate, normalize and prune give the same bytes', async (name) => {
    const raw = V02[name];
    const json = JSON.stringify(raw);
    expect(JSON.stringify(migrateConfig(structuredClone(raw)))).toBe(json);
    const { normalizeConfig, pruneConfig } = await import(`../src/cards/${MODULES[name]}/config.ts`);
    expect(JSON.stringify(pruneConfig(normalizeConfig(structuredClone(raw))))).toBe(json);
    expect(JSON.stringify(raw)).toBe(json);
  });

  it.each(['roomArea', 'roomList'] as const)('%s: the same members and tiles with covers and fans in its area', async (name) => {
    const { makeHass, makeMixedHass, mountRoom, tiles, text } = await import('./cards/room/helpers');
    const { roomMembers } = await import('../src/cards/room/members');
    const { normalizeConfig } = await import('../src/cards/room/config');
    await import('../src/cards/room');
    const cfg = normalizeConfig(structuredClone(V02[name]) as Record<string, unknown>);
    const lightsOnly = makeHass().hass;
    const mixed = makeMixedHass().hass;
    // The mixed hass really holds covers and fans in this area.
    expect(roomMembers(mixed, { ...cfg, domains: ['light', 'cover', 'fan'] }).some((m) => !m.entity.startsWith('light.'))).toBe(name === 'roomArea');
    const before = roomMembers(lightsOnly, cfg);
    expect(before.length).toBeGreaterThan(1);
    expect(roomMembers(mixed, cfg)).toEqual(before);
    const names = async (hass: typeof mixed) => {
      const card = mountRoom(structuredClone(V02[name]) as Record<string, unknown>, hass);
      await card.updateComplete;
      const out = tiles(card).map((b) => text(b.querySelector('.rname')));
      card.remove();
      return out;
    };
    const shown = await names(lightsOnly);
    expect(shown).toEqual(before.map((m) => m.name));
    expect(await names(mixed)).toEqual(shown);
  });
});
