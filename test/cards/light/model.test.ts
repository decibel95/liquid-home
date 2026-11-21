import { describe, expect, it } from 'vitest';
import { CARD_TYPES } from '../../../src/const';
import { normalizeConfig, pruneConfig } from '../../../src/cards/light/config';
import { colourOf, hueAt, lightView, modesFor, patchFor, positionOf, stateOf } from '../../../src/lights/model';
import { buildLightCalls, matches, sendOnRelease } from '../../../src/lights/writer';
import { LIGHT_FIXTURES } from '../../fixtures/lights';

const F = Object.fromEntries(Object.entries(LIGHT_FIXTURES).map(([k, make]) => [k, make()])) as { [K in keyof typeof LIGHT_FIXTURES]: ReturnType<(typeof LIGHT_FIXTURES)[K]> };

describe('config', () => {
  it('normalizes a minimal config to the current version with defaults', () => {
    const c = normalizeConfig({ type: CARD_TYPES.light, entity: 'light.a' });
    expect(c).toMatchObject({ config_version: 1, write_hold: 10, controls: { effects: true }, look: { glass: 'theme', blur: 30, motion: 'rich' } });
    expect(c.controls.modes).toBeUndefined();
  });

  it('keeps valid options and drops invalid ones to their default', () => {
    const c = normalizeConfig({
      type: CARD_TYPES.light,
      entity: 'light.a',
      name: 'Kitchen',
      controls: { modes: ['colour', 'bogus', 'brightness'], effects: false },
      write_hold: 4,
      look: { glass: 'dark', blur: 0, motion: 'minimal' },
    });
    expect(c).toMatchObject({ name: 'Kitchen', controls: { modes: ['brightness', 'colour'], effects: false }, write_hold: 4, look: { glass: 'dark', blur: 0, motion: 'minimal' } });
    const bad = normalizeConfig({ type: CARD_TYPES.light, entity: 'light.a', controls: { modes: ['x'], effects: 'yes' }, write_hold: -1, look: { glass: 'pink', blur: 'a', motion: 'fast' } });
    expect(bad).toMatchObject({ controls: { modes: undefined, effects: true }, write_hold: 10, look: { glass: 'theme', blur: 30, motion: 'rich' } });
  });

  it('write_hold and look.blur take numbers or numeric strings only (P11x LOW-4)', () => {
    const at = (write_hold: unknown, blur: unknown) => normalizeConfig({ type: CARD_TYPES.light, entity: 'light.a', write_hold, look: { blur } });
    expect(at('4', '12')).toMatchObject({ write_hold: 4, look: { blur: 12 } });
    expect(at(2.5, 0)).toMatchObject({ write_hold: 2.5, look: { blur: 0 } });
    for (const bad of [null, '', ' ', true, false, [], {}, '1e3', '-1', -1, 'a', NaN, Infinity]) {
      expect(at(bad, bad), String(bad)).toMatchObject({ write_hold: 10, look: { blur: 30 } });
    }
  });

  it('has no look.tint and no write_delay (CHO-6, plan 2.5)', () => {
    const c = normalizeConfig({ type: CARD_TYPES.light, entity: 'light.a' });
    expect('tint' in c.look).toBe(false);
    expect('write_delay' in c).toBe(false);
  });

  it('prunes to the non-default options', () => {
    expect(pruneConfig(normalizeConfig({ type: CARD_TYPES.light, entity: 'light.a', write_hold: 5 }))).toEqual({ type: CARD_TYPES.light, entity: 'light.a', write_hold: 5, config_version: 1 });
  });
});

