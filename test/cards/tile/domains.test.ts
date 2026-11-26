// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISABLED_OPACITY, ICONS, TINT, rgba } from '@decibel95/liquid-core';
import '../../../src/cards/tile';
import '../../../src/cards/cover';
import '../../../src/cards/fan';
import { lightSheet } from '../../../src/cards/sheet/open';
import { LiquidHomeTile } from '../../../src/cards/tile/liquid-home-tile';
import { normalizeConfig, pruneConfig, sheetConfig } from '../../../src/cards/tile/config';
import { coverWriters } from '../../../src/covers';
import { fanWriters } from '../../../src/fans';
import { $, $$, FAKE_CLOCK, cssRules, settle, text, type AnyEl } from './helpers';
import { domainHass, type DomainHass } from './domains';

/**
 * Plan 2.6, tile for covers and fans: icon (P2-CHO-7), icon tap and aria per P2-CHO-8 and D-15, steps per Q2 a and
 * Q7 b with their disabled states (P2-CHO-9), tints (P2-CHO-10, P2-COL-1 neutral at TINT 0.24 / 0.45), sublines, and
 * the name opening the entity's card with History (plan 2.9).
 */

function setup(entity: string, cfg: Record<string, unknown> = {}, dh: DomainHass = domainHass()) {
  const tile = document.createElement('liquid-home-tile') as AnyEl;
  tile.setConfig({ type: 'custom:liquid-home-tile', entity, ...cfg });
  tile.hass = dh.hass;
  document.body.append(tile);
  return { tile, dh };
}

const icon = (t: AnyEl) => $(t, '.power') as HTMLButtonElement;
const steps = (t: AnyEl) => $$(t, 'button.step') as HTMLButtonElement[];
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };
const rgbaRe = (hex: string, a: number) => new RegExp(rgba(hex, a).replace(/[(),.]/g, (c) => `\\${c}`).replace(/,/g, ',\\s*'));

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

interface Case {
  entity: string;
  what: string;
  name: string;
  sub: string;
  glyph: keyof typeof ICONS;
  /** The icon's aria label, or null for a plain (non-button) icon. */
  label: string | null;
  pressed?: 'true' | 'false';
  disabled: boolean;
  /** Disabled while available: drawn at DISABLED_OPACITY (0.3) inline. */
  dim?: boolean;
  tinted: boolean;
  /** The step value and labels, or null when the steps are hidden. */
  steps: { value: string; minus: string; plus: string; minusOff: boolean; plusOff: boolean } | null;
}

const COVER = (minus = 'Close 10%', plus = 'Open 10%') => ({ minus, plus });
const FAN = { minus: 'Slower', plus: 'Faster' };

