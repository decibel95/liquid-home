// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkController, DISABLED_OPACITY, ICONS, PALETTE, TINT, rgba, tone } from '@decibel95/liquid-core';
import '../../../src/cards/tile';
import '../../../src/cards/media';
import { LiquidHomeTile } from '../../../src/cards/tile';
import { mediaIconAction } from '../../../src/cards/tile/liquid-home-tile';
import { normalizeConfig, pruneConfig, sheetConfig } from '../../../src/cards/tile/config';
import { lightSheet } from '../../../src/cards/sheet/open';
import { mediaView, mediaWriters } from '../../../src/media';
import { entity as mediaEntity, mediaIds, type MediaFixtureName } from '../media/fixtures';
import { $, $$, FAKE_CLOCK, settle, text, type AnyEl } from './helpers';
import { MEDIA_EXTRA, mediaHass, type MediaHass } from './media-helpers';

/**
 * Plan 2.6 (H4), the tile for media players: every state on both glasses (P3-CHO-14 to P3-CHO-19), the icon action
 * matrix, the volume steps through the shared media writer, the artwork-backdrop only while playing, paused or
 * buffering (P3-CHO-16), one backdrop-filter.
 */

beforeEach(() => vi.useFakeTimers(FAKE_CLOCK));
afterEach(async () => {
  lightSheet()?.close();
  document.body.innerHTML = '';
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const GLASSES = ['dark', 'light'] as const;

async function mount(fh: MediaHass, entity: string, glass: 'dark' | 'light' = 'dark', extra: Record<string, unknown> = {}) {
  const tile = document.createElement('liquid-home-tile') as AnyEl;
  tile.setConfig({ type: 'custom:liquid-home-tile', entity, look: { glass }, ...extra });
  tile.hass = fh.hass;
  fh.onHass((h) => (tile.hass = h));
  document.body.append(tile);
  await settle(tile);
  return tile;
}

const icon = (tile: AnyEl) => $(tile, 'button.power') as HTMLButtonElement;
const steps = (tile: AnyEl) => $$(tile, 'button.step') as HTMLButtonElement[];
/** P3-COL-1: the fan_only neutral as drawn on each glass (COL-1 of 0.1). */
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };
const rgbaRe = (hex: string, a: number) => new RegExp(rgba(hex, a).replace(/[(),.]/g, (c) => `\\${c}`).replace(/,/g, ',\\s*'));
/**
 * The icon is tinted: the neutral fill and the bright glyph. The glyph colour decides (happy-dom keeps a removed
 * `background` shorthand in the style attribute, so a tint that ends is read from the colour).
 */
const tinted = (tile: AnyEl, glass: 'dark' | 'light') =>
  icon(tile).style.color === 'var(--lc-bright)' && rgbaRe(NEUTRAL[glass], TINT.tile).test(icon(tile).getAttribute('style') ?? '');

interface Want {
  sub: string;
  label: string;
  pressed?: 'true' | 'false';
  disabled: boolean;
  /** Inline opacity of the icon: DISABLED_OPACITY (0.3) while available, '' otherwise (unavailable: core :disabled 0.5). */
  dim: string;
  tint: boolean;
  /** Steps: the readout text ('' when the slot is absent), or null when the steps are hidden. */
  readout: string | null;
  minus?: boolean;
  plus?: boolean;
  art: boolean;
}

/** Every fixture and demo state (plan 2.6): the fixture feature numbers 30141, 21439, 21391, 30137, 554429, 95677, 325053, 22973, 384; demo 119695, 914877. */
const STATES: [MediaFixtureName, Want][] = [
  ['kitchen', { sub: 'Technohead, I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['living_room', { sub: '♥♥ The Best Fireplace Video (3 hours)', label: 'Pause, Living Room', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['lounge_room', { sub: 'House of Cards, Chapter 1', label: 'Pause, Lounge room', disabled: false, dim: '', tint: true, readout: null, art: true }],
  ['group', { sub: 'Playing', label: 'Pause, Group', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: false }],
  ['playing', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['paused', { sub: 'Paused', label: 'Play, Living Room', disabled: false, dim: '', tint: false, readout: '100%', minus: true, plus: false, art: true }],
  ['buffering', { sub: 'Buffering', label: 'Pause, Living Room', disabled: true, dim: String(DISABLED_OPACITY), tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['seek_live', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Seek live', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['idle', { sub: 'Idle', label: 'Play, Kitchen', disabled: false, dim: '', tint: false, readout: '100%', minus: true, plus: false, art: false }],
  ['standby', { sub: 'Standby', label: 'Switch Living Room', pressed: 'false', disabled: false, dim: '', tint: false, readout: null, art: false }],
  ['off', { sub: 'Off', label: 'Switch Kitchen', pressed: 'false', disabled: false, dim: '', tint: false, readout: null, art: false }],
  ['off_no_turn_on', { sub: 'Off', label: 'Switch Kitchen', pressed: 'false', disabled: true, dim: String(DISABLED_OPACITY), tint: false, readout: null, art: false }],
  ['unavailable', { sub: 'Unavailable', label: 'Play, Kitchen', disabled: true, dim: '', tint: false, readout: '--', minus: false, plus: false, art: false }],
  ['unknown', { sub: 'Unknown', label: 'Switch Kitchen', pressed: 'false', disabled: false, dim: '', tint: false, readout: null, art: false }],
  ['muted', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '35%', minus: true, plus: true, art: true }],
  ['volume_mid', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '35%', minus: true, plus: true, art: true }],
  ['volume_step', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '', minus: true, plus: true, art: true }],
  ['grouped', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Downstairs', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['speaker_modes', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['shuffle_repeat', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: true }],
  ['tv_sources', { sub: 'House of Cards, Chapter 1', label: 'Pause, TV', disabled: false, dim: '', tint: true, readout: '60%', minus: true, plus: true, art: true }],
  ['onoff_only', { sub: 'On', label: 'Switch Amplifier', pressed: 'true', disabled: false, dim: '', tint: true, readout: null, art: false }],
  ['onoff_off', { sub: 'Off', label: 'Switch Amplifier', pressed: 'false', disabled: false, dim: '', tint: false, readout: null, art: false }],
  ['no_artwork', { sub: 'Synthetic Set, Paper Lanterns', label: 'Pause, Kitchen', disabled: false, dim: '', tint: true, readout: '100%', minus: true, plus: false, art: false }],
];

describe('media tile per state and glass (P3-CHO-14 to P3-CHO-19)', () => {
  for (const glass of GLASSES) {
    for (const [fixture, want] of STATES) {
      it(`${fixture}, ${glass} glass`, async () => {
        const set = vi.spyOn(ArtworkController.prototype, 'set');
        const fh = mediaHass({ darkMode: glass === 'dark' });
        const tile = await mount(fh, mediaIds[fixture], glass);
        const name = want.label.replace(/^(Pause|Play|Switch),? /, '');
        expect($(tile, 'article')!.getAttribute('aria-label')).toBe(`${name} media player`);
        expect($(tile, 'article')!.classList.contains(`g-${glass}`)).toBe(true);
        expect(text($(tile, '.name'))).toBe(name);
        expect(text($(tile, '.sub'))).toBe(want.sub);
        // The icon: always a button with the speaker glyph (D-15), the label follows the action.
        const b = icon(tile);
        expect(b.tagName).toBe('BUTTON');
        expect(b.querySelector('path')!.getAttribute('d')).toBe(ICONS.speaker);
        expect(b.getAttribute('aria-label')).toBe(want.label);
        expect(b.getAttribute('aria-pressed')).toBe(want.pressed ?? null);
        expect(b.disabled).toBe(want.disabled);
        expect(b.style.opacity).toBe(want.dim);
        // P3-COL-1, P3-CHO-15: the fan_only neutral at TINT 0.24 / 0.45 while playing or buffering (on for on/off-only).
        expect(tinted(tile, glass)).toBe(want.tint);
        expect(tone(PALETTE.neutral, glass)).toBe(NEUTRAL[glass]);
        if (want.tint) expect(b.getAttribute('style')).toMatch(rgbaRe(NEUTRAL[glass], TINT.tileEdge));
        else expect(b.getAttribute('style') ?? '').not.toMatch(/background/);
        // Steps (P3-CHO-17).
        if (want.readout === null) {
          expect($(tile, '.steps')).toBeNull();
        } else {
          const [minus, plus] = steps(tile);
          expect(minus.getAttribute('aria-label')).toBe(`Volume down, ${name}`);
          expect(plus.getAttribute('aria-label')).toBe(`Volume up, ${name}`);
          expect(minus.disabled).toBe(!want.minus);
          expect(plus.disabled).toBe(!want.plus);
          if (want.readout === '') expect($(tile, '.target')).toBeNull();
          else if (fixture === 'muted') {
            // The visible value is aria-hidden; a visually hidden "Muted, 35%" leads for assistive technology.
            expect(text($(tile, '.target > [aria-hidden]'))).toBe(want.readout);
            expect(text($(tile, '.target .sr'))).toBe(`Muted, ${want.readout}`);
          } else expect(text($(tile, '.target'))).toBe(want.readout);
          // P3-CHO-19: muted draws the readout in fg2, the steps stay enabled.
          expect($(tile, '.target')?.classList.contains('muted') ?? false).toBe(fixture === 'muted');
        }
        // P3-CHO-16: the art layer gets a URL only while playing, paused or buffering with a picture.
        expect(set.mock.calls.length).toBeGreaterThan(0);
        expect(set.mock.calls.at(-1)![0] !== undefined).toBe(want.art);
      });
    }
  }

  it('the muted readout rule is the glass fg2 token', () => {
    const css = LiquidHomeTile.elementStyles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
    expect(css.replace(/\s+/g, ' ')).toContain('.target.muted { color: var(--lc-fg2); }');
  });

  it('a missing media player: entity-not-found subline, disabled icon, no steps', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, 'media_player.not_there');
    expect(text($(tile, '.sub'))).toBe('Entity media_player.not_there not found');
    expect(icon(tile).disabled).toBe(true);
    expect($(tile, '.steps')).toBeNull();
  });
});

describe('icon action matrix (P3-CHO-14, GD4)', () => {
  const tap = async (tile: AnyEl) => {
    icon(tile).click();
    await settle(tile);
  };
  const services = (fh: MediaHass) => fh.calls.map((c) => `${c.service} ${c.data.entity_id}`);

  it('playing: Pause sends media_pause, flips at once (optimistic), plain tint; the echo keeps it', async () => {
    const fh = mediaHass({ echoMs: 250 });
    const tile = await mount(fh, mediaIds.playing);
    await tap(tile);
    expect(services(fh)).toEqual([`media_pause ${mediaIds.playing}`]);
    expect(icon(tile).getAttribute('aria-label')).toBe('Play, Kitchen');
    expect(text($(tile, '.sub'))).toBe('Paused');
    expect(tinted(tile, 'dark')).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    await settle(tile);
    expect(fh.hass.states[mediaIds.playing].state).toBe('paused');
    expect(icon(tile).getAttribute('aria-label')).toBe('Play, Kitchen');
  });

  it('paused: Play sends media_play and the tile tints at once', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.paused);
    await tap(tile);
    expect(services(fh)).toEqual([`media_play ${mediaIds.paused}`]);
    expect(icon(tile).getAttribute('aria-label')).toBe('Pause, Living Room');
    expect(tinted(tile, 'dark')).toBe(true);
  });

  it('idle: Play sends media_play', async () => {
    const fh = mediaHass();
    await tap(await mount(fh, mediaIds.idle));
    expect(services(fh)).toEqual([`media_play ${mediaIds.idle}`]);
  });

  it('a failed pause reverts the icon', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.playing);
    tile.hass.callService = async () => Promise.reject(new Error('no'));
    await tap(tile);
    await vi.advanceTimersByTimeAsync(10);
    await settle(tile);
    expect(icon(tile).getAttribute('aria-label')).toBe('Pause, Kitchen');
  });

  it('buffering: disabled at 0.3, a tap sends nothing', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.buffering);
    expect(icon(tile).disabled).toBe(true);
    icon(tile).dispatchEvent(new MouseEvent('click'));
    await settle(tile);
    expect(fh.calls).toEqual([]);
  });

  it('power fallback (on/off-only): "Switch <name>" with aria-pressed, on taps turn_off, off taps turn_on', async () => {
    const fh = mediaHass();
    await tap(await mount(fh, mediaIds.onoff_only));
    await tap(await mount(fh, mediaIds.onoff_off));
    expect(services(fh)).toEqual([`turn_off ${mediaIds.onoff_only}`, `turn_on ${mediaIds.onoff_off}`]);
  });

  it('off, standby and unknown with TURN_ON tap turn_on, not play', async () => {
    const fh = mediaHass();
    for (const f of ['off', 'standby', 'unknown'] as const) await tap(await mount(fh, mediaIds[f]));
    expect(services(fh)).toEqual([`turn_on ${mediaIds.off}`, `turn_on ${mediaIds.standby}`, `turn_on ${mediaIds.unknown}`]);
  });

  it('neither bit: a disabled button that sends nothing (never a non-button, D-15)', async () => {
    const fh = mediaHass();
    for (const id of [MEDIA_EXTRA.noAction().entity_id, MEDIA_EXTRA.pauseOnly().entity_id, mediaIds.off_no_turn_on]) {
      const tile = await mount(fh, id);
      expect(icon(tile).tagName).toBe('BUTTON');
      expect(icon(tile).disabled).toBe(true);
      expect(icon(tile).style.opacity).toBe(String(DISABLED_OPACITY));
      icon(tile).dispatchEvent(new MouseEvent('click'));
    }
    await settle();
    expect(fh.calls).toEqual([]);
  });

  it('unavailable: disabled through the core :disabled rule (power 0.5), steps 0.3 and "--"', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.unavailable);
    expect(icon(tile).disabled).toBe(true);
    expect(icon(tile).style.opacity).toBe('');
    expect(steps(tile).every((s) => s.disabled)).toBe(true);
    expect(text($(tile, '.target'))).toBe('--');
  });
});