describe('view and colour', () => {
  it('reads brightness, kelvin and hs from the state', () => {
    expect(lightView(F.dimmed).pct).toBeCloseTo((26 / 255) * 100);
    expect(lightView(F.colourTemp)).toMatchObject({ kelvin: 2631, colorMode: 'color_temp', supportsWhite: true, supportsColour: true });
    expect(lightView(F.onOffOnly).onoff).toBe(true);
    expect(lightView(F.group)).toMatchObject({ group: true, members: ['light.ceiling_lights', 'light.living_room_rgbww_lights', 'light.entrance_color_white_lights'] });
    expect(lightView(F.unavailable)).toMatchObject({ available: false, on: false, pct: 0 });
  });

  it('local values overlay the state (hold of sent values)', () => {
    expect(lightView(F.colourHs, { brightness_pct: 30 }).pct).toBe(30);
    expect(lightView(F.colourHs, { on: false }).on).toBe(false);
    const w = lightView(F.colourHs, { color_temp_kelvin: 3000 });
    expect([w.kelvin, w.colorMode]).toEqual([3000, 'color_temp']);
    const c = lightView(F.colourTemp, { hs_color: [120, 75] });
    expect([c.kelvin, c.colorMode, c.rgb]).toEqual([null, 'hs', [64, 255, 64]]);
  });

  it('COL-1 / CHO-1 B / CHO-4: entity colour only for colour modes, else the neutral', () => {
    expect(colourOf(lightView(F.colourHs), 'dark')).toBe('#ff4070');
    expect(colourOf(lightView(F.colourHs), 'light')).toBe('#e51f5c');
    for (const s of [F.colourTemp, F.brightnessOnly, F.onOffOnly, F.group, F.effectList]) {
      expect(colourOf(lightView(s), 'dark')).toBe('#d5dce6');
      expect(colourOf(lightView(s), 'light')).toBe('#64748b');
    }
  });

  it('an on/off-only group gets the toggle and keeps its members (P11x LOW-2)', () => {
    const g = { ...F.group, attributes: { ...F.group.attributes, supported_color_modes: ['onoff'], color_mode: 'onoff' } };
    const v = lightView(g);
    expect([v.group, v.onoff, v.members.length]).toEqual([true, true, 3]);
    expect(modesFor(v)).toEqual([]);
  });

  it('an empty colour temperature range hides White and positions at 0 (P11x LOW-3)', () => {
    const s = { ...F.colourTemp, attributes: { ...F.colourTemp.attributes, min_color_temp_kelvin: 2700, max_color_temp_kelvin: 2700, color_temp_kelvin: 2700 } };
    const v = lightView(s);
    expect(v.supportsWhite).toBe(false);
    expect(modesFor(v)).toEqual(['brightness', 'colour']);
    expect(positionOf(v, 'white')).toBe(0);
  });

  it('modes per support and config (TOK-22)', () => {
    expect(modesFor(lightView(F.colourHs))).toEqual(['brightness', 'white', 'colour']);
    expect(modesFor(lightView(F.rgbw))).toEqual(['brightness', 'colour']);
    expect(modesFor(lightView(F.brightnessOnly))).toEqual(['brightness']);
    expect(modesFor(lightView(F.group))).toEqual(['brightness']);
    expect(modesFor(lightView(F.onOffOnly))).toEqual([]);
    expect(modesFor(lightView(F.colourHs), ['white'])).toEqual(['white']);
    expect(modesFor(lightView(F.rgbw), ['white'])).toEqual(['brightness']);
  });

  it('positions and patches as the prototype (posOf, patchFor, buildCall)', () => {
    const v = lightView(F.colourTemp);
    expect(positionOf(v, 'white')).toBeCloseTo(((2631 - 2000) / 4535) * 100);
    expect(positionOf(lightView(F.colourHs), 'colour')).toBeCloseTo(345 / 3.6);
    expect(patchFor(v, 'brightness', 0.4)).toMatchObject({ on: false });
    expect(patchFor(v, 'brightness', 0.6)).toEqual({ on: true, brightness_pct: 1 });
    expect(patchFor(v, 'brightness', 44.5)).toEqual({ on: true, brightness_pct: 45 });
    expect(patchFor(v, 'white', 100)).toMatchObject({ on: true, color_temp_kelvin: 6535 });
    expect(patchFor(lightView(F.colourHs), 'colour', 50)).toMatchObject({ on: true, hs_color: [180, 75] });
    expect(patchFor(lightView(F.off), 'colour', 50)).toMatchObject({ hs_color: [180, 100] });
    expect(hueAt(100)).toBe(360);
  });
});

