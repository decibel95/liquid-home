import { describe, expect, it } from 'vitest';
import type { HassEntity } from '@decibel95/liquid-core';
import {
  canClose,
  canOpen,
  coverBadge,
  coverColour,
  coverGlyph,
  coverIconState,
  coverKind,
  coverMode,
  coverSub,
  coverTileSub,
  hasModeButtons,
  iconAction,
  iconLabel,
  isCoverEntity,
  nextStep,
  pillSettable,
  rowActions,
  rowHidden,
  stepState,
  stepsShown,
  togglePillUsable,
} from '../../src/covers';
import { COVER_FIXTURES } from './fixtures';

const en = { language: 'en', locale: { language: 'en' } };
const st = (state: string, features: number, attributes: Record<string, unknown> = {}) =>
  ({ entity_id: 'cover.x', state, attributes: { friendly_name: 'X', supported_features: features, ...attributes } }) as unknown as HassEntity;
const F = Object.fromEntries(Object.entries(COVER_FIXTURES).map(([k, make]) => [k, make()])) as Record<keyof typeof COVER_FIXTURES, HassEntity>;

describe('kind detection (plan 2.4, P2-CHO-2 to 4)', () => {
  it.each([
    ['garage, features 3', F.garage, 'toggle', false],
    ['kitchen, features 11', F.kitchen, 'toggle', false],
    ['hall, features 15', F.hall, 'position', false],
    ['pergola, features 240', F.pergola, 'tilt', false],
    ['living room, features 511', F.living, 'positionTilt', true],
    ['features 255', F.full, 'positionTilt', true],
    ['features 1024 (unknown bit only)', F.unknownBits, 'toggle', false],
  ])('%s', (_n, s, kind, modes) => {
    expect(coverKind(s)).toBe(kind);
    expect(hasModeButtons(s)).toBe(modes);
  });

  it('the mode is card-local: Position by default, Tilt only where the mode buttons show, tilt on a tilt-only cover', () => {
    expect(coverMode(F.living)).toBe('position');
    expect(coverMode(F.living, 'tilt')).toBe('tilt');
    expect(coverMode(F.hall, 'tilt')).toBe('position');
    expect(coverMode(F.pergola)).toBe('tilt');
  });

  it('accepts only cover entity ids', () => {
    expect(isCoverEntity('cover.hall_window')).toBe(true);
    expect(isCoverEntity('light.hall')).toBe(false);
    expect(isCoverEntity(undefined)).toBe(false);
  });
});

describe('canOpen and canClose (HA frontend, P2-CHO-5)', () => {
  it.each([
    ['position 0', st('closed', 15, { current_position: 0 }), true, false],
    ['position 100', st('open', 15, { current_position: 100 }), false, true],
    ['position 10', st('open', 15, { current_position: 10 }), true, true],
    ['opening', st('opening', 15, { current_position: 40 }), false, true],
    ['closing', st('closing', 15, { current_position: 40 }), true, false],
    ['no position, open', st('open', 11), false, true],
    ['no position, closed', st('closed', 11), true, false],
    ['unavailable', st('unavailable', 15), false, false],
    ['unknown', st('unknown', 15), false, false],
    ['assumed_state at 100 (never disabled)', st('open', 15, { current_position: 100, assumed_state: true }), true, true],
    ['assumed_state opening (never disabled)', st('opening', 11, { assumed_state: true }), true, true],
  ])('%s', (_n, s, open, close) => {
    expect(canOpen(s)).toBe(open);
    expect(canClose(s)).toBe(close);
  });
});