const CASES: Case[] = [
  // Covers: every kind of plan 2.4 and the D-15 cases.
  { entity: 'cover.hall_window', what: 'position, open at 10', name: 'Hall Window', sub: 'Open', glyph: 'blinds', label: 'Toggle, Hall Window', disabled: false, tinted: true, steps: { value: '10%', ...COVER(), minusOff: false, plusOff: false } },
  { entity: 'cover.hall_window_closed', what: 'position, closed at 0', name: 'Hall Window', sub: 'Closed', glyph: 'blinds', label: 'Toggle, Hall Window', disabled: false, tinted: false, steps: { value: '0%', ...COVER(), minusOff: true, plusOff: false } },
  { entity: 'cover.hall_window_open', what: 'position, open at 100', name: 'Hall Window', sub: 'Open', glyph: 'blinds', label: 'Toggle, Hall Window', disabled: false, tinted: true, steps: { value: '100%', ...COVER(), minusOff: false, plusOff: true } },
  { entity: 'cover.hall_window_opening', what: 'moving with STOP', name: 'Hall Window', sub: 'Opening', glyph: 'blinds', label: 'Stop, Hall Window', disabled: false, tinted: true, steps: { value: '40%', ...COVER(), minusOff: false, plusOff: false } },
  { entity: 'cover.hall_window_closing', what: 'closing with STOP', name: 'Hall Window', sub: 'Closing', glyph: 'blinds', label: 'Stop, Hall Window', disabled: false, tinted: true, steps: { value: '60%', ...COVER(), minusOff: false, plusOff: false } },
  { entity: 'cover.pergola_roof', what: 'tilt-only', name: 'Pergola Roof', sub: 'Closed, tilt 60%', glyph: 'blinds', label: 'Toggle tilt, Pergola Roof', disabled: false, tinted: false, steps: { value: '60%', ...COVER('Close tilt 10%', 'Open tilt 10%'), minusOff: false, plusOff: false } },
  { entity: 'cover.living_room_window', what: 'position plus tilt', name: 'Living Room Window', sub: 'Open, tilt 50%', glyph: 'blinds', label: 'Toggle, Living Room Window', disabled: false, tinted: true, steps: { value: '70%', ...COVER(), minusOff: false, plusOff: false } },
  { entity: 'cover.kitchen_window', what: 'toggle, closed', name: 'Kitchen Window', sub: 'Closed', glyph: 'blinds', label: 'Toggle, Kitchen Window', disabled: false, tinted: false, steps: null },
  { entity: 'cover.kitchen_window_open', what: 'toggle, open', name: 'Kitchen Window', sub: 'Open', glyph: 'blinds', label: 'Toggle, Kitchen Window', disabled: false, tinted: true, steps: null },
  { entity: 'cover.kitchen_window_opening', what: 'toggle, opening with STOP', name: 'Kitchen Window', sub: 'Opening', glyph: 'blinds', label: 'Stop, Kitchen Window', disabled: false, tinted: true, steps: null },
  { entity: 'cover.garage_door', what: 'garage, closed', name: 'Garage Door', sub: 'Closed', glyph: 'door', label: 'Toggle, Garage Door', disabled: false, tinted: false, steps: null },
  { entity: 'cover.garage_door_opening', what: 'garage, moving without STOP', name: 'Garage Door', sub: 'Opening', glyph: 'door', label: 'Stop, Garage Door', disabled: true, dim: true, tinted: true, steps: null },
  { entity: 'cover.position_only', what: 'D-15 no OPEN and CLOSE, still', name: 'Position Only', sub: 'Open', glyph: 'blinds', label: 'Stop, Position Only', disabled: true, dim: true, tinted: true, steps: { value: '50%', ...COVER(), minusOff: false, plusOff: false } },
  { entity: 'cover.position_stop', what: 'D-15 no OPEN and CLOSE, moving with STOP', name: 'Position Stop', sub: 'Opening', glyph: 'blinds', label: 'Stop, Position Stop', disabled: false, tinted: true, steps: { value: '40%', ...COVER(), minusOff: false, plusOff: false } },
  { entity: 'cover.open_only', what: 'D-15 OPEN without CLOSE', name: 'Open Only', sub: 'Closed', glyph: 'blinds', label: 'Stop, Open Only', disabled: true, dim: true, tinted: false, steps: null },
  { entity: 'cover.tilt_open_only', what: 'D-15 tilt-only without CLOSE_TILT', name: 'Tilt Open Only', sub: 'Open, tilt 30%', glyph: 'blinds', label: 'Stop, Tilt Open Only', disabled: true, dim: true, tinted: true, steps: { value: '30%', ...COVER('Close tilt 10%', 'Open tilt 10%'), minusOff: false, plusOff: false } },
  { entity: 'cover.hall_window_unavailable', what: 'cover unavailable', name: 'Hall Window', sub: 'Unavailable', glyph: 'blinds', label: 'Toggle, Hall Window', disabled: true, tinted: false, steps: { value: '--', ...COVER(), minusOff: true, plusOff: true } },
  // Fans: speed, preset active, preset-only, on/off-only, no TURN bits, unavailable.
  { entity: 'fan.living_room_fan_67', what: 'speed, 67', name: 'Living Room Fan', sub: 'On', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'true', disabled: false, tinted: true, steps: { value: '67%', ...FAN, minusOff: false, plusOff: false } },
  { entity: 'fan.living_room_fan_33', what: 'speed, lowest step', name: 'Living Room Fan', sub: 'On', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'true', disabled: false, tinted: true, steps: { value: '33%', ...FAN, minusOff: true, plusOff: false } },
  { entity: 'fan.living_room_fan_100', what: 'speed, 100', name: 'Living Room Fan', sub: 'On', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'true', disabled: false, tinted: true, steps: { value: '100%', ...FAN, minusOff: false, plusOff: true } },
  { entity: 'fan.living_room_fan', what: 'speed, off', name: 'Living Room Fan', sub: 'Off', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'false', disabled: false, tinted: false, steps: { value: '--', ...FAN, minusOff: true, plusOff: true } },
  { entity: 'fan.living_room_fan_osc', what: 'oscillating', name: 'Living Room Fan', sub: 'On, oscillating', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'true', disabled: false, tinted: true, steps: { value: '33%', ...FAN, minusOff: true, plusOff: false } },
  { entity: 'fan.living_room_fan_auto', what: 'preset active', name: 'Living Room Fan', sub: 'Auto', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'true', disabled: false, tinted: true, steps: { value: '--', ...FAN, minusOff: true, plusOff: false } },
  { entity: 'fan.preset_only_limited_fan', what: 'preset-only, off', name: 'Preset Only Limited Fan', sub: 'Off', glyph: 'fan', label: 'Switch Preset Only Limited Fan', pressed: 'false', disabled: false, tinted: false, steps: null },
  { entity: 'fan.preset_only_limited_fan_auto', what: 'preset-only, Auto', name: 'Preset Only Limited Fan', sub: 'Auto', glyph: 'fan', label: 'Switch Preset Only Limited Fan', pressed: 'true', disabled: false, tinted: true, steps: null },
  { entity: 'fan.lh_fixture_onoff', what: 'on/off-only, on', name: 'Bedroom Fan', sub: 'On', glyph: 'fan', label: 'Switch Bedroom Fan', pressed: 'true', disabled: false, tinted: true, steps: null },
  { entity: 'fan.lh_fixture_onoff_off', what: 'on/off-only, off', name: 'Bedroom Fan', sub: 'Off', glyph: 'fan', label: 'Switch Bedroom Fan', pressed: 'false', disabled: false, tinted: false, steps: null },
  { entity: 'fan.no_turn', what: 'no TURN bits', name: 'No Turn Fan', sub: 'On', glyph: 'fan', label: null, disabled: false, tinted: true, steps: { value: '50%', ...FAN, minusOff: false, plusOff: false } },
  { entity: 'fan.off_no_turn_on', what: 'off without TURN_ON', name: 'Off No Turn On', sub: 'Off', glyph: 'fan', label: 'Switch Off No Turn On', pressed: 'false', disabled: true, dim: true, tinted: false, steps: { value: '--', ...FAN, minusOff: true, plusOff: true } },
  { entity: 'fan.living_room_fan_unavailable', what: 'fan unavailable', name: 'Living Room Fan', sub: 'Unavailable', glyph: 'fan', label: 'Switch Living Room Fan', pressed: 'false', disabled: true, tinted: false, steps: { value: '--', ...FAN, minusOff: true, plusOff: true } },
];

