// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TINT, rgba } from '@decibel95/liquid-core';
import '../../../src/cards/tile';
import { lightSheet } from '../../../src/cards/sheet/open';
import { LiquidHomeTile } from '../../../src/cards/tile/liquid-home-tile';
import { defaultConfig, normalizeConfig, pruneConfig, sheetConfig } from '../../../src/cards/tile/config';
import { normalizeConfig as normalizeLightConfig } from '../../../src/cards/light/config';
import { lightWriters } from '../../../src/lights';
import type { LightFixtureName } from '../../fixtures/lights';
import { $, $$, FAKE_CLOCK, fakeHass, settle, text, type AnyEl, type FakeHass } from './helpers';
import { defineStubLightCard } from '../sheet/stub-light-card';

defineStubLightCard();

function setup(fixture: LightFixtureName, cfg: Record<string, unknown> = {}, fh: FakeHass = fakeHass()) {
  const tile = document.createElement('liquid-home-tile') as AnyEl;
  tile.setConfig({ type: 'custom:liquid-home-tile', entity: fh.ids[fixture], ...cfg });
  tile.hass = fh.hass;
  document.body.append(tile);
  return { tile, fh };
}

const power = (t: AnyEl) => $(t, 'button.power') as HTMLButtonElement;
const steps = (t: AnyEl) => $$(t, 'button.step') as HTMLButtonElement[];

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/**
 * Every fixture state of the derived light fixture set, on both glasses. Colours: entity-colour per COL-1 and CON-6 to 8
 * (Kitchen #ff4070 / #e51f5c, Office RGBW #ff8080 / #c74e51, Living Room RGBWW #ff7f7d / #c74c4e); colour
 * temperature, brightness-only, on/off-only and the group draw the neutral (CHO-1 option B, CHO-4, TOK-14).
 */
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };
const CASES: { fixture: LightFixtureName; name: string; sub: string; target: string | null; on: boolean; colour: { dark: string; light: string } | null; disabled?: boolean }[] = [
  { fixture: 'dimmed', name: 'Kitchen Lights', sub: 'On', target: '10%', on: true, colour: { dark: '#ff4070', light: '#e51f5c' } },
  { fixture: 'unavailable', name: 'Office RGBW Lights', sub: 'Unavailable', target: '--', on: false, colour: null, disabled: true },
  { fixture: 'off', name: 'Living Room RGBWW Lights', sub: 'Off', target: '--', on: false, colour: null },
  { fixture: 'brightnessOnly', name: 'Ceiling Lights', sub: 'On', target: '71%', on: true, colour: NEUTRAL },
  { fixture: 'onOffOnly', name: 'Entrance Color + White Lights', sub: 'On', target: null, on: true, colour: NEUTRAL },
  { fixture: 'group', name: 'Living Room Lights', sub: '3 of 3 on', target: '71%', on: true, colour: NEUTRAL },
  { fixture: 'effectList', name: 'Bed Light', sub: 'On, 3000 K', target: '71%', on: true, colour: NEUTRAL },
  { fixture: 'colourTemp', name: 'Ceiling Lights', sub: 'On, 2631 K', target: '71%', on: true, colour: NEUTRAL },
  { fixture: 'colourHs', name: 'Kitchen Lights', sub: 'On', target: '71%', on: true, colour: { dark: '#ff4070', light: '#e51f5c' } },
  { fixture: 'rgbw', name: 'Office RGBW Lights', sub: 'On', target: '71%', on: true, colour: { dark: '#ff8080', light: '#c74e51' } },
  { fixture: 'rgbww', name: 'Living Room RGBWW Lights', sub: 'On', target: '71%', on: true, colour: { dark: '#ff7f7d', light: '#c74c4e' } },
];

/** rgba() as happy-dom serialises it in a style attribute. */
const rgbaRe = (hex: string, a: number) => new RegExp(rgba(hex, a).replace(/[(),.]/g, (c) => `\\${c}`).replace(/,/g, ',\\s*'));

