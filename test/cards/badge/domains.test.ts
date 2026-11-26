// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICONS, STATUS_COLORS, TINT, rgba } from '@decibel95/liquid-core';
import '../../../src/cards/badge';
import '../../../src/cards/cover';
import '../../../src/cards/fan';
import { lightSheet } from '../../../src/cards/sheet/open';
import { LiquidHomeBadge, badgeState } from '../../../src/cards/badge/liquid-home-badge';
import { normalizeConfig, sheetConfig } from '../../../src/cards/badge/config';
import { $, cssRules, settle, text, type AnyEl } from '../tile/helpers';
import { domainHass, type DomainHass } from '../tile/domains';

/**
 * Plan 2.6, badge for covers and fans (P2-CHO-10, P2-CHO-21 option B, Q9 a): the values, the pill icon tint (neutral
 * 0.3 while open, moving or on, status off 0.3 otherwise), the round badge without tint when closed or off, the tap that
 * opens the entity's card with History and never switches the device, and the gate 3 name fix.
 */

function setup(entity: string, cfg: Record<string, unknown> = {}, dh: DomainHass = domainHass()) {
  const badge = document.createElement('liquid-home-badge') as AnyEl;
  badge.setConfig({ type: 'custom:liquid-home-badge', entity, ...cfg });
  badge.hass = dh.hass;
  document.body.append(badge);
  return { badge, dh };
}

const root = (b: AnyEl) => $(b, '.badge') as HTMLElement;
const rgbaRe = (hex: string, a: number) => new RegExp(rgba(hex, a).replace(/[(),.]/g, (c) => `\\${c}`).replace(/,/g, ',\\s*'));
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
});

const CASES: { entity: string; name: string; value: string; kind: 'on' | 'off' | 'unavailable'; glyph: keyof typeof ICONS }[] = [
  { entity: 'cover.living_room_window', name: 'Living Room Window', value: '70%', kind: 'on', glyph: 'blinds' },
  { entity: 'cover.hall_window', name: 'Hall Window', value: '10%', kind: 'on', glyph: 'blinds' },
  { entity: 'cover.hall_window_closed', name: 'Hall Window', value: 'Closed', kind: 'off', glyph: 'blinds' },
  { entity: 'cover.hall_window_opening', name: 'Hall Window', value: 'Opening', kind: 'on', glyph: 'blinds' },
  { entity: 'cover.hall_window_closing', name: 'Hall Window', value: 'Closing', kind: 'on', glyph: 'blinds' },
  { entity: 'cover.kitchen_window_open', name: 'Kitchen Window', value: 'Open', kind: 'on', glyph: 'blinds' },
  { entity: 'cover.kitchen_window', name: 'Kitchen Window', value: 'Closed', kind: 'off', glyph: 'blinds' },
  { entity: 'cover.pergola_roof', name: 'Pergola Roof', value: 'Closed', kind: 'off', glyph: 'blinds' },
  { entity: 'cover.garage_door', name: 'Garage Door', value: 'Closed', kind: 'off', glyph: 'door' },
  { entity: 'cover.garage_door_open', name: 'Garage Door', value: 'Open', kind: 'on', glyph: 'door' },
  { entity: 'cover.hall_window_unavailable', name: 'Hall Window', value: 'Unavailable', kind: 'unavailable', glyph: 'blinds' },
  { entity: 'fan.living_room_fan_67', name: 'Living Room Fan', value: '67%', kind: 'on', glyph: 'fan' },
  { entity: 'fan.living_room_fan_auto', name: 'Living Room Fan', value: 'Auto', kind: 'on', glyph: 'fan' },
  { entity: 'fan.lh_fixture_onoff', name: 'Bedroom Fan', value: 'On', kind: 'on', glyph: 'fan' },
  { entity: 'fan.preset_only_limited_fan_auto', name: 'Preset Only Limited Fan', value: 'Auto', kind: 'on', glyph: 'fan' },
  { entity: 'fan.living_room_fan', name: 'Living Room Fan', value: 'Off', kind: 'off', glyph: 'fan' },
  { entity: 'fan.no_turn', name: 'No Turn Fan', value: '50%', kind: 'on', glyph: 'fan' },
  { entity: 'fan.living_room_fan_unavailable', name: 'Living Room Fan', value: 'Unavailable', kind: 'unavailable', glyph: 'fan' },
];