describe('volume steps through the shared media writer (P3-CHO-17, GD2)', () => {
  it('VOLUME_SET: plus and minus by 5 through the throttle (leading, at most one per 300 ms, trailing final)', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.volume_mid);
    const [minus, plus] = steps(tile);
    plus.click();
    await settle(tile);
    expect(fh.calls.map((c) => c.data.volume_level)).toEqual([0.4]);
    expect(text($(tile, '.target'))).toBe('40%');
    plus.click();
    plus.click();
    await settle(tile);
    expect(text($(tile, '.target'))).toBe('50%');
    await vi.advanceTimersByTimeAsync(350);
    expect(fh.calls.map((c) => `${c.service} ${c.data.volume_level}`)).toEqual(['volume_set 0.4', 'volume_set 0.5']);
    minus.click();
    await vi.advanceTimersByTimeAsync(350);
    expect(fh.calls.at(-1)!.data.volume_level).toBe(0.45);
  });

  it('step-only (VOLUME_STEP): volume_up and volume_down at once, one call per tap, no readout, never disabled', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.volume_step);
    const [minus, plus] = steps(tile);
    plus.click();
    plus.click();
    minus.click();
    await settle(tile);
    expect(fh.calls.map((c) => c.service)).toEqual(['volume_up', 'volume_up', 'volume_down']);
    expect($(tile, '.target')).toBeNull();
    expect(minus.disabled || plus.disabled).toBe(false);
  });

  it('a volume player that reports no level hides the steps instead of drawing "--"', async () => {
    const e = MEDIA_EXTRA.noLevel();
    const fh = mediaHass();
    const tile = await mount(fh, e.entity_id);
    expect($(tile, '.steps')).toBeNull();
  });

  it('plus is disabled at 100 and minus at 0 (drawn from view.can)', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.kitchen);
    expect(steps(tile)[1].disabled).toBe(true);
    steps(tile)[1].dispatchEvent(new MouseEvent('click'));
    fh.states[mediaIds.volume_mid] = { ...fh.states[mediaIds.volume_mid], attributes: { ...fh.states[mediaIds.volume_mid].attributes, volume_level: 0 } };
    const zero = await mount(mediaHassFrom(fh), mediaIds.volume_mid);
    expect(steps(zero)[0].disabled).toBe(true);
    expect(steps(zero)[1].disabled).toBe(false);
    expect(fh.calls).toEqual([]);
  });

  it('muted: steps stay enabled and send volume_set (P3-CHO-19)', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.muted);
    steps(tile)[0].click();
    await settle(tile);
    expect(fh.calls.map((c) => `${c.service} ${c.data.volume_level}`)).toEqual(['volume_set 0.3']);
  });

  it('a tile step and the sheet card pill on one player share one writer (refs 2) and coalesce', async () => {
    const fh = mediaHass();
    const id = mediaIds.volume_mid;
    const tile = await mount(fh, id);
    ($(tile, 'button.body') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    await vi.advanceTimersByTimeAsync(50);
    const card = sheet.shadowRoot!.querySelector('liquid-home-media-card') as AnyEl;
    expect(card).not.toBeNull();
    card.hass = fh.hass;
    await card.updateComplete;
    // The tile and the sheet's media card share the writer (plan 2.6: refs 2); the sheet holds a third lease for its
    // Shuffle and Repeat header actions (H3, plan 2.8), on the same writer.
    expect(mediaWriters.refs(id)).toBe(3);

    const [, plus] = steps(tile);
    plus.click(); // leading write: 40
    await vi.advanceTimersByTimeAsync(20);
    plus.click(); // pending 45, inside the 300 ms window
    await vi.advanceTimersByTimeAsync(20);
    expect(fh.calls.map((c) => c.data.volume_level)).toEqual([0.4]);

    // The pill in the sheet starts at the shared pending 45: 70 px up on the 280 px pill is +25, so 70.
    await card.updateComplete;
    const pill = card.shadowRoot!.querySelector('[role="slider"][aria-label^="Volume"]')!.closest('.lc-slider') as HTMLElement;
    const pointer = (type: string, clientY: number) =>
      pill.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientY, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));
    pointer('pointerdown', 500);
    pointer('pointermove', 465);
    await vi.advanceTimersByTimeAsync(60);
    pointer('pointermove', 430);
    await vi.advanceTimersByTimeAsync(60);
    pointer('pointerup', 430);
    await vi.advanceTimersByTimeAsync(2000);
    // The tile's pending 45 never went out on its own: one queue, the pill's final value replaced it.
    expect(fh.calls.map((c) => `${c.service} ${c.data.volume_level}`)).toEqual(['volume_set 0.4', 'volume_set 0.7']);
    await settle(tile);
    expect(text($(tile, '.target'))).toBe('70%');
    expect(mediaWriters.refs(id)).toBe(3);
    lightSheet()!.close();
    await vi.advanceTimersByTimeAsync(500);
    expect(mediaWriters.refs(id)).toBe(1);
  });
});