describe('tile rendering per fixture state, both glasses', () => {
  for (const glass of ['dark', 'light'] as const) {
    for (const c of CASES) {
      it(`${glass} glass, ${c.fixture}`, async () => {
        const { tile } = setup(c.fixture, { look: { glass } });
        await tile.updateComplete;
        expect($(tile, 'article.tile')!.className).toContain(`g-${glass}`);
        expect(text($(tile, '.name'))).toBe(c.name);
        expect(text($(tile, '.sub'))).toBe(c.sub);
        expect($(tile, 'article')!.getAttribute('aria-label')).toBe(`${c.name} light`);
        expect(power(tile).getAttribute('aria-label')).toBe(`Switch ${c.name}`);
        expect(power(tile).getAttribute('aria-pressed')).toBe(String(c.on));
        expect(power(tile).disabled).toBe(!!c.disabled);
        expect($(tile, 'button.power path')!.getAttribute('d')).toContain('M15 14c.2-1'); // ICO-1 bulb
        const style = power(tile).getAttribute('style') ?? '';
        if (c.colour) {
          expect(style).toMatch(rgbaRe(c.colour[glass], TINT.tile));
          expect(style).toMatch(rgbaRe(c.colour[glass], TINT.tileEdge));
          expect(style).toContain('var(--lc-bright)');
        } else {
          expect(style).not.toContain('rgba');
          expect(style).toContain('var(--lc-fg2)');
        }
        if (c.target === null) {
          // CHO-10: an on/off-only light has no step buttons and no value.
          expect($(tile, '.steps')).toBeNull();
        } else {
          expect(text($(tile, '.target'))).toBe(c.target);
          const [down, up] = steps(tile);
          expect(down.getAttribute('aria-label')).toBe('Lower brightness');
          expect(up.getAttribute('aria-label')).toBe('Raise brightness');
          // CHO-11 and off: the controls are disabled (drawn at 0.3); on they work.
          expect(down.disabled).toBe(!c.on);
          expect(up.disabled).toBe(!c.on);
        }
      });
    }
  }

  it('theme glass follows HA dark mode', async () => {
    const { tile } = setup('colourHs', {}, fakeHass({ darkMode: false }));
    await tile.updateComplete;
    expect($(tile, 'article.tile')!.className).toContain('g-light');
    expect(power(tile).getAttribute('style')).toMatch(rgbaRe('#e51f5c', TINT.tile));
  });

  it('a missing entity says so and disables everything', async () => {
    const tile = document.createElement('liquid-home-tile') as AnyEl;
    tile.setConfig({ entity: 'light.nope' });
    tile.hass = fakeHass().hass;
    document.body.append(tile);
    await tile.updateComplete;
    expect(text($(tile, '.sub'))).toBe('Entity light.nope not found');
    expect(power(tile).disabled).toBe(true);
    expect(steps(tile).every((b) => b.disabled)).toBe(true);
  });

  it('uses the configured name and honours look.blur as the --_blur fallback', async () => {
    const { tile } = setup('colourHs', { name: 'Keuken', look: { blur: 12 } });
    await tile.updateComplete;
    expect(text($(tile, '.name'))).toBe('Keuken');
    expect($(tile, 'article')!.getAttribute('style')).toMatch(/--_blur:\s*12px/);
  });
});

describe('tile writer lease', () => {
  it('a hass update in the same task as the removal never acquires the writer again (refs 0)', async () => {
    const { tile, fh } = setup('colourHs');
    await tile.updateComplete;
    expect(lightWriters.refs(fh.ids.colourHs)).toBe(1);
    tile.hass = fh.update(fh.ids.colourHs, { attributes: { brightness: 100 } });
    tile.remove();
    await settle(tile);
    expect(lightWriters.refs(fh.ids.colourHs)).toBe(0);
  });

  it('appended again it takes the writer back; a synchronous move keeps one ref', async () => {
    const { tile, fh } = setup('colourHs');
    await tile.updateComplete;
    tile.remove();
    await settle(tile);
    expect(lightWriters.refs(fh.ids.colourHs)).toBe(0);
    document.body.append(tile);
    await settle(tile);
    expect(lightWriters.refs(fh.ids.colourHs)).toBe(1);
    const box = document.createElement('div');
    document.body.append(box);
    box.append(tile); // disconnect and connect in one task (an HA relayout)
    await settle(tile);
    expect(lightWriters.refs(fh.ids.colourHs)).toBe(1);
  });

  it('sets its write_hold on the shared writer only when the user acts on the tile', async () => {
    const { tile, fh } = setup('colourHs', { write_hold: 3 });
    await tile.updateComplete;
    const w = lightWriters.acquire(fh.ids.colourHs);
    expect(w.hold).toBe(10);
    steps(tile)[1].click();
    await settle(tile);
    expect(w.hold).toBe(3);
    lightWriters.release(w);
  });
});

