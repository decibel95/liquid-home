import { describe, expect, it } from 'vitest';
import { CARD_TYPES, CONFIG_VERSION } from '../src/const';
import { pruneDefaults } from '../src/config';
import * as light from '../src/cards/light/config';
import * as tile from '../src/cards/tile/config';
import * as badge from '../src/cards/badge/config';
import * as room from '../src/cards/room/config';
import * as cover from '../src/cards/cover/config';
import * as fan from '../src/cards/fan/config';
import * as media from '../src/cards/media/config';

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

  it('cover and fan: pruneConfig keeps only what differs from plan section 4 defaults', () => {
    expect(cover.pruneConfig(cover.normalizeConfig({ type: CARD_TYPES.cover, entity: 'cover.a' }))).toEqual({ type: CARD_TYPES.cover, entity: 'cover.a', config_version: 1 });
    expect(cover.pruneConfig(cover.normalizeConfig({ type: CARD_TYPES.cover, entity: 'cover.a', write_hold: 30, look: { blur: 10 } }))).toEqual({
      type: CARD_TYPES.cover,
      entity: 'cover.a',
      write_hold: 30,
      look: { blur: 10 },
      config_version: 1,
    });
    expect(fan.pruneConfig(fan.normalizeConfig({ type: CARD_TYPES.fan, entity: 'fan.a', controls: { presets: true } }))).toEqual({ type: CARD_TYPES.fan, entity: 'fan.a', config_version: 1 });
    expect(fan.pruneConfig(fan.normalizeConfig({ type: CARD_TYPES.fan, entity: 'fan.a', controls: { presets: false } })).controls).toEqual({ presets: false });
  });

  it('room domains: lights only is never written, any other subset is, in display order', () => {
    const prune = (domains: unknown) => room.pruneConfig(room.normalizeConfig({ type: CARD_TYPES.room, area: 'a', domains }));
    expect(prune(['light'])).not.toHaveProperty('domains');
    expect(prune(undefined)).not.toHaveProperty('domains');
    expect(prune(['fan', 'light'])).toMatchObject({ domains: ['light', 'fan'] });
    expect(prune(['cover'])).toMatchObject({ domains: ['cover'] });
  });
});

/**
 * Plan section 4 (0.4): every option of the media card, the room's `media_player` domain and the media options a tile
 * passes on are settable and round-trip: what an editor saves (pruneConfig) reads back (normalizeConfig) to the same
 * config, and a YAML-shaped copy (plain data, as HA hands it over) gives the same bytes.
 */
describe('0.4 media options round-trip', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roundTrip = (mod: { normalizeConfig(r: any): any; pruneConfig(c: any): any }, yaml: Record<string, unknown>): Record<string, unknown> =>
    mod.pruneConfig(mod.normalizeConfig(JSON.parse(JSON.stringify(yaml))));

  it('media card defaults: sources and sound mode chips on, write hold 10, the shared look, config_version 1', () => {
    const cfg = media.normalizeConfig({ type: CARD_TYPES.media, entity: 'media_player.kitchen' });
    expect(cfg).toMatchObject({
      type: CARD_TYPES.media,
      entity: 'media_player.kitchen',
      controls: { sources: true, sound_modes: true },
      write_hold: 10,
      look: { glass: 'theme', blur: 30, motion: 'rich' },
      config_version: CONFIG_VERSION,
    });
    expect(media.pruneConfig(cfg)).toEqual({ type: CARD_TYPES.media, entity: 'media_player.kitchen', config_version: 1 });
  });

  it('media card: every option of plan section 4 set to a non-default value round-trips, unknown keys kept', () => {
    const yaml = {
      type: CARD_TYPES.media,
      entity: 'media_player.kitchen',
      name: 'Kitchen',
      controls: { sources: false, sound_modes: false },
      write_hold: 30,
      look: { glass: 'dark', blur: 12, motion: 'minimal' },
      grid_options: { columns: 6 },
      config_version: 1,
    };
    expect(roundTrip(media, yaml)).toEqual(yaml);
  });

  it.each([
    [{ sources: false }, { sources: false }],
    [{ sound_modes: false }, { sound_modes: false }],
    [{ sources: true, sound_modes: true }, undefined],
  ])('media card controls %j are saved as %j', (controls, saved) => {
    expect(roundTrip(media, { type: CARD_TYPES.media, entity: 'media_player.kitchen', controls }).controls).toEqual(saved);
  });

  it('media card: values it cannot use fall back to the default and are not written', () => {
    const cfg = media.normalizeConfig({ type: CARD_TYPES.media, entity: 'media_player.kitchen', controls: { sources: 'no' }, write_hold: -1, look: { glass: 'pink', blur: 'x', motion: 'fast' } });
    expect(cfg.controls.sources).toBe(true);
    expect(cfg.write_hold).toBe(10);
    expect(cfg.look).toEqual({ glass: 'theme', blur: 30, motion: 'rich' });
    expect(media.pruneConfig(cfg)).toEqual({ type: CARD_TYPES.media, entity: 'media_player.kitchen', config_version: 1 });
  });

  it('room: domains with media_player round-trip in display order; lights only stays unwritten', () => {
    const yaml = { type: CARD_TYPES.room, area: 'living_room', domains: ['light', 'cover', 'fan', 'media_player'], config_version: 1, source: 'area' };
    expect(roundTrip(room, yaml)).toEqual(yaml);
    expect(roundTrip(room, { ...yaml, domains: ['media_player', 'light'] })).toMatchObject({ domains: ['light', 'media_player'] });
    expect(roundTrip(room, { type: CARD_TYPES.room, area: 'kitchen', domains: ['media_player'] })).toMatchObject({ domains: ['media_player'] });
    expect(room.normalizeConfig({ type: CARD_TYPES.room, area: 'kitchen' }).domains).toEqual(['light']);
  });

  it('tile and badge: a media player entity with their options; the tile passes the media controls and write hold on', () => {
    const yaml = {
      type: CARD_TYPES.tile,
      entity: 'media_player.kitchen',
      name: 'Kitchen',
      tap_action: 'more-info',
      controls: { sources: false, sound_modes: false },
      write_hold: 60,
      look: { glass: 'light' },
      config_version: 1,
    };
    expect(roundTrip(tile, yaml)).toEqual(yaml);
    // The media card's defaults are not written for a media tile.
    expect(roundTrip(tile, { type: CARD_TYPES.tile, entity: 'media_player.kitchen', controls: { sources: true, sound_modes: true } })).toEqual({
      type: CARD_TYPES.tile,
      entity: 'media_player.kitchen',
      config_version: 1,
    });
    expect(tile.sheetConfig(tile.normalizeConfig(yaml))).toMatchObject({ type: CARD_TYPES.media, controls: { sources: false, sound_modes: false }, write_hold: 60 });
    const b = { type: CARD_TYPES.badge, entity: 'media_player.kitchen', name: 'K', tap_action: 'sheet', icon_only: true, look: { blur: 10 }, config_version: 1 };
    expect(roundTrip(badge, b)).toEqual(b);
  });
});
