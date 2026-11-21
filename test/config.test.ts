import { describe, expect, it } from 'vitest';
import { CARD_TYPES, CONFIG_VERSION } from '../src/const';
import { pruneDefaults } from '../src/config';
import * as light from '../src/cards/light/config';
import * as tile from '../src/cards/tile/config';
import * as badge from '../src/cards/badge/config';
import * as room from '../src/cards/room/config';

describe('pruneDefaults', () => {
  const defaults = { type: 'custom:x', entity: '', write_hold: 10, look: { glass: 'theme', blur: 30 }, exclude: [] as string[], config_version: 1 };

  it('drops options equal to their default, nested ones too', () => {
    const cfg = { type: 'custom:x', entity: 'light.a', write_hold: 10, look: { glass: 'theme', blur: 30 }, exclude: [], config_version: 1 };
    expect(pruneDefaults(cfg, defaults)).toEqual({ type: 'custom:x', entity: 'light.a', config_version: 1 });
  });

  it('keeps changed options and prunes inside objects', () => {
    const cfg = { type: 'custom:x', entity: 'light.a', write_hold: 5, look: { glass: 'dark', blur: 30 }, exclude: ['light.b'], config_version: 1 };
    expect(pruneDefaults(cfg, defaults)).toEqual({
      type: 'custom:x',
      entity: 'light.a',
      write_hold: 5,
      look: { glass: 'dark' },
      exclude: ['light.b'],
      config_version: 1,
    });
  });

  it('always keeps type, entity and config_version, even when they equal the default', () => {
    expect(pruneDefaults({ type: 'custom:x', entity: '', config_version: 1 }, defaults)).toEqual({ type: 'custom:x', entity: '', config_version: 1 });
  });

  it('does not change its input', () => {
    const cfg = { type: 'custom:x', entity: 'light.a', look: { glass: 'theme' } };
    pruneDefaults(cfg, defaults);
    expect(cfg.look).toEqual({ glass: 'theme' });
  });
});

describe('normalizeConfig', () => {
  it('stamps a config without config_version silently and fills the defaults (light)', () => {
    const cfg = light.normalizeConfig({ type: CARD_TYPES.light, entity: 'light.kitchen_lights' });
    expect(cfg.config_version).toBe(CONFIG_VERSION);
    expect(cfg.write_hold).toBe(10);
    expect(cfg.look).toEqual({ glass: 'theme', blur: 30, motion: 'rich' });
    expect(cfg.controls?.effects).toBe(true);
  });

  it('keeps user values (tile passes light options on)', () => {
    const cfg = tile.normalizeConfig({ type: CARD_TYPES.tile, entity: 'light.a', write_hold: 4, look: { blur: 10 } });
    expect(cfg.write_hold).toBe(4);
    expect(cfg.look).toEqual({ glass: 'theme', blur: 10, motion: 'rich' });
  });

  it('badge defaults', () => {
    const cfg = badge.normalizeConfig({ type: CARD_TYPES.badge, entity: 'light.a' });
    expect(cfg).toMatchObject({ entity: 'light.a', config_version: 1, look: { glass: 'theme' } });
  });

  it('room infers source: entities give list, otherwise area', () => {
    expect(room.normalizeConfig({ type: CARD_TYPES.room, entities: ['light.a'] }).source).toBe('list');
    expect(room.normalizeConfig({ type: CARD_TYPES.room, area: 'living_room' }).source).toBe('area');
    expect(room.normalizeConfig({ type: CARD_TYPES.room, source: 'list' }).source).toBe('list');
  });

  it('pruneConfig writes only non-default options and the explicit room source', () => {
    const cfg = room.normalizeConfig({ type: CARD_TYPES.room, area: 'living_room' });
    expect(room.pruneConfig(cfg)).toEqual({ type: CARD_TYPES.room, source: 'area', area: 'living_room', config_version: 1 });
    expect(light.pruneConfig(light.normalizeConfig({ type: CARD_TYPES.light, entity: 'light.a' }))).toEqual({
      type: CARD_TYPES.light,
      entity: 'light.a',
      config_version: 1,
    });
  });
});
