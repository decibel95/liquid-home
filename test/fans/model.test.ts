import { describe, expect, it } from 'vitest';
import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import {
  fanBadge,
  fanColour,
  fanIconAction,
  fanPct,
  fanReadout,
  fanSub,
  fanView,
  isFanEntity,
  nextPreset,
  powerDisabled,
  presetDisabled,
  presetLabel,
  stateOf,
} from '../../src/fans';
import { FAN_FIXTURES, type FanState } from './fixtures';

/** Plan 2.5 model: kinds by feature bits, speed count, effective percentage, readout words, row visibility. */

const hass = { language: 'en', locale: { language: 'en' }, states: {} } as unknown as HomeAssistant;
const e = (s: FanState) => s as unknown as HassEntity;
const withFeatures = (s: FanState, f: number) => e({ ...s, attributes: { ...s.attributes, supported_features: f } });

describe('kinds by feature bits', () => {
  it('55 (living_room_fan): speed, oscillate, direction, power; presets listed but no bit 8, so no chip', () => {
    const v = fanView(e(FAN_FIXTURES.off()));
    expect([v.speed, v.hasOscillate, v.hasDirection, v.hasPower, v.canTurnOn, v.canTurnOff, v.hasPresets]).toEqual([true, true, true, true, true, true, false]);
    expect(v.count).toBe(3);
  });

  it('49 (ceiling_fan, percentage_limited_fan): speed and power, no row, no chip', () => {
    const v = fanView(e(FAN_FIXTURES.ceiling()));
    expect([v.speed, v.hasOscillate, v.hasDirection, v.hasPower, v.hasPresets]).toEqual([true, false, false, true, false]);
    expect(v.count).toBe(100);
  });

  it('56 (preset_only_limited_fan): toggle pill and chip, no row', () => {
    const v = fanView(e(FAN_FIXTURES.presetOnly()));
    expect([v.speed, v.hasOscillate, v.hasDirection, v.hasPower, v.hasPresets]).toEqual([false, false, false, true, true]);
  });

  it('derived 48 (Bedroom Fan): on/off only, toggle pill, nothing else', () => {
    const v = fanView(e(FAN_FIXTURES.onoff()));
    expect([v.speed, v.hasOscillate, v.hasDirection, v.hasPower, v.hasPresets]).toEqual([false, false, false, true, false]);
    expect(v.name).toBe('Bedroom Fan');
  });

  it('derived 63: everything including the chip', () => {
    const v = fanView(e(FAN_FIXTURES.presetAuto()));
    expect([v.speed, v.hasOscillate, v.hasDirection, v.hasPower, v.hasPresets]).toEqual([true, true, true, true, true]);
    expect(v.presets).toEqual(['auto', 'smart', 'sleep', 'on']);
  });

  it('57 (lh_fixture_ten): 10 speeds, presets, power, no row', () => {
    const v = fanView(e(FAN_FIXTURES.ten()));
    expect([v.speed, v.count, v.hasOscillate, v.hasDirection, v.hasPresets]).toEqual([true, 10, false, false, true]);
    expect(v.percentage).toBe(40);
  });

  it('bit 8 with an empty preset list has no chip', () => {
    expect(fanView(e({ ...FAN_FIXTURES.presetAuto(), attributes: { ...FAN_FIXTURES.presetAuto().attributes, preset_modes: [] } })).hasPresets).toBe(false);
  });

  it('row visibility: oscillate with bit 2, direction with bit 4, hidden with neither', () => {
    const base = FAN_FIXTURES.pct33();
    expect([2, 4, 6, 1].map((f) => [fanView(withFeatures(base, f)).hasOscillate, fanView(withFeatures(base, f)).hasDirection])).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [false, false],
    ]);
  });
});