/** A media hass over the (patched) states of another one, without echo. */
function mediaHassFrom(src: MediaHass): MediaHass {
  const fh = mediaHass();
  Object.assign(fh.states, src.states);
  const calls = src.calls;
  const hass = { ...fh.hass, states: { ...src.states }, callService: src.hass.callService };
  return { hass, states: fh.states, calls, onHass: fh.onHass };
}

describe('artwork-backdrop on the tile (P3-CHO-16, plan 2.1.3, 2.12)', () => {
  it('draws the core art layer as the first child of the tile once the image decodes', async () => {
    // happy-dom never reports an intersection: without an observer the controller counts the tile as on screen.
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        src = '';
        decode = () => Promise.resolve();
      },
    );
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.volume_mid);
    await vi.advanceTimersByTimeAsync(1000);
    await settle(tile);
    const art = $(tile, 'article')!.firstElementChild as HTMLElement;
    expect(art.classList.contains('art')).toBe(true);
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(art.querySelector('img')!.getAttribute('src')).toBe('/dev/covers/cover-saturated.png');
    vi.unstubAllGlobals();
  });

  it('exactly one backdrop-filter: the tile glass; the art layer uses filter only', async () => {
    const rules = LiquidHomeTile.elementStyles
      .map((s) => ('cssText' in s ? s.cssText : ''))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...rules.matchAll(/([^{}]+)\{[^{}]*backdrop-filter[^{}]*\}/g)].map((m) => m[1].trim());
    expect(selectors).toEqual(['.tile']);
    expect(rules).toMatch(/\.art img \{[^}]*filter: blur/);
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.playing);
    expect($$(tile, '.tile').length).toBe(1);
  });

  it('a media tile reconfigured to a light drops its art controller and the art layer', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.playing);
    expect(tile._art).toBeInstanceOf(ArtworkController);
    tile.setConfig({ type: 'custom:liquid-home-tile', entity: 'light.x' });
    await settle(tile);
    expect(tile._art).toBeUndefined();
    expect($(tile, '.art')).toBeNull();
  });

  it('a long name and subline carry the ellipsis classes and keep their full text', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, MEDIA_EXTRA.longName().entity_id);
    const name = $(tile, '.name')!;
    const sub = $(tile, '.sub')!;
    expect(text(name)).toBe('Upstairs Guest Bathroom Ceiling Speaker Over The Bathtub Left Side Near The Window');
    expect(text(sub)).toBe('An equally long artist name, A very long track title that runs well past the tile');
    const css = LiquidHomeTile.elementStyles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n').replace(/\s+/g, ' ');
    for (const cls of ['.name', '.sub']) expect(css).toMatch(new RegExp(`\\${cls} \\{[^}]*text-overflow: ellipsis`));
  });

  it('light, cover and fan tiles never create an art controller', async () => {
    const tile = document.createElement('liquid-home-tile') as AnyEl;
    tile.setConfig({ entity: 'fan.x' });
    expect(tile._art).toBeUndefined();
    tile.setConfig({ entity: mediaIds.playing });
    expect(tile._art).toBeInstanceOf(ArtworkController);
  });
});