describe('tile writes', () => {
  beforeEach(() => vi.useFakeTimers(FAKE_CLOCK));

  it('power switches the light off and on with one call each', async () => {
    const { tile, fh } = setup('colourHs');
    await tile.updateComplete;
    power(tile).click();
    await settle(tile);
    expect(fh.calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: 'light.kitchen_lights' } }]);
    // Held as sent: the tile shows off before HA reports it.
    expect(power(tile).getAttribute('aria-pressed')).toBe('false');
    expect(steps(tile).every((b) => b.disabled)).toBe(true);
    vi.advanceTimersByTime(400);
    power(tile).click();
    await settle(tile);
    expect(fh.calls[1]).toEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.kitchen_lights' } });
  });

  it('power on an off light sends turn_on; an unavailable light sends nothing', async () => {
    const { tile, fh } = setup('off');
    await tile.updateComplete;
    power(tile).click();
    await settle(tile);
    expect(fh.calls).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: 'light.living_room_rgbww_lights_off' } }]);
    const u = setup('unavailable', {}, fh);
    await u.tile.updateComplete;
    power(u.tile).click();
    await settle(u.tile);
    expect(fh.calls).toHaveLength(1);
  });

  it('step buttons write through the 300 ms throttle: the first tap at once, then one coalesced write', async () => {
    const { tile, fh } = setup('colourHs');
    await tile.updateComplete;
    const [, up] = steps(tile);
    up.click();
    await settle(tile);
    expect(fh.calls).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: 'light.kitchen_lights', brightness_pct: 81 } }]);
    expect(text($(tile, '.target'))).toBe('81%');
    up.click();
    await settle(tile);
    up.click();
    await settle(tile);
    // Inside the window: nothing more is sent, the value moves on screen.
    expect(fh.calls).toHaveLength(1);
    expect(text($(tile, '.target'))).toBe('100%');
    expect(up.disabled).toBe(true);
    vi.advanceTimersByTime(299);
    await settle(tile);
    expect(fh.calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await settle(tile);
    expect(fh.calls).toHaveLength(2);
    expect(fh.calls[1].data).toEqual({ entity_id: 'light.kitchen_lights', brightness_pct: 100 });
    vi.advanceTimersByTime(1000);
    await settle(tile);
    expect(fh.calls).toHaveLength(2);
  });

  it('step down stops at 1 % (the lowest on) and the held value gives way to the echo', async () => {
    const { tile, fh } = setup('dimmed');
    await tile.updateComplete;
    const [down] = steps(tile);
    down.click();
    await settle(tile);
    expect(fh.calls[0].data).toEqual({ entity_id: 'light.kitchen_lights_dimmed', brightness_pct: 1 });
    expect(text($(tile, '.target'))).toBe('1%');
    expect(down.disabled).toBe(true);
    // HA reports 1 % (brightness 3): the hold ends, the state shows.
    tile.hass = fh.update('light.kitchen_lights_dimmed', { attributes: { brightness: 3 } });
    await settle(tile);
    expect(text($(tile, '.target'))).toBe('1%');
    // A later report from somewhere else shows at once: nothing is held any more.
    tile.hass = fh.update('light.kitchen_lights_dimmed', { attributes: { brightness: 128 } });
    await settle(tile);
    expect(text($(tile, '.target'))).toBe('50%');
  });

  it('a failed write shows the error in the subline', async () => {
    const { tile, fh } = setup('colourHs');
    fh.hass.callService = async () => {
      throw new Error('boom');
    };
    tile.hass = { ...fh.hass };
    await tile.updateComplete;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    power(tile).click();
    await settle(tile);
    expect($(tile, '.sub')!.className).toContain('err');
    expect(text($(tile, '.sub'))).toBe('boom');
  });
});