describe('effective percentage', () => {
  it('HA percentage while on without a preset', () => {
    expect(fanPct(fanView(e(FAN_FIXTURES.pct67())))).toBe(67);
    expect(fanPct(fanView(e(FAN_FIXTURES.pct100())))).toBe(100);
  });

  it('a stale percentage of an off fan is ignored', () => {
    const s = FAN_FIXTURES.off();
    s.attributes.percentage = 67;
    const v = fanView(e(s));
    expect([v.on, v.percentage]).toEqual([false, null]);
    expect(stateOf(e(s), 'percentage')).toBe(0);
  });

  it('a preset gives null (and stateOf reports null so echoes match)', () => {
    const s = e(FAN_FIXTURES.presetAuto());
    s.attributes.percentage = 33;
    expect(fanView(s).percentage).toBeNull();
    expect(stateOf(s, 'percentage')).toBeNull();
    expect(stateOf(s, 'preset_mode')).toBe('auto');
    expect(stateOf(e(FAN_FIXTURES.off()), 'preset_mode')).toBeNull();
  });

  it('the held value wins: a pending or in-flight percentage, a preset, power', () => {
    const s = e(FAN_FIXTURES.presetAuto());
    expect(fanView(s, { percentage: 33 })).toMatchObject({ on: true, percentage: 33, preset: null });
    expect(fanView(e(FAN_FIXTURES.pct67()), { percentage: 0 })).toMatchObject({ on: false, percentage: null });
    expect(fanView(e(FAN_FIXTURES.pct67()), { preset_mode: 'sleep' })).toMatchObject({ on: true, percentage: null, preset: 'sleep' });
    expect(fanView(e(FAN_FIXTURES.pct67()), { on: false, percentage: 0 })).toMatchObject({ on: false, percentage: null });
    expect(fanView(e(FAN_FIXTURES.off()), { on: true })).toMatchObject({ on: true, percentage: null });
    expect(fanView(e(FAN_FIXTURES.pct33()), { oscillating: true, direction: 'reverse' })).toMatchObject({ oscillating: true, reverse: true });
  });

  it('unavailable is never on', () => {
    const v = fanView(e(FAN_FIXTURES.unavailable()), { percentage: 66 });
    expect([v.available, v.on, v.percentage]).toEqual([false, false, null]);
  });
});

describe('words', () => {
  const words = (s: FanState) => {
    const v = fanView(e(s));
    return { sub: fanSub(hass, v), badge: fanBadge(hass, v), ...fanReadout(hass, v) };
  };

  it('speed fan readouts: percent, Off, "--", preset with label Preset', () => {
    expect(words(FAN_FIXTURES.off())).toEqual({ sub: 'Off', badge: 'Off', big: 'Off', unit: '', label: 'Speed' });
    expect(words(FAN_FIXTURES.pct33())).toEqual({ sub: 'On', badge: '33%', big: '33', unit: '%', label: 'Speed' });
    expect(words(FAN_FIXTURES.pct67())).toMatchObject({ badge: '67%', big: '67' });
    expect(words(FAN_FIXTURES.pct100())).toMatchObject({ badge: '100%', big: '100' });
    expect(words(FAN_FIXTURES.presetAuto())).toEqual({ sub: 'Auto', badge: 'Auto', big: 'Auto', unit: '', label: 'Preset' });
    expect(words(FAN_FIXTURES.unavailable())).toEqual({ sub: 'Unavailable', badge: 'Unavailable', big: '--', unit: '', label: 'Speed' });
  });

  it('sublines with oscillating and reverse', () => {
    expect(words(FAN_FIXTURES.oscillating()).sub).toBe('On, oscillating');
    expect(words(FAN_FIXTURES.reverse()).sub).toBe('On, reverse');
    expect(fanSub(hass, fanView(e(FAN_FIXTURES.reverse()), { oscillating: true }))).toBe('On, oscillating, reverse');
  });

  it('toggle fans: On, Off, the preset, label Tap to switch or Preset; badge On', () => {
    expect(words(FAN_FIXTURES.onoff())).toEqual({ sub: 'On', badge: 'On', big: 'On', unit: '', label: 'Tap to switch' });
    expect(words(FAN_FIXTURES.onoffOff())).toEqual({ sub: 'Off', badge: 'Off', big: 'Off', unit: '', label: 'Tap to switch' });
    expect(words(FAN_FIXTURES.presetOnlyAuto())).toEqual({ sub: 'Auto', badge: 'Auto', big: 'Auto', unit: '', label: 'Preset' });
  });

  it('preset names: capitalised, underscores as spaces, HA translation when it has one', () => {
    expect(presetLabel(hass, 'sleep')).toBe('Sleep');
    expect(presetLabel(hass, 'breeze_mode')).toBe('Breeze mode');
    const de = { ...hass, formatEntityAttributeValue: (_s: HassEntity, _a: string, v: string) => (v === 'sleep' ? 'Schlafmodus' : v) } as unknown as HomeAssistant;
    expect(presetLabel(de, 'sleep', e(FAN_FIXTURES.presetAuto()))).toBe('Schlafmodus');
    expect(presetLabel(de, 'auto', e(FAN_FIXTURES.presetAuto()))).toBe('Auto');
  });
});

