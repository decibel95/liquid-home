// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS_COLORS, TINT, rgba } from '@decibel95/liquid-core';
import '../../../src/cards/badge';
import { lightSheet } from '../../../src/cards/sheet/open';
import { LiquidHomeBadge, badgeState } from '../../../src/cards/badge/liquid-home-badge';
import { normalizeConfig, pruneConfig, sheetConfig } from '../../../src/cards/badge/config';
import type { LightFixtureName } from '../../fixtures/lights';
import { $, fakeHass, settle, text, type AnyEl, type FakeHass } from '../tile/helpers';
import { defineStubLightCard } from '../sheet/stub-light-card';

defineStubLightCard();

function setup(fixture: LightFixtureName, cfg: Record<string, unknown> = {}, fh: FakeHass = fakeHass()) {
  const badge = document.createElement('liquid-home-badge') as AnyEl;
  badge.setConfig({ type: 'custom:liquid-home-badge', entity: fh.ids[fixture], ...cfg });
  badge.hass = fh.hass;
  document.body.append(badge);
  return { badge, fh };
}

const root = (b: AnyEl) => $(b, '.badge') as HTMLElement;
const rgbaRe = (hex: string, a: number) => new RegExp(rgba(hex, a).replace(/[(),.]/g, (c) => `\\${c}`).replace(/,/g, ',\\s*'));

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
});

/**
 * The approved badge board (LightBadges): the brightness while on, "On" for an on/off-only light, Off and Unavailable
 * in status off grey on both glasses (#6b7280, CHO-11), entity colour per COL-1 and CON-6 to 8, the neutral for
 * colour temperature, brightness-only, on/off-only and groups (CHO-1 option B, CHO-4).
 */
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };
const OFF = { dark: STATUS_COLORS.off, light: STATUS_COLORS.off };
const CASES: { fixture: LightFixtureName; name: string; value: string; kind: string; colour: { dark: string; light: string } }[] = [
  { fixture: 'dimmed', name: 'Kitchen Lights', value: '10%', kind: 'on', colour: { dark: '#ff4070', light: '#e51f5c' } },
  { fixture: 'unavailable', name: 'Office RGBW Lights', value: 'Unavailable', kind: 'unavailable', colour: OFF },
  { fixture: 'off', name: 'Living Room RGBWW Lights', value: 'Off', kind: 'off', colour: OFF },
  { fixture: 'brightnessOnly', name: 'Ceiling Lights', value: '71%', kind: 'on', colour: NEUTRAL },
  { fixture: 'onOffOnly', name: 'Entrance Color + White Lights', value: 'On', kind: 'on', colour: NEUTRAL },
  { fixture: 'group', name: 'Living Room Lights', value: '71%', kind: 'on', colour: NEUTRAL },
  { fixture: 'effectList', name: 'Bed Light', value: '71%', kind: 'on', colour: NEUTRAL },
  { fixture: 'colourTemp', name: 'Ceiling Lights', value: '71%', kind: 'on', colour: NEUTRAL },
  { fixture: 'colourHs', name: 'Kitchen Lights', value: '71%', kind: 'on', colour: { dark: '#ff4070', light: '#e51f5c' } },
  { fixture: 'rgbw', name: 'Office RGBW Lights', value: '71%', kind: 'on', colour: { dark: '#ff8080', light: '#c74e51' } },
  { fixture: 'rgbww', name: 'Living Room RGBWW Lights', value: '71%', kind: 'on', colour: { dark: '#ff7f7d', light: '#c74c4e' } },
];

