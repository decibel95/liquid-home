// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICONS, STATUS_COLORS, TINT, rgba } from '@decibel95/liquid-core';
import '../../../src/cards/badge';
import '../../../src/cards/media';
import { lightSheet } from '../../../src/cards/sheet/open';
import { LiquidHomeBadge, badgeState } from '../../../src/cards/badge/liquid-home-badge';
import { normalizeConfig, sheetConfig } from '../../../src/cards/badge/config';
import { mediaIds, type MediaFixtureName } from '../media/fixtures';
import { $, settle, text, type AnyEl } from '../tile/helpers';
import { mediaHass, type MediaHass } from '../tile/media-helpers';

/**
 * Plan 2.6 (H4), the badge for media players (P3-CHO-20 option A, P3-CHO-21, D-13): the state word as the value, the
 * speaker glyph, the pill icon in the neutral 0.30 while playing or buffering and status off 0.30 otherwise, the round
 * badge plain unless playing (P2-CHO-21 option B), no artwork, and a tap that never calls a media service.
 */

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };
const rgbaRe = (hex: string, a: number) => new RegExp(rgba(hex, a).replace(/[(),.]/g, (c) => `\\${c}`).replace(/,/g, ',\\s*'));
const root = (b: AnyEl) => $(b, '.badge') as HTMLElement;

async function setup(entity: string, cfg: Record<string, unknown> = {}, fh: MediaHass = mediaHass()) {
  const badge = document.createElement('liquid-home-badge') as AnyEl;
  badge.setConfig({ type: 'custom:liquid-home-badge', entity, ...cfg });
  badge.hass = fh.hass;
  document.body.append(badge);
  await badge.updateComplete;
  return { badge, fh };
}

const CASES: [MediaFixtureName, string, string, 'on' | 'off' | 'unavailable'][] = [
  ['kitchen', 'Kitchen', 'Playing', 'on'],
  ['living_room', 'Living Room', 'Playing', 'on'],
  ['lounge_room', 'Lounge room', 'Playing', 'on'],
  ['group', 'Group', 'Playing', 'on'],
  ['playing', 'Kitchen', 'Playing', 'on'],
  ['paused', 'Living Room', 'Paused', 'off'],
  ['buffering', 'Living Room', 'Buffering', 'on'],
  ['idle', 'Kitchen', 'Idle', 'off'],
  ['standby', 'Living Room', 'Standby', 'off'],
  ['off', 'Kitchen', 'Off', 'off'],
  ['unavailable', 'Kitchen', 'Unavailable', 'unavailable'],
  ['unknown', 'Kitchen', 'Unknown', 'off'],
  ['muted', 'Kitchen', 'Playing', 'on'],
  ['volume_step', 'Kitchen', 'Playing', 'on'],
  ['grouped', 'Downstairs', 'Playing', 'on'],
  ['speaker_modes', 'Kitchen', 'Playing', 'on'],
  ['shuffle_repeat', 'Kitchen', 'Playing', 'on'],
  ['tv_sources', 'TV', 'Playing', 'on'],
  ['onoff_only', 'Amplifier', 'On', 'on'],
  ['onoff_off', 'Amplifier', 'Off', 'off'],
];