describe('power gating, chip and tile icon', () => {
  it('power disabled off without TURN_ON, on without TURN_OFF, and unavailable', () => {
    expect(powerDisabled(fanView(withFeatures(FAN_FIXTURES.off(), 1 + 16)))).toBe(true);
    expect(powerDisabled(fanView(withFeatures(FAN_FIXTURES.off(), 1 + 32)))).toBe(false);
    expect(powerDisabled(fanView(withFeatures(FAN_FIXTURES.pct33(), 1 + 32)))).toBe(true);
    expect(powerDisabled(fanView(withFeatures(FAN_FIXTURES.pct33(), 1 + 16)))).toBe(false);
    expect(powerDisabled(fanView(e(FAN_FIXTURES.unavailable())))).toBe(true);
  });

  it('chip disabled off without TURN_ON and when unavailable; enabled on without TURN_ON', () => {
    expect(presetDisabled(fanView(withFeatures(FAN_FIXTURES.presetsOff(), 1 + 8 + 16)))).toBe(true);
    expect(presetDisabled(fanView(withFeatures(FAN_FIXTURES.presetAuto(), 1 + 8 + 16)))).toBe(false);
    expect(presetDisabled(fanView(e(FAN_FIXTURES.presetsOff())))).toBe(false);
    expect(presetDisabled(fanView(e(FAN_FIXTURES.unavailable())))).toBe(true);
  });

  it('Q5 a: the chip cycles and wraps to the first preset; from off it starts at the first', () => {
    expect(nextPreset(fanView(e(FAN_FIXTURES.presetsOff())))).toBe('auto');
    expect(nextPreset(fanView(e(FAN_FIXTURES.pct33()), { preset_mode: 'smart' }))).toBe('sleep');
    expect(nextPreset(fanView(e(FAN_FIXTURES.presetAuto()), { preset_mode: 'on' }))).toBe('auto');
  });

  it('P2-CHO-8: the tile icon is the power button, a plain icon without TURN_ON and TURN_OFF', () => {
    expect(fanIconAction(fanView(e(FAN_FIXTURES.pct33())))).toEqual({ button: true, disabled: false, next: false, pressed: true });
    expect(fanIconAction(fanView(e(FAN_FIXTURES.off())))).toEqual({ button: true, disabled: false, next: true, pressed: false });
    expect(fanIconAction(fanView(withFeatures(FAN_FIXTURES.pct33(), 3)))).toMatchObject({ button: false, disabled: true });
    expect(fanIconAction(fanView(withFeatures(FAN_FIXTURES.off(), 1 + 16)))).toMatchObject({ button: true, disabled: true });
  });

  it('colour is the fan_only neutral (P2-COL-1)', () => {
    expect(fanColour('dark')).toBe('#d5dce6');
    expect(fanColour('light')).toBe('#64748b');
  });

  it('accepts only fan entity ids', () => {
    expect(isFanEntity('fan.living_room')).toBe(true);
    expect(isFanEntity('light.living_room')).toBe(false);
  });
});