describe('cover and fan badges per state, both glasses, pill and round', () => {
  for (const glass of ['dark', 'light'] as const) {
    for (const c of CASES) {
      it(`${glass} glass, ${c.entity}`, async () => {
        const { badge, dh } = setup(c.entity, { look: { glass } });
        await badge.updateComplete;
        const el = root(badge);
        expect(el.tagName).toBe('BUTTON');
        expect(el.className).toContain(`g-${glass}`);
        expect(el.className).toContain('pill');
        expect(el.className).toContain(`k-${c.kind}`);
        expect(el.getAttribute('aria-label')).toBe(`${c.name}: ${c.value}`);
        expect(text($(badge, '.n'))).toBe(c.name);
        expect(text($(badge, '.v'))).toBe(c.value);
        expect($(badge, '.ic path')!.getAttribute('d')).toBe(ICONS[c.glyph]);
        // P2-CHO-10, P2-COL-1/2: neutral 0.3 while open, moving or on; status off 0.3 when closed, off or unavailable.
        const colour = c.kind === 'on' ? NEUTRAL[glass] : STATUS_COLORS.off;
        expect($(badge, '.ic')!.getAttribute('style')).toMatch(rgbaRe(colour, TINT.badge));

        // Round: option B, the circle carries the neutral only while on; closed, off and unavailable are plain glass.
        badge.setConfig({ entity: c.entity, icon_only: true, look: { glass } });
        await badge.updateComplete;
        expect(root(badge).className).toContain('round');
        expect($(badge, '.txt')).toBeNull();
        expect(root(badge).getAttribute('aria-label')).toBe(`${c.name}: ${c.value}`);
        // happy-dom drops linear-gradient from the style attribute; the Playwright run checks the drawn circle.
        const st = badgeState(dh.hass, dh.hass.states[c.entity], glass);
        expect(st.roundTint).toBe(c.kind === 'on');
        expect(st.color).toBe(colour);
        if (c.kind !== 'on') expect(root(badge).getAttribute('style') ?? '').not.toContain('gradient');
      });
    }
  }

  it('lights keep their round tint in every state (0.2 behaviour unchanged)', () => {
    const dh = domainHass();
    const light = { entity_id: 'light.x', state: 'off', attributes: { friendly_name: 'X' } } as never;
    expect(badgeState(dh.hass, light, 'dark').roundTint).toBe(true);
    expect(badgeState(dh.hass, light, 'dark').glyph).toBe(ICONS.bulb);
  });

  it('follows state changes', async () => {
    const { badge, dh } = setup('cover.hall_window');
    await badge.updateComplete;
    badge.hass = dh.update('cover.hall_window', { state: 'closing' });
    await settle(badge);
    expect(text($(badge, '.v'))).toBe('Closing');
    badge.hass = dh.update('cover.hall_window', { state: 'closed', attributes: { current_position: 0 } });
    await settle(badge);
    expect(text($(badge, '.v'))).toBe('Closed');
    expect(root(badge).className).toContain('k-off');
  });

  it('a missing cover or fan shows Unavailable with its own glyph (domain from the configured entity id)', async () => {
    for (const [entity, glyph] of [
      ['cover.nope', ICONS.blinds],
      ['fan.nope', ICONS.fan],
      ['light.nope', ICONS.bulb],
    ] as const) {
      const { badge } = setup(entity);
      await badge.updateComplete;
      expect(text($(badge, '.v'))).toBe('Unavailable');
      expect(root(badge).className).toContain('k-unavailable');
      expect($(badge, '.ic path')!.getAttribute('d')).toBe(glyph);
      badge.remove();
    }
  });
});