describe('badge per fixture state, both glasses, pill and round', () => {
  for (const glass of ['dark', 'light'] as const) {
    for (const c of CASES) {
      it(`${glass} glass, ${c.fixture}`, async () => {
        const { badge, fh } = setup(c.fixture, { look: { glass } });
        await badge.updateComplete;
        const el = root(badge);
        expect(el.tagName).toBe('BUTTON');
        expect(el.className).toContain(`g-${glass}`);
        expect(el.className).toContain('pill');
        expect(el.className).toContain(`k-${c.kind}`);
        expect(el.getAttribute('aria-label')).toBe(`${c.name}: ${c.value}`);
        expect(text($(badge, '.n'))).toBe(c.name);
        expect(text($(badge, '.v'))).toBe(c.value);
        expect($(badge, '.ic')!.getAttribute('style')).toMatch(rgbaRe(c.colour[glass], TINT.badge));
        expect($(badge, '.ic path')!.getAttribute('d')).toContain('M15 14c.2-1'); // ICO-1 bulb

        // Round (icon only): the whole circle carries the colour; no name or value.
        badge.setConfig({ entity: fh.ids[c.fixture], icon_only: true, look: { glass } });
        await badge.updateComplete;
        expect(root(badge).className).toContain('round');
        // happy-dom drops linear-gradient from the style attribute; the circle colour is the same badgeState colour
        // (the Playwright evidence run checks the drawn gradient).
        expect(badgeState(fh.hass, fh.hass.states[fh.ids[c.fixture]], glass).color).toBe(c.colour[glass]);
        expect($(badge, '.txt')).toBeNull();
        expect(root(badge).getAttribute('aria-label')).toBe(`${c.name}: ${c.value}`);
      });
    }
  }

  it('theme glass follows HA dark mode', async () => {
    const { badge } = setup('colourHs', {}, fakeHass({ darkMode: false }));
    await badge.updateComplete;
    expect(root(badge).className).toContain('g-light');
  });

  it('a missing entity shows Unavailable in status off grey', async () => {
    const badge = document.createElement('liquid-home-badge') as AnyEl;
    badge.setConfig({ entity: 'light.nope' });
    badge.hass = fakeHass().hass;
    document.body.append(badge);
    await badge.updateComplete;
    expect(text($(badge, '.v'))).toBe('Unavailable');
    expect(root(badge).className).toContain('k-unavailable');
  });

  it('follows state changes', async () => {
    const { badge, fh } = setup('colourHs');
    await badge.updateComplete;
    badge.hass = fh.update('light.kitchen_lights', { state: 'off' });
    await settle(badge);
    expect(text($(badge, '.v'))).toBe('Off');
  });
});

describe('badge tap actions', () => {
  it('more-info by default (as the Liquid Climate badge)', async () => {
    const { badge } = setup('colourHs');
    await badge.updateComplete;
    const seen = vi.fn();
    badge.addEventListener('hass-more-info', (e) => seen((e as CustomEvent).detail));
    root(badge).click();
    expect(seen).toHaveBeenCalledWith({ entityId: 'light.kitchen_lights' });
    // HA's more-info opens a dialog: announced as one (plan 2.6, 2.12; RH4 finding 4).
    expect(root(badge).getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('sheet opens the light card without the badge keys', async () => {
    const { badge } = setup('colourHs', { tap_action: 'sheet', icon_only: true });
    await badge.updateComplete;
    expect(root(badge).getAttribute('aria-haspopup')).toBe('dialog');
    root(badge).click();
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    expect(sheet.isOpen).toBe(true);
    const card = sheet.shadowRoot!.querySelector('liquid-home-light-card') as AnyEl;
    expect(card.config).toMatchObject({ type: 'custom:liquid-home-light-card', entity: 'light.kitchen_lights' });
    expect(card.config.icon_only).toBeUndefined();
    expect(card.config.tap_action).toBeUndefined();
  });

  it('focus returns to the badge when the sheet closes', async () => {
    const { badge } = setup('colourHs', { tap_action: 'sheet' });
    await badge.updateComplete;
    root(badge).click();
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    await settle();
    // Close has focus inside the sheet (happy-dom cannot read activeElement across both shadow roots here).
    expect(sheet.isOpen).toBe(true);
    sheet.close();
    expect(badge.shadowRoot!.activeElement).toBe(root(badge));
  });

  it('none renders a non-interactive image', async () => {
    const { badge } = setup('colourHs', { tap_action: 'none' });
    await badge.updateComplete;
    expect(root(badge).tagName).toBe('DIV');
    expect(root(badge).getAttribute('role')).toBe('img');
  });
});

describe('badge config and Lovelace API', () => {
  it('normalizes and prunes defaults', () => {
    const c = normalizeConfig({ entity: 'light.a', tap_action: 'x', icon_only: 'yes' });
    expect(c).toMatchObject({ type: 'custom:liquid-home-badge', entity: 'light.a', tap_action: 'more-info', icon_only: false, config_version: 1 });
    expect(pruneConfig(c)).toEqual({ type: 'custom:liquid-home-badge', entity: 'light.a', config_version: 1 });
    expect(sheetConfig(normalizeConfig({ entity: 'light.a', icon_only: true })).type).toBe('custom:liquid-home-light-card');
  });

  it('rejects anything but a light entity', () => {
    expect(() => (document.createElement('liquid-home-badge') as AnyEl).setConfig({ entity: 'sensor.x' })).toThrow('Choose a light entity');
  });

  it('grid options and card size equal the Liquid Climate badge; the stub picks a light', () => {
    const badge = document.createElement('liquid-home-badge') as AnyEl;
    expect(badge.getGridOptions()).toEqual({ columns: 4, rows: 1, min_columns: 2 });
    expect(badge.getCardSize()).toBe(1);
    expect(LiquidHomeBadge.getStubConfig(fakeHass().hass)).toEqual({ type: 'custom:liquid-home-badge', entity: 'light.kitchen_lights_dimmed', config_version: 1 });
    expect(customElements.get('liquid-home-badge')).toBe(LiquidHomeBadge);
  });
});