describe('tile tap actions', () => {
  it('a tap on the name opens the light card in the shared sheet (default tap_action sheet)', async () => {
    const { tile, fh } = setup('colourHs', { name: 'Keuken', write_hold: 5 });
    await tile.updateComplete;
    const body = $(tile, 'button.body') as HTMLButtonElement;
    expect(body.getAttribute('aria-haspopup')).toBe('dialog');
    body.click();
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    expect(sheet.isOpen).toBe(true);
    expect(sheet.owner).toBe(tile);
    const card = sheet.shadowRoot!.querySelector('liquid-home-light-card') as AnyEl;
    expect(card.config).toMatchObject({ type: 'custom:liquid-home-light-card', entity: 'light.kitchen_lights', name: 'Keuken', write_hold: 5 });
    expect(card.config.tap_action).toBeUndefined();
    expect(card.hass).toBe(fh.hass);
  });

  it('more-info fires hass-more-info; none renders a plain body', async () => {
    const { tile } = setup('colourHs', { tap_action: 'more-info' });
    await tile.updateComplete;
    const seen = vi.fn();
    tile.addEventListener('hass-more-info', (e) => seen((e as CustomEvent).detail));
    ($(tile, 'button.body') as HTMLButtonElement).click();
    expect(seen).toHaveBeenCalledWith({ entityId: 'light.kitchen_lights' });
    tile.setConfig({ entity: 'light.kitchen_lights', tap_action: 'none' });
    await tile.updateComplete;
    expect($(tile, 'button.body')).toBeNull();
    expect($(tile, 'div.body')).not.toBeNull();
  });
});

describe('tile config and Lovelace API', () => {
  it('normalizes, falls back on unknown values and prunes defaults', () => {
    const c = normalizeConfig({ entity: 'light.a', tap_action: 'boom', write_hold: -1 });
    expect(c).toMatchObject({ type: 'custom:liquid-home-tile', entity: 'light.a', tap_action: 'sheet', write_hold: 10, config_version: 1 });
    expect(c.look).toEqual({ glass: 'theme', blur: 30, motion: 'rich' });
    expect(pruneConfig(c)).toEqual({ type: 'custom:liquid-home-tile', entity: 'light.a', config_version: 1 });
    expect(pruneConfig(normalizeConfig({ entity: 'light.a', tap_action: 'none' }))).toMatchObject({ tap_action: 'none' });
    expect(defaultConfig.tap_action).toBe('sheet');
  });

  it('sheetConfig passes the light card options on without the tile keys', () => {
    const s = sheetConfig(normalizeConfig({ entity: 'light.a', tap_action: 'more-info', controls: { effects: false } }));
    expect(s.type).toBe('custom:liquid-home-light-card');
    expect(s.controls).toEqual({ effects: false });
    expect('tap_action' in s).toBe(false);
  });

  it('the light card keys go through the light card normalizer, so the sheet reads them as the card would', () => {
    const raw = { entity: 'light.a', name: '  ', write_hold: '12', controls: { modes: ['colour', 'x', 'brightness'], effects: 'no' }, look: { blur: '8', glass: 'pink' } };
    const { type: _t, tap_action: _a, ...tile } = normalizeConfig(raw);
    const { type: _l, ...card } = normalizeLightConfig(raw);
    expect(tile).toEqual(card);
    expect(tile).toMatchObject({ write_hold: 12, controls: { modes: ['brightness', 'colour'], effects: true }, look: { glass: 'theme', blur: 8, motion: 'rich' } });
  });

  it('stamps a config without config_version silently', () => {
    expect(normalizeConfig({ entity: 'light.a' }).config_version).toBe(1);
  });

  it('rejects anything but a light entity', () => {
    const tile = document.createElement('liquid-home-tile') as AnyEl;
    expect(() => tile.setConfig({ entity: 'climate.x' })).toThrow('Choose a light entity');
    expect(() => tile.setConfig({})).toThrow();
  });

  it('grid options and card size equal the Liquid Climate tile; the stub picks a light', () => {
    const tile = document.createElement('liquid-home-tile') as AnyEl;
    expect(tile.getGridOptions()).toEqual({ columns: 12, rows: 'auto', min_columns: 6 });
    expect(tile.getCardSize()).toBe(2);
    expect(LiquidHomeTile.getStubConfig(fakeHass().hass)).toEqual({ type: 'custom:liquid-home-tile', entity: 'light.kitchen_lights_dimmed', config_version: 1 });
  });

  it('is registered under its own tag only', () => {
    expect(customElements.get('liquid-home-tile')).toBe(LiquidHomeTile);
  });
});