describe('row (P2-CHO-5, Q1 b, Q3 b)', () => {
  const vis = (s: HassEntity, mode: 'position' | 'tilt') => rowActions(s, mode).filter((a) => a.visible).map((a) => a.button);

  it('each button only with its bit', () => {
    expect(vis(F.garage, 'position')).toEqual(['open', 'close']);
    expect(vis(F.kitchen, 'position')).toEqual(['open', 'stop', 'close']);
    expect(vis(F.hall, 'position')).toEqual(['open', 'stop', 'close']);
    expect(vis(F.pergola, 'tilt')).toEqual(['open', 'stop', 'close']);
    expect(vis(F.unknownBits, 'position')).toEqual([]);
    expect(vis(st('open', 1 | 4, { current_position: 50 }), 'position')).toEqual(['open']);
  });

  it('tilt mode uses the tilt bits and services', () => {
    expect(rowActions(F.living, 'tilt').map((a) => a.action)).toEqual(['open_cover_tilt', 'stop_cover_tilt', 'close_cover_tilt']);
    expect(rowActions(F.living, 'position').map((a) => a.action)).toEqual(['open_cover', 'stop_cover', 'close_cover']);
    expect(vis(st('open', 15 | 16 | 32, { current_position: 50, current_tilt_position: 50 }), 'tilt')).toEqual(['open', 'close']);
  });

  it('Q1 b: tilt mode labels "Open tilt", "Stop tilt", "Close tilt"', () => {
    expect(rowActions(F.living, 'tilt').map((a) => a.label)).toEqual(['cover.action.openTilt', 'cover.action.stopTilt', 'cover.action.closeTilt']);
    expect(rowActions(F.living, 'position').map((a) => a.label)).toEqual(['cover.action.open', 'cover.action.stop', 'cover.action.close']);
  });

  it('Q3 b: hidden on the garage (toggle without STOP), kept on the kitchen window (toggle with STOP)', () => {
    expect(rowHidden(F.garage, 'position')).toBe(true);
    expect(rowHidden(F.garageOpen, 'position')).toBe(true);
    expect(rowHidden(F.kitchen, 'position')).toBe(false);
    expect(rowHidden(F.hall, 'position')).toBe(false);
    expect(rowHidden(F.unknownBits, 'position')).toBe(true);
  });

  it('disabled per canOpen and canClose; tilt Open at 100, Close at 0; all disabled when unavailable', () => {
    const dis = (s: HassEntity, mode: 'position' | 'tilt') => rowActions(s, mode).map((a) => a.disabled);
    expect(dis(F.hallOpen, 'position')).toEqual([true, false, false]);
    expect(dis(F.hallClosed, 'position')).toEqual([false, false, true]);
    expect(dis(F.hallOpening, 'position')).toEqual([true, false, false]);
    expect(dis(st('open', 255, { current_position: 50, current_tilt_position: 100 }), 'tilt')).toEqual([true, false, false]);
    expect(dis(st('open', 255, { current_position: 50, current_tilt_position: 0 }), 'tilt')).toEqual([false, false, true]);
    expect(dis(F.unavailable, 'position')).toEqual([true, true, true]);
    expect(dis(F.assumed, 'position')).toEqual([false, false, false]);
  });

  it('Stop is active only while moving, in position mode (HA has no tilt moving state)', () => {
    expect(rowActions(F.hallOpening, 'position')[1].active).toBe(true);
    expect(rowActions(F.hallClosing, 'position')[1].active).toBe(true);
    expect(rowActions(F.hall, 'position')[1].active).toBe(false);
    expect(rowActions(st('opening', 511, { current_position: 50, current_tilt_position: 50 }), 'tilt')[1].active).toBe(false);
  });
});

describe('toggle pill (P2-CHO-4) and pill availability', () => {
  it('only with OPEN and CLOSE; while moving only with STOP', () => {
    expect(togglePillUsable(F.garage)).toBe(true);
    expect(togglePillUsable(F.garageOpening)).toBe(false);
    expect(togglePillUsable(F.kitchenOpening)).toBe(true);
    expect(togglePillUsable(F.unknownBits)).toBe(false);
    expect(togglePillUsable(F.unavailable)).toBe(false);
  });

  it('the position pill sets with SET_POSITION, the tilt pill with SET_TILT_POSITION', () => {
    expect(pillSettable(F.hall, 'position')).toBe(true);
    expect(pillSettable(F.pergola, 'tilt')).toBe(true);
    expect(pillSettable(st('open', 15 | 16 | 32, { current_position: 50 }), 'tilt')).toBe(false);
    expect(pillSettable(F.unavailable, 'position')).toBe(false);
  });
});