describe('cover and fan badge tap (Q9 a)', () => {
  it('sheet opens the entity card with History; the tap never calls a service', async () => {
    for (const [entity, tag] of [
      ['cover.hall_window', 'liquid-home-cover-card'],
      ['fan.living_room_fan_67', 'liquid-home-fan-card'],
    ] as const) {
      const { badge, dh } = setup(entity, { tap_action: 'sheet' });
      await badge.updateComplete;
      expect(root(badge).getAttribute('aria-haspopup')).toBe('dialog');
      root(badge).click();
      await settle();
      const sheet = lightSheet()!;
      await sheet.updateComplete;
      await settle();
      expect(sheet.isOpen).toBe(true);
      expect(sheet.entity).toBe(entity);
      const card = sheet.shadowRoot!.querySelector(tag) as AnyEl;
      expect(card).not.toBeNull();
      expect(card._config).toMatchObject({ entity });
      expect(card._config.icon_only).toBeUndefined();
      expect(card._config.tap_action).toBeUndefined();
      expect(dh.calls).toEqual([]);
      const log: string[] = [];
      const push = vi.spyOn(window.history, 'pushState').mockImplementation((_d, _t, u) => void log.push(`push ${u}:open=${sheet.isOpen}`));
      const onLoc = () => log.push('location-changed');
      window.addEventListener('location-changed', onLoc);
      (sheet.shadowRoot!.querySelector('button.history') as HTMLButtonElement).click();
      await settle();
      window.removeEventListener('location-changed', onLoc);
      push.mockRestore();
      expect(log).toEqual([`push /history?entity_id=${entity}:open=false`, 'location-changed']);
      badge.remove();
    }
  });

  it('the round badge opens the sheet too (option B changes only the tint)', async () => {
    const { badge, dh } = setup('cover.hall_window_closed', { tap_action: 'sheet', icon_only: true });
    await badge.updateComplete;
    root(badge).click();
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    expect(sheet.isOpen).toBe(true);
    expect(sheet.entity).toBe('cover.hall_window_closed');
    expect(dh.calls).toEqual([]);
  });

  it('more-info (default) fires hass-more-info for the entity and never calls a service', async () => {
    const { badge, dh } = setup('fan.living_room_fan_67');
    await badge.updateComplete;
    // HA's more-info is a dialog too (plan 2.6, 2.12).
    expect(root(badge).getAttribute('aria-haspopup')).toBe('dialog');
    const seen = vi.fn();
    badge.addEventListener('hass-more-info', (e) => seen((e as CustomEvent).detail));
    root(badge).click();
    await settle(badge);
    expect(seen).toHaveBeenCalledWith({ entityId: 'fan.living_room_fan_67' });
    expect(dh.calls).toEqual([]);
  });

  it('sheetConfig types the card by domain', () => {
    expect(sheetConfig(normalizeConfig({ entity: 'cover.a', icon_only: true })).type).toBe('custom:liquid-home-cover-card');
    expect(sheetConfig(normalizeConfig({ entity: 'fan.a' })).type).toBe('custom:liquid-home-fan-card');
    expect(sheetConfig(normalizeConfig({ entity: 'light.a' })).type).toBe('custom:liquid-home-light-card');
  });

  it('accepts light, cover and fan entities, rejects any other', () => {
    const badge = document.createElement('liquid-home-badge') as AnyEl;
    expect(() => badge.setConfig({ entity: 'cover.x' })).not.toThrow();
    expect(() => badge.setConfig({ entity: 'fan.x' })).not.toThrow();
    expect(() => badge.setConfig({ entity: 'switch.x' })).toThrow('Choose a light entity (light.*), a cover (cover.*) or a fan (fan.*)');
  });
});

describe('badge name (gate 3 fix)', () => {
  it('the pill is a grid whose text column shrinks to 0 (keywords only) and keeps the core ellipsis', () => {
    const sheets = LiquidHomeBadge.styles as unknown as { cssText: string }[];
    const local = cssRules(sheets[sheets.length - 1].cssText);
    expect(local).toEqual({ '.pill': { display: 'grid', 'grid-template-columns': 'auto minmax(0, max-content)' } });
    const core = cssRules(sheets[2].cssText);
    expect(core['.n']).toMatchObject({ 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' });
    expect(core['.txt']).toMatchObject({ 'min-width': '0' });
  });

  it('a long name renders whole in the DOM (the ellipsis is drawn by CSS)', async () => {
    const { badge } = setup('fan.long_badge');
    await badge.updateComplete;
    expect(text($(badge, '.n'))).toBe('Upstairs Guest Bedroom Ceiling Fan With A Long Name');
    expect(root(badge).getAttribute('aria-label')).toBe('Upstairs Guest Bedroom Ceiling Fan With A Long Name: 67%');
  });
});