describe('media tile config', () => {
  it('accepts media_player entities and opens the media card in the sheet', () => {
    const tile = document.createElement('liquid-home-tile') as AnyEl;
    expect(() => tile.setConfig({ entity: 'media_player.x' })).not.toThrow();
    expect(sheetConfig(normalizeConfig({ entity: 'media_player.a' })).type).toBe('custom:liquid-home-media-card');
  });

  it('passes the media card options on and prunes them against the media card defaults', () => {
    const cfg = normalizeConfig({ entity: 'media_player.a', controls: { sources: false } });
    expect(cfg.controls).toMatchObject({ sources: false, sound_modes: true });
    expect(pruneConfig(normalizeConfig({ entity: 'media_player.a' }))).toEqual({ type: 'custom:liquid-home-tile', entity: 'media_player.a', config_version: 1 });
    expect(pruneConfig(cfg)).toMatchObject({ controls: { sources: false } });
  });

  it('the name area opens the sheet with the media card for the entity', async () => {
    const fh = mediaHass();
    const tile = await mount(fh, mediaIds.playing);
    ($(tile, 'button.body') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    expect(sheet.shadowRoot!.querySelector('liquid-home-media-card')).not.toBeNull();
    expect(fh.calls).toEqual([]);
  });
});

describe('mediaIconAction without TURN_ON (off, standby, unknown)', () => {
  // PLAY (16384) and PAUSE (1): transport bits, no TURN_ON or TURN_OFF.
  for (const state of ['off', 'standby', 'unknown']) {
    it(`${state}: a disabled Power, not a disabled Play`, () => {
      const v = mediaView(mediaEntity('media_player.x', state, { friendly_name: 'X', supported_features: 16385 }), { entityId: 'media_player.x' });
      expect(mediaIconAction(v)).toEqual({ action: 'power', label: 'media.aria.power', pressed: false, disabled: true });
    });
  }
  it('standby with TURN_ON stays an enabled Power', () => {
    const v = mediaView(mediaEntity('media_player.x', 'standby', { friendly_name: 'X', supported_features: 16385 | 128 }), { entityId: 'media_player.x' });
    expect(mediaIconAction(v)).toEqual({ action: 'power', label: 'media.aria.power', pressed: false, disabled: false });
  });
});