describe('readout words, sublines and badge values (P2-CHO-10, 11)', () => {
  it('coverSub', () => {
    expect([F.kitchenOpen, F.kitchen, F.kitchenOpening, F.kitchenClosing, F.unavailable].map((s) => coverSub(en, s))).toEqual(['Open', 'Closed', 'Opening', 'Closing', 'Unavailable']);
  });

  it('coverTileSub adds the tilt when reported', () => {
    expect(coverTileSub(en, F.living)).toBe('Open, tilt 50%');
    expect(coverTileSub(en, F.pergola)).toBe('Closed, tilt 60%');
    expect(coverTileSub(en, F.hall)).toBe('Open');
    expect(coverTileSub(en, F.unavailable)).toBe('Unavailable');
  });

  it('coverBadge', () => {
    expect(coverBadge(en, st('open', 15, { current_position: 70 }))).toBe('70%');
    expect(coverBadge(en, F.hallClosed)).toBe('Closed');
    expect(coverBadge(en, F.hallOpening)).toBe('Opening');
    expect(coverBadge(en, F.hallClosing)).toBe('Closing');
    expect(coverBadge(en, F.garage)).toBe('Closed');
    expect(coverBadge(en, F.garageOpen)).toBe('Open');
    expect(coverBadge(en, F.unavailable)).toBe('Unavailable');
  });

  it('header glyph (P2-CHO-7), icon state (plan 2.8) and the neutral colour (P2-COL-1)', () => {
    expect(coverGlyph(F.garage)).toBe('door');
    expect(coverGlyph(st('open', 3, { device_class: 'door' }))).toBe('door');
    expect(coverGlyph(st('open', 3, { device_class: 'gate' }))).toBe('door');
    expect(coverGlyph(st('open', 15, { device_class: 'blind' }))).toBe('blinds');
    expect(coverGlyph(F.hall)).toBe('blinds');
    expect([F.hall, F.hallOpening, F.hallClosing, F.hallClosed, F.unavailable].map(coverIconState)).toEqual(['active', 'active', 'active', 'inactive', 'unavailable']);
    expect(coverColour('dark')).toBe('#d5dce6');
    expect(coverColour('light')).toBe('#64748b');
  });
});

describe('tile icon (P2-CHO-8, D-15)', () => {
  it.each([
    ['position cover: toggle', F.hall, 'toggle', 'toggle', false, 'Toggle, X'],
    ['moving with STOP: stop', F.hallOpening, 'stop', 'stop_cover', false, 'Stop, X'],
    ['moving without STOP: disabled stop', F.garageOpening, 'stop', null, true, 'Stop, X'],
    ['tilt-only: toggle tilt', F.pergola, 'toggleTilt', 'toggle_cover_tilt', false, 'Toggle tilt, X'],
    ['tilt-only without CLOSE_TILT: disabled stop', st('closed', 16 | 128, { current_tilt_position: 0 }), 'stop', null, true, 'Stop, X'],
    ['no OPEN and CLOSE: disabled stop while still', st('closed', 1 | 8), 'stop', null, true, 'Stop, X'],
    ['no OPEN and CLOSE, moving with STOP: stop', st('opening', 1 | 8), 'stop', 'stop_cover', false, 'Stop, X'],
    ['unavailable: disabled', F.unavailable, 'toggle', null, true, 'Toggle, X'],
  ])('%s', (_n, s, kind, action, disabled, label) => {
    const a = iconAction(s);
    expect([a.kind, a.action, a.disabled]).toEqual([kind, action, disabled]);
    expect(iconLabel(en, s, 'X')).toBe(label);
  });
});

describe('steps (tile and room strip, Q2 a)', () => {
  it('shown on positioned and tilt-only covers that set, hidden on toggle covers', () => {
    expect([F.hall, F.living, F.pergola, F.kitchen, F.garage].map(stepsShown)).toEqual([true, true, true, false, false]);
  });

  it('next value: rounded to 10, then plus or minus 10, clamped', () => {
    expect(nextStep(10, 1)).toBe(20);
    expect(nextStep(53, 1)).toBe(60);
    expect(nextStep(53, -1)).toBe(40);
    expect(nextStep(100, 1)).toBe(100);
    expect(nextStep(4, -1)).toBe(0);
  });

  it('state: pending shows as the value, Minus disabled at 0, Plus at 100, tilt-only steps tilt', () => {
    expect(stepState(F.hall)).toMatchObject({ key: 'position', value: 10, minusDisabled: false, plusDisabled: false, minusLabel: 'cover.step.close', plusLabel: 'cover.step.open' });
    expect(stepState(F.hall, { position: 50 }).value).toBe(50);
    expect(stepState(F.hallClosed).minusDisabled).toBe(true);
    expect(stepState(F.hallOpen).plusDisabled).toBe(true);
    expect(stepState(F.pergola)).toMatchObject({ key: 'tilt_position', value: 60, minusLabel: 'cover.step.closeTilt', plusLabel: 'cover.step.openTilt' });
    expect(stepState(F.unavailable)).toMatchObject({ minusDisabled: true, plusDisabled: true });
  });
});