describe('cover and fan tiles per state, both glasses', () => {
  for (const glass of ['dark', 'light'] as const) {
    for (const c of CASES) {
      it(`${glass} glass, ${c.what} (${c.entity})`, async () => {
        const { tile } = setup(c.entity, { look: { glass } });
        await tile.updateComplete;
        const domain = c.entity.split('.')[0];
        expect($(tile, 'article.tile')!.className).toContain(`g-${glass}`);
        expect($(tile, 'article')!.getAttribute('aria-label')).toBe(`${c.name} ${domain}`);
        expect(text($(tile, '.name'))).toBe(c.name);
        expect(text($(tile, '.sub'))).toBe(c.sub);
        const ic = icon(tile);
        expect(ic.querySelector('path')!.getAttribute('d')).toBe(ICONS[c.glyph]);
        if (c.label === null) {
          // P2-CHO-8: a fan without TURN_ON and TURN_OFF has a plain icon, not a button, with the same tint rule.
          expect(ic.tagName).toBe('SPAN');
          expect(ic.getAttribute('aria-hidden')).toBe('true');
          expect($(tile, 'button.power')).toBeNull();
        } else {
          expect(ic.tagName).toBe('BUTTON');
          expect(ic.getAttribute('aria-label')).toBe(c.label);
          // aria-pressed only on fans (P2-CHO-8).
          expect(ic.getAttribute('aria-pressed')).toBe(domain === 'fan' ? c.pressed! : null);
          expect(ic.disabled).toBe(c.disabled);
        }
        const style = ic.getAttribute('style') ?? '';
        if (c.tinted) {
          expect(style).toMatch(rgbaRe(NEUTRAL[glass], TINT.tile));
          expect(style).toMatch(rgbaRe(NEUTRAL[glass], TINT.tileEdge));
          expect(style).toContain('var(--lc-bright)');
        } else {
          expect(style).not.toContain('rgba');
          expect(style).toContain('var(--lc-fg2)');
        }
        // D-15 and power gating: disabled while available draws at DISABLED_OPACITY; unavailable uses the core 0.5 rule.
        if (c.dim) expect(style).toMatch(new RegExp(`opacity:\\s*${DISABLED_OPACITY}`));
        else expect(style).not.toContain('opacity');
        if (c.steps === null) {
          expect($(tile, '.steps')).toBeNull();
        } else {
          const [down, up] = steps(tile);
          expect(text($(tile, '.target'))).toBe(c.steps.value);
          expect(down.getAttribute('aria-label')).toBe(c.steps.minus);
          expect(up.getAttribute('aria-label')).toBe(c.steps.plus);
          expect(down.disabled).toBe(c.steps.minusOff);
          expect(up.disabled).toBe(c.steps.plusOff);
        }
      });
    }
  }

  it('the plain fan icon takes the tile button chrome (border and background tokens, border-box)', () => {
    const local = LiquidHomeTile.styles as unknown as { cssText: string }[];
    const rules = cssRules(local[local.length - 1].cssText);
    expect(rules['span.power']).toEqual({ 'box-sizing': 'border-box', border: '1px solid var(--lc-btn-edge)', background: 'var(--lc-btn)' });
  });

  it('an unavailable plain fan icon is drawn at the unavailable power opacity', async () => {
    const dh = domainHass();
    dh.update('fan.no_turn', { state: 'unavailable' });
    const { tile } = setup('fan.no_turn', {}, dh);
    await tile.updateComplete;
    expect(icon(tile).tagName).toBe('SPAN');
    expect(icon(tile).getAttribute('style')).toMatch(/opacity:\s*0\.5/);
  });

  it('a missing cover or fan says so and disables everything', async () => {
    for (const entity of ['cover.nope', 'fan.nope']) {
      const { tile } = setup(entity);
      await tile.updateComplete;
      expect(text($(tile, '.sub'))).toBe(`Entity ${entity} not found`);
      expect(icon(tile).disabled).toBe(true);
      expect(steps(tile).every((b) => b.disabled)).toBe(true);
      tile.remove();
    }
  });

  it('long names keep the existing ellipsis (P2-CHO-20)', async () => {
    const { tile } = setup('cover.long_name_window');
    await tile.updateComplete;
    expect(text($(tile, '.name'))).toBe('Upstairs Guest Bathroom Skylight Window Blind');
    const tileRules = cssRules((LiquidHomeTile.styles as unknown as { cssText: string }[])[2].cssText);
    expect(tileRules['.name']).toMatchObject({ 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' });
  });
});

describe('cover and fan tile icon tap (P2-CHO-8, D-15)', () => {
  const tap = async (entity: string) => {
    const { tile, dh } = setup(entity);
    await tile.updateComplete;
    icon(tile).click();
    await settle(tile);
    return dh.calls.map((c) => `${c.domain}.${c.service} ${String(c.data.entity_id)}`);
  };

  it('a cover with OPEN and CLOSE toggles', async () => {
    expect(await tap('cover.hall_window')).toEqual(['cover.toggle cover.hall_window']);
    expect(await tap('cover.kitchen_window')).toEqual(['cover.toggle cover.kitchen_window']);
    expect(await tap('cover.garage_door')).toEqual(['cover.toggle cover.garage_door']);
  });

  it('a moving cover with STOP stops; without STOP the icon is disabled and sends nothing', async () => {
    expect(await tap('cover.hall_window_opening')).toEqual(['cover.stop_cover cover.hall_window_opening']);
    expect(await tap('cover.garage_door_opening')).toEqual([]);
  });

  it('a tilt-only cover with both tilt bits toggles the tilt', async () => {
    expect(await tap('cover.pergola_roof')).toEqual(['cover.toggle_cover_tilt cover.pergola_roof']);
  });

  it('D-15: without both OPEN and CLOSE (or both tilt bits) the icon is Stop, enabled only while moving with STOP', async () => {
    expect(await tap('cover.position_stop')).toEqual(['cover.stop_cover cover.position_stop']);
    expect(await tap('cover.position_only')).toEqual([]);
    expect(await tap('cover.open_only')).toEqual([]);
    expect(await tap('cover.tilt_open_only')).toEqual([]);
  });

  it('an unavailable cover sends nothing', async () => {
    expect(await tap('cover.hall_window_unavailable')).toEqual([]);
  });

  it('a fan icon is its power; gated by TURN_ON and TURN_OFF; no TURN bits is no button', async () => {
    expect(await tap('fan.living_room_fan_67')).toEqual(['fan.turn_off fan.living_room_fan_67']);
    expect(await tap('fan.living_room_fan')).toEqual(['fan.turn_on fan.living_room_fan']);
    expect(await tap('fan.lh_fixture_onoff')).toEqual(['fan.turn_off fan.lh_fixture_onoff']);
    expect(await tap('fan.off_no_turn_on')).toEqual([]);
    expect(await tap('fan.living_room_fan_unavailable')).toEqual([]);
    expect(await tap('fan.no_turn')).toEqual([]);
  });

  it('the fan power shows the sent state at once (held) and the label stays "Switch <name>"', async () => {
    const { tile } = setup('fan.living_room_fan_67');
    await tile.updateComplete;
    icon(tile).click();
    await settle(tile);
    expect(icon(tile).getAttribute('aria-pressed')).toBe('false');
    expect(icon(tile).getAttribute('aria-label')).toBe('Switch Living Room Fan');
    expect(text($(tile, '.sub'))).toBe('Off');
  });

  it('a cover action ends a pending step of the cover (discrete actions cancel steps)', async () => {
    vi.useFakeTimers(FAKE_CLOCK);
    const { tile, dh } = setup('cover.hall_window');
    await tile.updateComplete;
    steps(tile)[1].click();
    await settle(tile);
    icon(tile).click();
    await settle(tile);
    vi.advanceTimersByTime(2000);
    await settle(tile);
    expect(dh.calls.map((c) => c.service)).toEqual(['toggle']);
  });
});

describe('cover and fan tile steps through the shared writers', () => {
  beforeEach(() => vi.useFakeTimers(FAKE_CLOCK));

  it('Q2 a: three cover Plus taps give one set_cover_position 500 ms after the last tap', async () => {
    const { tile, dh } = setup('cover.hall_window');
    await tile.updateComplete;
    const [, up] = steps(tile);
    for (let i = 0; i < 3; i++) {
      up.click();
      await settle(tile);
      vi.advanceTimersByTime(100);
    }
    // The pending step shows on the tile as it coalesces.
    expect(text($(tile, '.target'))).toBe('40%');
    expect(dh.calls).toEqual([]);
    // Last tap at 200 ms; 100 ms passed since: the write goes out 500 ms after it.
    vi.advanceTimersByTime(399);
    await settle(tile);
    expect(dh.calls).toEqual([]);
    vi.advanceTimersByTime(1);
    await settle(tile);
    expect(dh.calls).toEqual([{ domain: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.hall_window', position: 40 } }]);
    vi.advanceTimersByTime(5000);
    await settle(tile);
    expect(dh.calls).toHaveLength(1);
  });

  it('a tilt-only cover steps its tilt; Minus and Plus coalesce to the net value', async () => {
    const { tile, dh } = setup('cover.pergola_roof');
    await tile.updateComplete;
    const [down, up] = steps(tile);
    up.click();
    await settle(tile);
    up.click();
    await settle(tile);
    down.click();
    await settle(tile);
    vi.advanceTimersByTime(500);
    await settle(tile);
    expect(dh.calls).toEqual([{ domain: 'cover', service: 'set_cover_tilt_position', data: { entity_id: 'cover.pergola_roof', tilt_position: 70 } }]);
  });

  it('cover steps stop at the ends: Minus disabled at 0, Plus at 100, also for a pending step', async () => {
    const { tile, dh } = setup('cover.hall_window');
    await tile.updateComplete;
    const [down, up] = steps(tile);
    down.click();
    await settle(tile);
    expect(text($(tile, '.target'))).toBe('0%');
    expect(down.disabled).toBe(true);
    expect(up.disabled).toBe(false);
    vi.advanceTimersByTime(500);
    await settle(tile);
    expect(dh.calls[0].data).toEqual({ entity_id: 'cover.hall_window', position: 0 });
  });

  it('Q7 b: fan Faster taps throttle 300 ms with one final set_percentage, never increase_speed', async () => {
    const { tile, dh } = setup('fan.living_room_fan_33');
    await tile.updateComplete;
    const [, up] = steps(tile);
    up.click();
    await settle(tile);
    // Leading write at once: the next HA step of a 3-speed fan.
    expect(dh.calls).toEqual([{ domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.living_room_fan_33', percentage: 66 } }]);
    expect(text($(tile, '.target'))).toBe('66%');
    up.click();
    await settle(tile);
    expect(text($(tile, '.target'))).toBe('100%');
    expect(up.disabled).toBe(true);
    vi.advanceTimersByTime(299);
    await settle(tile);
    expect(dh.calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await settle(tile);
    expect(dh.calls).toHaveLength(2);
    expect(dh.calls[1]).toEqual({ domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.living_room_fan_33', percentage: 100 } });
    vi.advanceTimersByTime(2000);
    await settle(tile);
    expect(dh.calls).toHaveLength(2);
    expect(dh.calls.every((c) => c.service === 'set_percentage')).toBe(true);
  });

  it('Q7 b: Slower from 67 goes to 33 (the step below), and the lowest step disables Slower', async () => {
    const { tile, dh } = setup('fan.living_room_fan_67');
    await tile.updateComplete;
    const [down] = steps(tile);
    down.click();
    await settle(tile);
    expect(dh.calls[0].data).toEqual({ entity_id: 'fan.living_room_fan_67', percentage: 33 });
    expect(down.disabled).toBe(true);
  });

  it('P2-CHO-9: Faster under a preset leaves it at the lowest step; Slower stays disabled there', async () => {
    const { tile, dh } = setup('fan.living_room_fan_auto');
    await tile.updateComplete;
    const [down, up] = steps(tile);
    expect(down.disabled).toBe(true);
    up.click();
    await settle(tile);
    expect(dh.calls).toEqual([{ domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.living_room_fan_auto', percentage: 33 } }]);
  });

  it('a 10-speed fan steps by 10 %', async () => {
    const { tile, dh } = setup('fan.lh_fixture_ten');
    await tile.updateComplete;
    steps(tile)[1].click();
    await settle(tile);
    expect(dh.calls[0].data).toEqual({ entity_id: 'fan.lh_fixture_ten', percentage: 50 });
  });

  it('sets its write_hold on the shared cover and fan writer only when the user acts on the tile', async () => {
    const c = setup('cover.hall_window', { write_hold: 3 });
    const f = setup('fan.living_room_fan_67', { write_hold: 4 }, c.dh);
    await c.tile.updateComplete;
    await f.tile.updateComplete;
    const cw = coverWriters.acquire('cover.hall_window');
    const fw = fanWriters.acquire('fan.living_room_fan_67');
    expect(cw.hold).toBe(10);
    expect(fw.hold).toBe(10);
    steps(c.tile)[1].click();
    steps(f.tile)[1].click();
    await settle(c.tile);
    expect(cw.hold).toBe(3);
    expect(fw.hold).toBe(4);
    coverWriters.release(cw);
    fanWriters.release(fw);
  });
});

describe('cover and fan tile writer lease', () => {
  it('holds the cover or fan writer while on the page, releases it on removal', async () => {
    const { tile } = setup('cover.hall_window');
    await tile.updateComplete;
    expect(coverWriters.refs('cover.hall_window')).toBe(1);
    tile.remove();
    await settle(tile);
    expect(coverWriters.refs('cover.hall_window')).toBe(0);
    const f = setup('fan.living_room_fan_67');
    await f.tile.updateComplete;
    expect(fanWriters.refs('fan.living_room_fan_67')).toBe(1);
    f.tile.remove();
    await settle(f.tile);
    expect(fanWriters.refs('fan.living_room_fan_67')).toBe(0);
  });

  it('a config that changes the domain releases the old writer and takes the new one', async () => {
    const { tile, dh } = setup('cover.hall_window');
    await tile.updateComplete;
    tile.setConfig({ entity: 'fan.living_room_fan_67' });
    tile.hass = dh.hass;
    await settle(tile);
    expect(coverWriters.refs('cover.hall_window')).toBe(0);
    expect(fanWriters.refs('fan.living_room_fan_67')).toBe(1);
    expect(icon(tile).getAttribute('aria-label')).toBe('Switch Living Room Fan');
  });
});

describe('cover and fan tile name opens the card with History (plan 2.9)', () => {
  const open = async (entity: string, cfg: Record<string, unknown> = {}) => {
    const { tile } = setup(entity, cfg);
    await tile.updateComplete;
    const body = $(tile, 'button.body') as HTMLButtonElement;
    expect(body.getAttribute('aria-haspopup')).toBe('dialog');
    body.click();
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    await settle();
    return { tile, sheet };
  };

  it('a cover tile opens the cover card for its entity, with the tile options and History', async () => {
    const { tile, sheet } = await open('cover.hall_window', { name: 'Gang', write_hold: 5 });
    expect(sheet.isOpen).toBe(true);
    expect(sheet.owner).toBe(tile);
    expect(sheet.entity).toBe('cover.hall_window');
    const card = sheet.shadowRoot!.querySelector('liquid-home-cover-card') as AnyEl;
    expect(card).not.toBeNull();
    expect(card._config).toMatchObject({ type: 'custom:liquid-home-cover-card', entity: 'cover.hall_window', name: 'Gang', write_hold: 5 });
    expect(card._config.tap_action).toBeUndefined();
    const log: string[] = [];
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((_d, _t, u) => void log.push(`push ${u}:open=${sheet.isOpen}`));
    const onLoc = () => log.push('location-changed');
    window.addEventListener('location-changed', onLoc);
    (sheet.shadowRoot!.querySelector('button.history') as HTMLButtonElement).click();
    await settle();
    window.removeEventListener('location-changed', onLoc);
    push.mockRestore();
    expect(log).toEqual(['push /history?entity_id=cover.hall_window:open=false', 'location-changed']);
  });

  it('a fan tile opens the fan card with its controls and History', async () => {
    const { sheet } = await open('fan.living_room_fan_67', { controls: { presets: false }, write_hold: 4 });
    const card = sheet.shadowRoot!.querySelector('liquid-home-fan-card') as AnyEl;
    expect(card).not.toBeNull();
    expect(card._config).toMatchObject({ type: 'custom:liquid-home-fan-card', entity: 'fan.living_room_fan_67', controls: { presets: false }, write_hold: 4 });
    const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    (sheet.shadowRoot!.querySelector('button.history') as HTMLButtonElement).click();
    await settle();
    expect(push).toHaveBeenCalledWith(expect.anything(), '', '/history?entity_id=fan.living_room_fan_67');
    push.mockRestore();
    expect(sheet.isOpen).toBe(false);
  });
});

describe('cover and fan tile config', () => {
  it('normalizes through the card it opens: cover keys without light controls, fan controls.presets', () => {
    const cover = normalizeConfig({ entity: 'cover.a', write_hold: '7' });
    expect(cover).toMatchObject({ type: 'custom:liquid-home-tile', entity: 'cover.a', write_hold: 7, tap_action: 'sheet', config_version: 1 });
    expect('controls' in cover).toBe(false);
    const fan = normalizeConfig({ entity: 'fan.a', controls: { presets: 'no' } });
    expect(fan.controls).toEqual({ presets: true });
    expect(sheetConfig(cover).type).toBe('custom:liquid-home-cover-card');
    expect(sheetConfig(fan).type).toBe('custom:liquid-home-fan-card');
    expect(sheetConfig(normalizeConfig({ entity: 'light.a' })).type).toBe('custom:liquid-home-light-card');
  });

  it('prunes the fan card default controls.presets and keeps a change', () => {
    expect(pruneConfig(normalizeConfig({ entity: 'fan.a' }))).toEqual({ type: 'custom:liquid-home-tile', entity: 'fan.a', config_version: 1 });
    expect(pruneConfig(normalizeConfig({ entity: 'fan.a', controls: { presets: false } }))).toMatchObject({ controls: { presets: false } });
    expect(pruneConfig(normalizeConfig({ entity: 'cover.a' }))).toEqual({ type: 'custom:liquid-home-tile', entity: 'cover.a', config_version: 1 });
  });

  it('accepts light, cover and fan entities, rejects any other', () => {
    const tile = document.createElement('liquid-home-tile') as AnyEl;
    expect(() => tile.setConfig({ entity: 'cover.x' })).not.toThrow();
    expect(() => tile.setConfig({ entity: 'fan.x' })).not.toThrow();
    expect(() => tile.setConfig({ entity: 'climate.x' })).toThrow('Choose a light entity (light.*), a cover (cover.*) or a fan (fan.*)');
  });
});
