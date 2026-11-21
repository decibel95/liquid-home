import { describe, expect, it } from 'vitest';
import { entityColour, PALETTE, STATUS_COLORS, tone, type HassEntity } from '@decibel95/liquid-core';
import {
  brightnessPatch,
  buildLightCalls,
  colourOf,
  groupMembers,
  isLightEntity,
  isOnOffOnly,
  isUnavailable,
  lightView,
  membersOn,
  neutralColour,
  offColour,
  powerPatch,
  settled,
  stateOf,
  stepLevel,
} from '../../src/lights';
import { LIGHT_FIXTURES } from '../fixtures/lights';

/** The one light domain module (src/lights): every card reads lights through it. */

const f = Object.fromEntries(Object.entries(LIGHT_FIXTURES).map(([n, make]) => [n, make()])) as unknown as { [K in keyof typeof LIGHT_FIXTURES]: HassEntity };
const e = (state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id: 'light.a', state, attributes }) as HassEntity;

describe('entity checks', () => {
  it('light ids, unavailable and unknown, groups, on/off-only', () => {
    expect([isLightEntity('light.kitchen'), isLightEntity('switch.kitchen'), isLightEntity('light.'), isLightEntity(3)]).toEqual([true, false, false, false]);
    expect([isUnavailable(undefined), isUnavailable(e('unavailable')), isUnavailable(e('unknown')), isUnavailable(e('off'))]).toEqual([true, true, true, false]);
    expect(groupMembers(f.group)).toEqual(['light.ceiling_lights', 'light.living_room_rgbww_lights', 'light.entrance_color_white_lights']);
    expect(groupMembers(f.colourHs)).toEqual([]);
    expect([isOnOffOnly(f.onOffOnly), isOnOffOnly(f.brightnessOnly), isOnOffOnly(undefined)]).toEqual([true, false, false]);
    // An unknown state reads as unavailable everywhere (light card, tile, badge and room card alike).
    expect(lightView(e('unknown', { supported_color_modes: ['brightness'] })).available).toBe(false);
  });

  it('membersOn counts a group member as on from the page states', () => {
    const states = Object.fromEntries(Object.values(f).map((s) => [s.entity_id, s]));
    expect(membersOn(states, lightView(f.group))).toBe(3);
    expect(membersOn({}, lightView(f.group))).toBe(0);
  });
});

describe('percent mapping (CHO-8, plan 2.5)', () => {
  it('level is 1 to 100 while on, null while off and for on/off-only lights', () => {
    expect(lightView(f.dimmed).level).toBe(10);
    expect(lightView(e('on', { brightness: 1 })).level).toBe(1);
    expect(lightView(e('on', { brightness: 255 })).level).toBe(100);
    expect(lightView(f.off).level).toBeNull();
    expect(lightView(f.onOffOnly).level).toBeNull();
    expect(lightView(f.unavailable).level).toBeNull();
    // A held value from the shared writer shows instead of the reported one.
    expect(lightView(f.dimmed, { brightness_pct: 20 }).level).toBe(20);
  });

  it('reconciles in percent: round(round(p x 2.55) / 2.55) = p for every level', () => {
    for (let p = 1; p <= 100; p++) expect(stateOf(e('on', { brightness: Math.round(p * 2.55) }), 'brightness_pct')).toBe(p);
    expect(stateOf(e('off', { brightness: null }), 'brightness_pct')).toBe(0);
  });

  it('stepLevel moves 10 % between 1 and 100, and not at all off, on/off-only or at the limit', () => {
    expect(stepLevel(lightView(f.dimmed), 1)).toBe(20);
    expect(stepLevel(lightView(f.dimmed), -1)).toBe(1);
    expect(stepLevel(lightView(e('on', { brightness: 3 })), -1)).toBeNull();
    expect(stepLevel(lightView(e('on', { brightness: 255 })), 1)).toBeNull();
    expect(stepLevel(lightView(f.off), 1)).toBeNull();
    expect(stepLevel(lightView(f.onOffOnly), 1)).toBeNull();
  });
});

describe('lamp colour (COL-1, CHO-1 B, CHO-4, CHO-5)', () => {
  it('colour modes draw rgb_color through entity-colour, everything else the neutral', () => {
    for (const glass of ['dark', 'light'] as const) {
      expect(colourOf(lightView(f.colourHs), glass)).toBe(entityColour([255, 64, 112], glass).hex);
      expect(colourOf(lightView(f.rgbww), glass)).toBe(entityColour([255, 127, 125], glass).hex);
      expect(colourOf(lightView(f.rgbw), glass)).toBe(entityColour([255, 128, 128], glass).hex);
      for (const n of ['colourTemp', 'brightnessOnly', 'onOffOnly', 'group', 'effectList'] as const) expect(colourOf(lightView(f[n]), glass)).toBe(tone(PALETTE.neutral, glass));
      expect(neutralColour(glass)).toBe(tone(PALETTE.neutral, glass));
      expect(offColour(glass)).toBe(tone(STATUS_COLORS.off, glass));
    }
    // CON-6 on both glasses.
    expect([colourOf(lightView(f.colourHs), 'dark'), colourOf(lightView(f.colourHs), 'light')]).toEqual(['#ff4070', '#e51f5c']);
  });

  it('a colour sent and not yet reported shows at once', () => {
    expect(colourOf(lightView(f.colourTemp, { hs_color: [240, 100] }), 'dark')).toBe(entityColour([0, 0, 255], 'dark').hex);
  });
});

describe('patches and calls of the tile and the room card', () => {
  const on = e('on', { brightness: 128, supported_color_modes: ['brightness'], color_mode: 'brightness' });
  const off = e('off', { supported_color_modes: ['brightness'] });

  it('power: turn_off only when on, turn_on only when off, deduped against writes in flight', () => {
    expect(buildLightCalls(powerPatch(false), on, {})).toEqual([{ service: 'turn_off', data: { entity_id: 'light.a' }, sets: { on: false } }]);
    expect(buildLightCalls(powerPatch(false), off, {})).toEqual([]);
    expect(buildLightCalls(powerPatch(true), on, {})).toEqual([]);
    expect(buildLightCalls(powerPatch(true), off, {})).toEqual([{ service: 'turn_on', data: { entity_id: 'light.a' }, sets: { on: true } }]);
    expect(buildLightCalls(powerPatch(false), on, { on: false })).toEqual([]);
  });

  it('a step: brightness_pct as an integer, the same value dropped, 0 turns off', () => {
    expect(buildLightCalls(brightnessPatch(50), on, {})).toEqual([]);
    expect(buildLightCalls(brightnessPatch(60), on, { brightness_pct: 60 })).toEqual([]);
    expect(buildLightCalls(brightnessPatch(60), on, {})).toEqual([{ service: 'turn_on', data: { entity_id: 'light.a', brightness_pct: 60 }, sets: { brightness_pct: 60 } }]);
    expect(buildLightCalls(brightnessPatch(0), on, {})[0].service).toBe('turn_off');
    expect(buildLightCalls(brightnessPatch(60), off, {})[0].data).toEqual({ entity_id: 'light.a', brightness_pct: 60 });
  });

  it('settled: our own value exactly, HA reports tolerantly', () => {
    const ct = e('on', { color_mode: 'color_temp', color_temp_kelvin: 2702 });
    expect(settled(ct, {}, 'color_temp_kelvin', 2700)).toBe(true);
    expect(settled(ct, { color_temp_kelvin: 2702 }, 'color_temp_kelvin', 2700)).toBe(false);
  });
});