describe('writer build (plan 2.5)', () => {
  const id = F.colourHs.entity_id;
  it('brightness_pct integer, turn_off for off, dedupe against the state and the values in flight', () => {
    expect(buildLightCalls({ on: true, brightness_pct: 45 }, F.colourHs, {})).toEqual([{ service: 'turn_on', data: { entity_id: id, brightness_pct: 45 }, sets: { brightness_pct: 45 } }]);
    expect(buildLightCalls({ on: true, brightness_pct: 71 }, F.colourHs, {})).toEqual([]);
    expect(buildLightCalls({ on: true, brightness_pct: 45 }, F.colourHs, { brightness_pct: 45 })).toEqual([]);
    expect(buildLightCalls({ on: false }, F.colourHs, {})).toEqual([{ service: 'turn_off', data: { entity_id: id }, sets: { on: false } }]);
    expect(buildLightCalls({ on: false }, F.off, {})).toEqual([]);
    expect(buildLightCalls({ on: true }, F.off, {})).toEqual([{ service: 'turn_on', data: { entity_id: F.off.entity_id }, sets: { on: true } }]);
  });

  it('White and Colour clear each other in what the call sets', () => {
    expect(buildLightCalls({ on: true, color_temp_kelvin: 3000 }, F.colourHs, {})[0]).toEqual({ service: 'turn_on', data: { entity_id: id, color_temp_kelvin: 3000 }, sets: { color_temp_kelvin: 3000, hs_color: null } });
    expect(buildLightCalls({ on: true, hs_color: [120, 75] }, F.colourTemp, {})[0].sets).toEqual({ hs_color: [120, 75], color_temp_kelvin: null });
    expect(buildLightCalls({ on: true, color_temp_kelvin: 2632 }, F.colourTemp, {})).toEqual([]);
  });

  it('values in flight are compared exactly, HA-reported values with tolerance (P11x MEDIUM-1)', () => {
    // 6450 K is in flight: a release at 6480 K is the user's own new value and goes out (under one mired apart, but ours).
    expect(buildLightCalls({ on: true, color_temp_kelvin: 6480 }, F.colourTemp, { color_temp_kelvin: 6450 })[0].data).toEqual({ entity_id: F.colourTemp.entity_id, color_temp_kelvin: 6480 });
    expect(buildLightCalls({ on: true, color_temp_kelvin: 6450 }, F.colourTemp, { color_temp_kelvin: 6450 })).toEqual([]);
    // One degree more hue than the hue in flight goes out; the same hue does not.
    expect(buildLightCalls({ on: true, hs_color: [101, 75] }, F.colourHs, { hs_color: [100, 75] })[0].data).toEqual({ entity_id: id, hs_color: [101, 75] });
    expect(buildLightCalls({ on: true, hs_color: [100, 75] }, F.colourHs, { hs_color: [100, 75] })).toEqual([]);
    // Against HA's reported state the tolerance holds: 345.4 reported counts as 345 sent, 2702 K as 2700 K.
    const reported = { ...F.colourHs, attributes: { ...F.colourHs.attributes, hs_color: [345.4, 75.2] } };
    expect(buildLightCalls({ on: true, hs_color: [345, 75] }, reported, {})).toEqual([]);
    const ct = { ...F.colourTemp, attributes: { ...F.colourTemp.attributes, color_temp_kelvin: 2702 } };
    expect(buildLightCalls({ on: true, color_temp_kelvin: 2700 }, ct, {})).toEqual([]);
  });

  it('hue wraps at 360/0 (P11x LOW-10)', () => {
    expect(hueAt(100)).toBe(360);
    expect(hueAt(0)).toBe(0);
    expect(matches('hs_color', [0, 75], [360, 75])).toBe(true);
    expect(matches('hs_color', [359.5, 75], [0.4, 75])).toBe(true);
    const at0 = { ...F.colourHs, attributes: { ...F.colourHs.attributes, hs_color: [0, 75] } };
    // HA reports 0: sending 360 changes nothing. Our own 0 in flight: 360 is a different value and goes out.
    expect(buildLightCalls({ on: true, hs_color: [360, 75] }, at0, {})).toEqual([]);
    expect(buildLightCalls({ on: true, hs_color: [360, 75] }, F.colourHs, { hs_color: [0, 75] })[0].data.hs_color).toEqual([360, 75]);
  });

  it('sendOnRelease only for turn_off', () => {
    expect(sendOnRelease({ on: false })).toBe(true);
    expect(sendOnRelease({ on: true, brightness_pct: 1 })).toBe(false);
  });

  it('round trip in percent: round(round(p x 2.55) / 2.55) = p for every p', () => {
    for (let p = 1; p <= 100; p++) {
      const s = { ...F.colourHs, attributes: { ...F.colourHs.attributes, brightness: Math.round(p * 2.55) } };
      expect(stateOf(s, 'brightness_pct')).toBe(p);
    }
  });

  it('lossy echoes: kelvin within one mired, hue around the circle', () => {
    expect(matches('color_temp_kelvin', 2702, 2700)).toBe(true);
    expect(matches('color_temp_kelvin', 2750, 2700)).toBe(false);
    expect(matches('hs_color', [359.6, 75.2], [0, 75])).toBe(true);
    expect(matches('hs_color', [10, 75], [0, 75])).toBe(false);
    expect(matches('brightness_pct', 45, 45)).toBe(true);
  });
});