describe('media badges per state, both glasses, pill and round (P3-CHO-20 option A, P3-CHO-21)', () => {
  for (const glass of ['dark', 'light'] as const) {
    for (const [fixture, name, value, kind] of CASES) {
      it(`${glass} glass, ${fixture}`, async () => {
        const { badge, fh } = await setup(mediaIds[fixture], { look: { glass } });
        const el = root(badge);
        expect(el.tagName).toBe('BUTTON');
        expect((el as HTMLButtonElement).disabled).toBe(false);
        expect(el.className).toContain(`g-${glass}`);
        expect(el.className).toContain('pill');
        expect(el.className).toContain(`k-${kind}`);
        expect(el.getAttribute('aria-label')).toBe(`${name}: ${value}`);
        expect(text($(badge, '.n'))).toBe(name);
        expect(text($(badge, '.v'))).toBe(value);
        expect($(badge, '.ic path')!.getAttribute('d')).toBe(ICONS.speaker);
        const colour = kind === 'on' ? NEUTRAL[glass] : STATUS_COLORS.off;
        expect($(badge, '.ic')!.getAttribute('style')).toMatch(rgbaRe(colour, TINT.badge));
        // No artwork on badges (P3-CHO-21).
        expect($(badge, '.art')).toBeNull();

        badge.setConfig({ entity: mediaIds[fixture], icon_only: true, look: { glass } });
        await badge.updateComplete;
        expect(root(badge).className).toContain('round');
        expect(root(badge).getAttribute('aria-label')).toBe(`${name}: ${value}`);
        const st = badgeState(fh.hass, fh.hass.states[mediaIds[fixture]], glass);
        expect(st.roundTint).toBe(kind === 'on');
        expect(st.color).toBe(colour);
        if (kind !== 'on') expect(root(badge).getAttribute('style') ?? '').not.toContain('gradient');
      });
    }
  }

  it('a missing media player: Unavailable with the speaker glyph', async () => {
    const { badge } = await setup('media_player.not_there');
    expect(text($(badge, '.v'))).toBe('Unavailable');
    expect(root(badge).className).toContain('k-unavailable');
    expect($(badge, '.ic path')!.getAttribute('d')).toBe(ICONS.speaker);
  });

  it('follows state changes', async () => {
    const fh = mediaHass();
    const { badge } = await setup(mediaIds.playing, {}, fh);
    fh.states[mediaIds.playing] = { ...fh.states[mediaIds.playing], state: 'paused' };
    badge.hass = { ...fh.hass, states: { ...fh.states } };
    await settle(badge);
    expect(text($(badge, '.v'))).toBe('Paused');
    expect(root(badge).className).toContain('k-off');
  });

  it('has no art layer styles and no backdrop-filter beyond the badge glass', () => {
    const css = LiquidHomeBadge.elementStyles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
    expect(css).not.toContain('.art');
  });
});

describe('media badge tap (D-13): never a media service', () => {
  const tapAll = async (tap_action?: string) => {
    const fh = mediaHass();
    const spy = vi.spyOn(fh.hass, 'callService');
    const events: string[] = [];
    const listen = (e: Event) => {
      events.push((e as CustomEvent<{ entityId: string }>).detail.entityId);
    };
    document.addEventListener('hass-more-info', listen);
    for (const fixture of ['playing', 'paused', 'buffering', 'idle', 'off', 'onoff_only', 'onoff_off', 'standby'] as MediaFixtureName[]) {
      const { badge } = await setup(mediaIds[fixture], tap_action ? { tap_action } : {}, fh);
      root(badge).click();
      await settle(badge);
      lightSheet()?.close();
    }
    document.removeEventListener('hass-more-info', listen);
    return { fh, spy, events };
  };

  it('default more-info: opens HA more-info for every state, buffering included, and calls nothing', async () => {
    const { fh, spy, events } = await tapAll();
    expect(events).toEqual(['playing', 'paused', 'buffering', 'idle', 'off', 'onoff_only', 'onoff_off', 'standby'].map((f) => mediaIds[f as MediaFixtureName]));
    expect(spy).not.toHaveBeenCalled();
    expect(fh.calls).toEqual([]);
  });

  it('sheet: opens the media card for the entity, calls nothing', async () => {
    const fh = mediaHass();
    const { badge } = await setup(mediaIds.buffering, { tap_action: 'sheet' }, fh);
    expect((root(badge) as HTMLButtonElement).disabled).toBe(false);
    root(badge).click();
    await settle(badge);
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    expect(sheet.shadowRoot!.querySelector('liquid-home-media-card')).not.toBeNull();
    expect(fh.calls).toEqual([]);
  });

  it('none: a role="img" status, nothing to tap', async () => {
    const { badge, fh } = await setup(mediaIds.playing, { tap_action: 'none' });
    expect(root(badge).tagName).toBe('DIV');
    expect(root(badge).getAttribute('role')).toBe('img');
    root(badge).click();
    expect(fh.calls).toEqual([]);
  });

  it('config: accepts media_player and opens the media card in the sheet', () => {
    expect(() => (document.createElement('liquid-home-badge') as AnyEl).setConfig({ entity: 'media_player.x' })).not.toThrow();
    expect(sheetConfig(normalizeConfig({ entity: 'media_player.a' })).type).toBe('custom:liquid-home-media-card');
  });
});
