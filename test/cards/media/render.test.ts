// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkController, ICONS } from '@decibel95/liquid-core';
import { $, $$, calls, fakeHass, keyOn, pointerOn, text, type FakeWriter } from './helpers';
import { MEDIA_FIXTURES, mediaIds, type MediaFixtureName } from './fixtures';
import { CARD_TYPES, TAGS } from '../../../src/const';
import { LiquidHomeMediaCard } from '../../../src/cards/media';
import { formatTime, seekKeyStep, volumeKeyStep } from '../../../src/cards/media/card';
import { mediaCardStyles } from '../../../src/cards/media/styles';
import { mediaWriters } from '../../../src/media';

vi.mock('../../../src/media/model', async (orig) => {
  const mod = await orig<typeof import('../../../src/media/model')>();
  const { completeView } = await import('./helpers');
  return {
    ...mod,
    mediaView: (e: Parameters<typeof mod.mediaView>[0], o: Parameters<typeof mod.mediaView>[1]) => completeView(mod.mediaView(e, o), e, o),
  };
});
vi.mock('../../../src/media/writer', async () => {
  const { fakeRegistry, fakeWriter } = await import('./helpers');
  return { mediaWriters: fakeRegistry(), createMediaWriter: fakeWriter };
});

const icon = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../src/cards/shared/header-icon', async (orig) => {
  const mod = await orig<typeof import('../../../src/cards/shared/header-icon')>();
  return {
    ...mod,
    renderHeaderIcon: (...args: unknown[]) => (icon.calls.push(args), mod.renderHeaderIcon(...(args as Parameters<typeof mod.renderHeaderIcon>))),
  };
});

/** Plan 2.5: every fixture and demo state on both glasses, aria, History in the sheet, one backdrop-filter, the art layer. */

beforeEach(() => {
  calls.length = 0;
  icon.calls = [];
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const GLASSES = ['dark', 'light'] as const;
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };

interface Want {
  sub: string;
  /** The now playing block, as text. */
  now: string;
  /** Readout big value and caption; '' when there is none. */
  big: string;
  caption?: string;
  /** Pill: volume slider, toggle switch, steps, or none. */
  volume: 'slider' | 'switch' | 'steps' | 'none';
  /** Seek line: interactive slider, read-only progressbar, or none. */
  seek: 'slider' | 'progressbar' | 'none';
  row: string[];
  chips: string[];
  icon: 'active' | 'inactive' | 'unavailable';
  art: boolean;
}

const ROW5 = ['Previous', 'Pause', 'Next', 'Mute', 'Power'];

const STATES: Record<string, [MediaFixtureName, Want]> = {
  'playing music, square art (kitchen demo)': [
    'kitchen',
    {
      sub: 'Playing',
      now: 'I Wanna Be A Hippy (Flamman & Abraxas Radio Mix) Technohead',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'none',
      row: ROW5,
      chips: ['Sound mode Music'],
      icon: 'active',
      art: true,
    },
  ],
  'playing, no SEEK (30141)': [
    'playing',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'video 4:3 with seek (living_room demo)': [
    'living_room',
    {
      sub: 'Playing',
      now: '♥♥ The Best Fireplace Video (3 hours) YouTube',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'slider',
      row: ['Pause', 'Mute', 'Power'],
      chips: ['Sound mode Music'],
      icon: 'active',
      art: true,
    },
  ],
  '16:9 art': [
    'artwork_16x9',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  paused: [
    'paused',
    {
      sub: 'Paused',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'slider',
      row: ['Previous', 'Play', 'Next', 'Mute', 'Power'],
      chips: [],
      icon: 'inactive',
      art: true,
    },
  ],
  buffering: [
    'buffering',
    {
      sub: 'Buffering',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'seek live (21439)': [
    'seek_live',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'slider',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  idle: [
    'idle',
    {
      sub: 'Idle',
      now: 'Nothing playing',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'none',
      row: ['Play', 'Mute', 'Power'],
      chips: [],
      icon: 'inactive',
      art: false,
    },
  ],
  standby: [
    'standby',
    {
      sub: 'Standby',
      now: 'Nothing playing',
      big: '',
      volume: 'none',
      seek: 'none',
      row: ['Play', 'Power'],
      chips: [],
      icon: 'inactive',
      art: false,
    },
  ],
  off: [
    'off',
    {
      sub: 'Off',
      now: '',
      big: '',
      volume: 'none',
      seek: 'none',
      row: ['Power'],
      chips: [],
      icon: 'inactive',
      art: false,
    },
  ],
  unavailable: [
    'unavailable',
    {
      sub: 'Unavailable',
      now: '',
      big: '--',
      caption: 'Volume',
      volume: 'slider',
      seek: 'none',
      row: ['Previous', 'Play', 'Next', 'Mute', 'Power'],
      chips: [],
      icon: 'unavailable',
      art: false,
    },
  ],
  unknown: [
    'unknown',
    {
      sub: 'Unknown',
      now: '',
      big: '',
      volume: 'none',
      seek: 'none',
      row: ['Power'],
      chips: [],
      icon: 'inactive',
      art: false,
    },
  ],
  'muted 35': [
    'muted',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '35%',
      caption: 'Muted',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'volume 35': [
    'volume_mid',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '35%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'step-only (30137)': [
    'volume_step',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '',
      volume: 'steps',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'no volume (lounge_room demo)': [
    'lounge_room',
    {
      sub: 'Playing',
      now: 'Chapter 1 House of Cards, S1 E1 Netflix',
      big: '',
      volume: 'none',
      seek: 'none',
      row: ['Previous', 'Pause', 'Next', 'Power'],
      chips: ['Source dvd', 'Sound mode Music'],
      icon: 'active',
      art: true,
    },
  ],
  'TV with sources (22973)': [
    'tv_sources',
    {
      sub: 'Playing',
      now: 'Chapter 1 House of Cards, S1 E1 Netflix',
      big: '60%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'none',
      row: ROW5,
      chips: ['Source HDMI 1'],
      icon: 'active',
      art: true,
    },
  ],
  'speaker with sound modes (95677)': [
    'speaker_modes',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: ['Sound mode Night'],
      icon: 'active',
      art: true,
    },
  ],
  'on/off-only (384)': [
    'onoff_only',
    {
      sub: 'On',
      now: '',
      big: 'On',
      caption: 'Tap to switch',
      volume: 'switch',
      seek: 'none',
      row: [],
      chips: [],
      icon: 'active',
      art: false,
    },
  ],
  'on/off-only, off': [
    'onoff_off',
    {
      sub: 'Off',
      now: '',
      big: 'Off',
      caption: 'Tap to switch',
      volume: 'switch',
      seek: 'none',
      row: [],
      chips: [],
      icon: 'inactive',
      art: false,
    },
  ],
  'no artwork': [
    'no_artwork',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: false,
    },
  ],
  'long title': [
    'long_title',
    {
      sub: 'Playing',
      now: 'A very long track title that runs well past two lines because some albums really do name their songs like this one An equally long artist name, featuring several guests and an orchestra A streaming service with a long name',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'RTL title': [
    'rtl_title',
    {
      sub: 'Playing',
      now: 'שיר ארוך מאוד 🎵 עם אימוג׳י فنان عربي Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'grouped (554429)': [
    'grouped',
    {
      sub: 'Playing, grouped with 1',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'shuffle and repeat (325053), none on the card face': [
    'shuffle_repeat',
    {
      sub: 'Playing',
      now: 'Paper Lanterns Synthetic Set Bounzz',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'progressbar',
      row: ROW5,
      chips: [],
      icon: 'active',
      art: true,
    },
  ],
  'group demo (643983), no title, no picture': [
    'group',
    {
      sub: 'Playing',
      now: '',
      big: '100%',
      caption: 'Volume',
      volume: 'slider',
      seek: 'none',
      row: ['Pause', 'Mute', 'Power'],
      chips: ['Sound mode Music'],
      icon: 'active',
      art: false,
    },
  ],
};

function volumeKind(el: HTMLElement): Want['volume'] {
  if ($(el, '.steps')) return 'steps';
  const pill = $(el, '.slwrap .lc-slider');
  if (!pill) return 'none';
  return pill.getAttribute('role') === 'switch' ? 'switch' : 'slider';
}

function seekKind(el: HTMLElement): Want['seek'] {
  const s = $(el, '.seek .lc-slider');
  return !s ? 'none' : (s.getAttribute('role') as 'slider' | 'progressbar');
}

describe('every fixture and demo state on both glasses (plan 2.5)', () => {
  for (const glass of GLASSES) {
    for (const [label, [fixture, want]] of Object.entries(STATES)) {
      it(`${label}, ${glass} glass`, async () => {
        const setArt = vi.spyOn(ArtworkController.prototype, 'set');
        const h = fakeHass({ glassDark: glass === 'dark' });
        const el = await h.mount(fixture, { look: { glass } });
        const name = h.states[mediaIds[fixture]].attributes.friendly_name as string;
        const lc = $(el, 'section.lc')!;
        expect(lc.classList.contains(`g-${glass}`)).toBe(true);
        expect(lc.classList.contains('rim')).toBe(true);
        expect(lc.getAttribute('aria-label')).toBe(name);
        expect(text($(el, 'header h2'))).toBe(name);
        expect(text($(el, 'header .sub'))).toBe(want.sub);
        expect(text($(el, '.npt'))).toBe(want.now);
        expect(text($(el, '.big')) + text($(el, '.unit'))).toBe(want.big);
        if (want.caption) expect(text($(el, '.ro .sub'))).toBe(want.caption);
        expect(volumeKind(el)).toBe(want.volume);
        expect(seekKind(el)).toBe(want.seek);
        expect($$(el, '.modes .mode span').map(text)).toEqual(want.row);
        expect($$(el, '.chip').map(text)).toEqual(want.chips);
        // Header device icon (P2-CHO-22, P3-CHO-23): speaker, neutral colour, state per the rule.
        const [glyph, state, colour] = icon.calls.at(-1)!;
        expect([glyph, state, colour]).toEqual(['speaker', want.icon, NEUTRAL[glass]]);
        // The art layer is fed with the view's URL and only in playing, paused or buffering (P3-TOK-2, P3-CHO-16).
        expect(setArt.mock.calls.at(-1)![0] !== undefined).toBe(want.art);
        // History on the card face (P3-CHO-6, D-10).
        expect($(el, 'header .history')?.getAttribute('aria-label')).toBe('History');
        // Stop, shuffle and repeat are never on the card face.
        const paths = $$(el, '.modes path').map((p) => p.getAttribute('d'));
        for (const k of ['stop', 'shuffle', 'repeat', 'repeat1'] as const) expect(paths).not.toContain(ICONS[k as keyof typeof ICONS]);
      });
    }
  }
});

describe('the art layer', () => {
  it.each(['idle', 'standby', 'off', 'unavailable', 'unknown'] as MediaFixtureName[])('is absent in %s: the controller gets no URL', async (fixture) => {
    const set = vi.spyOn(ArtworkController.prototype, 'set');
    const el = await fakeHass().mount(fixture);
    // Non-vacuous: the controller was fed, and only with "no art".
    expect(set.mock.calls.length).toBeGreaterThan(0);
    expect(set.mock.calls.every(([url]) => url === undefined)).toBe(true);
    expect($(el, '.art')).toBeNull();
  });

  it('gets the URL while playing (control for the test above)', async () => {
    const set = vi.spyOn(ArtworkController.prototype, 'set');
    await fakeHass().mount('playing');
    expect(set.mock.calls.at(-1)![0]).toBe('/dev/covers/cover-dark.png');
  });

  it('is the first child of the glass surface, inside the single glass (plan 2.5 structure)', async () => {
    const el = await fakeHass().mount('playing');
    const lc = $(el, 'section.lc')!;
    // renderArtwork renders nothing until a decoded image exists; whatever it renders comes before the header.
    const first = [...lc.children][0];
    expect(['HEADER', 'DIV']).toContain(first.tagName);
    if (first.tagName === 'DIV') expect(first.classList.contains('art')).toBe(true);
  });
});

describe('exactly one backdrop-filter in the card (plan 2.12)', () => {
  it('only the glass surface carries one, in every state', async () => {
    const rules = LiquidHomeMediaCard.elementStyles
      .map((s) => ('cssText' in s ? s.cssText : ''))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...rules.matchAll(/([^{}]+)\{[^{}]*backdrop-filter[^{}]*\}/g)].map((m) => m[1].trim());
    expect(selectors).toEqual(['.lc']);
    for (const fixture of ['playing', 'tv_sources', 'off', 'unavailable', 'volume_step', 'onoff_only'] as MediaFixtureName[]) {
      const el = await fakeHass().mount(fixture);
      if (fixture === 'tv_sources') ($(el, '.chip') as HTMLButtonElement).click();
      await el.updateComplete;
      expect($$(el, selectors[0]).length).toBe(1);
      // The art layer blurs its image with `filter`, never a second backdrop-filter.
      expect(rules).not.toMatch(/\.art[^{]*\{[^}]*backdrop-filter/);
      el.remove();
    }
  });
});

describe('aria (plan 2.11)', () => {
  it('volume pill: label, range and valuetext, "Muted, 35%" while muted, never "Off" at 0 (D-5)', async () => {
    const h = fakeHass();
    const vol = (el: HTMLElement) => $(el, '.slwrap .lc-slider')!;
    const mid = await h.mount('volume_mid');
    expect(vol(mid).getAttribute('aria-label')).toBe('Volume, Kitchen');
    expect([vol(mid).getAttribute('aria-valuemin'), vol(mid).getAttribute('aria-valuemax'), vol(mid).getAttribute('aria-valuenow')]).toEqual([
      '0',
      '100',
      '35',
    ]);
    expect(vol(mid).getAttribute('aria-valuetext')).toBe('35%');
    expect(vol(mid).getAttribute('aria-orientation')).toBe('vertical');
    const muted = await h.mount('muted');
    expect(vol(muted).getAttribute('aria-valuetext')).toBe('Muted, 35%');
    // The percent is the core text in every language, muted or not (de: "35 %"; "Muted" is translated by H8).
    const de = fakeHass({ language: 'de' });
    expect(vol(await de.mount('muted')).getAttribute('aria-valuetext')).toBe('Stumm, 35 %');
    expect(vol(await de.mount('volume_mid')).getAttribute('aria-valuetext')).toBe('35 %');
    const zero = {
      ...h.states[mediaIds.volume_mid],
      attributes: {
        ...h.states[mediaIds.volume_mid].attributes,
        volume_level: 0,
      },
    };
    mid.hass = {
      ...h.hass,
      states: { ...h.states, [mediaIds.volume_mid]: zero },
    };
    await mid.updateComplete;
    expect(vol(mid).getAttribute('aria-valuetext')).toBe('0%');
    expect(text($(mid, '.big'))).toBe('0');
  });

  it('seek: horizontal slider with "0:45 of 5:00", progressbar without tabindex or orientation when read-only', async () => {
    const h = fakeHass();
    const lr = await h.mount('paused');
    const seek = $(lr, '.seek .lc-slider')!;
    expect(seek.getAttribute('role')).toBe('slider');
    expect(seek.getAttribute('aria-label')).toBe('Position, Living Room');
    expect(seek.getAttribute('aria-orientation')).toBe('horizontal');
    expect(seek.getAttribute('tabindex')).toBe('0');
    expect([seek.getAttribute('aria-valuemax'), seek.getAttribute('aria-valuenow'), seek.getAttribute('aria-valuetext')]).toEqual([
      '300',
      '45',
      '0:45 of 5:00',
    ]);
    // Time labels: 12 px fg2, aria-hidden (the valuetext carries them); elapsed left, remaining right.
    expect($(lr, '.times')!.getAttribute('aria-hidden')).toBe('true');
    expect($$(lr, '.times span').map(text)).toEqual(['0:45', '-4:15']);
    for (const [fixture, total] of [
      ['playing', '4:05'],
      ['buffering', '5:00'],
    ] as [MediaFixtureName, string][]) {
      const el = await h.mount(fixture);
      const p = $(el, '.seek .lc-slider')!;
      expect(p.getAttribute('role')).toBe('progressbar');
      expect(p.hasAttribute('tabindex')).toBe(false);
      expect(p.hasAttribute('aria-orientation')).toBe(false);
      expect(p.getAttribute('aria-valuetext')).toMatch(new RegExp(`^\\d+:\\d\\d of ${total}$`));
    }
  });

  it('h:mm:ss from one hour', async () => {
    const el = await fakeHass().mount('long_track');
    expect($(el, '.seek .lc-slider')!.getAttribute('aria-valuetext')).toMatch(/^1:02:1\d of 3:25:00$/);
    expect([formatTime(45), formatTime(300), formatTime(3730), formatTime(-3)]).toEqual(['0:45', '5:00', '1:02:10', '0:00']);
  });

  it('Mute and Power aria-pressed; Play/Pause label follows the action without aria-pressed', async () => {
    const h = fakeHass();
    const btn = (el: HTMLElement, k: string) => $(el, `.mode[data-action='${k}']`)!;
    const muted = await h.mount('muted');
    expect(btn(muted, 'mute').getAttribute('aria-pressed')).toBe('true');
    expect(btn(muted, 'power').getAttribute('aria-pressed')).toBe('true');
    expect(btn(muted, 'play').getAttribute('aria-label')).toBe('Pause, Kitchen');
    expect(btn(muted, 'play').hasAttribute('aria-pressed')).toBe(false);
    for (const k of ['previous', 'next']) expect(btn(muted, k).hasAttribute('aria-pressed')).toBe(false);
    const mid = await h.mount('volume_mid');
    expect(btn(mid, 'mute').getAttribute('aria-pressed')).toBe('false');
    const paused = await h.mount('paused');
    expect(btn(paused, 'play').getAttribute('aria-label')).toBe('Play, Living Room');
    expect(text(btn(paused, 'play'))).toBe('Play');
    // RH1 L6: standby is not pressed (Power sends turn_on there); off neither.
    const standby = await h.mount('standby');
    expect(btn(standby, 'power').getAttribute('aria-pressed')).toBe('false');
    const off = await h.mount('off');
    expect(btn(off, 'power').getAttribute('aria-pressed')).toBe('false');
    // The row is a labelled group.
    expect($(muted, '.modes')!.getAttribute('role')).toBe('group');
    expect($(muted, '.modes')!.getAttribute('aria-label')).toBe('Playback controls');
  });

  it('Previous is skip-forward mirrored (ICO-8), Mute is volumeX (P3-CHO-12 option A) in both states', async () => {
    const h = fakeHass();
    for (const fixture of ['muted', 'volume_mid'] as MediaFixtureName[]) {
      const el = await h.mount(fixture);
      const prev = $(el, ".mode[data-action='previous'] svg")!;
      expect(prev.classList.contains('mirror')).toBe(true);
      expect(prev.querySelector('path')!.getAttribute('d')).toBe(ICONS.skipForward);
      expect($(el, ".mode[data-action='mute'] path")!.getAttribute('d')).toBe(ICONS.volumeX);
    }
    expect(mediaCardStyles.cssText).toMatch(/svg\.mirror\s*\{\s*transform: scaleX\(-1\)/);
  });

  it('step-only: plus above minus, labelled with the name, no readout (P3-CHO-7)', async () => {
    const el = await fakeHass().mount('volume_step');
    expect($$(el, '.step').map((b) => b.getAttribute('aria-label'))).toEqual(['Volume up, Kitchen', 'Volume down, Kitchen']);
    expect($(el, '.big')).toBeNull();
  });

  it('on/off-only: a switch with aria-checked, readout and caption, no row (P3-CHO-8)', async () => {
    const el = await fakeHass().mount('onoff_only');
    const sw = $(el, '.lc-slider')!;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.getAttribute('aria-label')).toBe('Switch Amplifier');
    expect($(el, '.modes')).toBeNull();
  });

  it('unavailable: CHO-11 values (power 0.5, controls 0.3, readout "--")', async () => {
    const el = await fakeHass().mount('unavailable');
    const buttons = $$(el, '.mode');
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(buttons.map((b) => b.style.opacity)).toEqual(['0.3', '0.3', '0.3', '0.3', '0.5']);
    expect($(el, '.slwrap .lc-slider')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('off: one full-width Power, disabled at 0.3 without TURN_ON (P3-CHO-4, P3-CHO-9)', async () => {
    const h = fakeHass();
    const off = await h.mount('off');
    expect($(off, '.body')).toBeNull();
    expect($(off, '.modes')!.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
    expect(($(off, '.mode') as HTMLButtonElement).disabled).toBe(false);
    const dead = await h.mount('off_no_turn_on');
    expect(($(dead, '.mode') as HTMLButtonElement).disabled).toBe(true);
    expect($(dead, '.mode')!.style.opacity).toBe('0.3');
  });

  it('buffering: Play/Pause disabled at 0.3, no spinner (P3-CHO-9)', async () => {
    const el = await fakeHass().mount('buffering');
    const play = $(el, ".mode[data-action='play']") as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(play.style.opacity).toBe('0.3');
  });

  it('chips are menu buttons (aria-haspopup menu, aria-expanded)', async () => {
    const el = await fakeHass().mount('tv_sources');
    const chip = $(el, '.chip')!;
    expect([chip.getAttribute('aria-haspopup'), chip.getAttribute('aria-expanded')]).toEqual(['menu', 'false']);
  });

  it('a value not in the list is shown as is', async () => {
    const h = fakeHass();
    h.states[mediaIds.tv_sources] = {
      ...h.states[mediaIds.tv_sources],
      attributes: {
        ...h.states[mediaIds.tv_sources].attributes,
        source: 'AirPlay',
      },
    };
    const el = await h.mount('tv_sources');
    expect(text($(el, '.chip'))).toBe('Source AirPlay');
  });

  it('controls.sources and controls.sound_modes false hide the chips', async () => {
    const h = fakeHass();
    expect($(await h.mount('lounge_room', { controls: { sources: false } }), '.chip')!.dataset.chip).toBe('soundMode');
    expect(
      $$(
        await h.mount('lounge_room', {
          controls: { sources: false, sound_modes: false },
        }),
        '.chip',
      ),
    ).toEqual([]);
  });
});

describe('History (D-10, contract with H3)', () => {
  it('the card-face button opens history directly', async () => {
    const el = await fakeHass().mount('playing');
    const events: string[] = [];
    const on = () => events.push(location.pathname + location.search);
    window.addEventListener('location-changed', on);
    $(el, 'header .history')!.click();
    window.removeEventListener('location-changed', on);
    expect(events).toEqual([`/history?entity_id=${mediaIds.playing}`]);
  });

  it('is hidden inside the sheet (inSheet), the header-action slot stays', async () => {
    const el = await fakeHass().mount('playing');
    expect(el.inSheet).toBe(false);
    el.inSheet = true;
    await el.updateComplete;
    expect($(el, 'header .history')).toBeNull();
    expect($(el, "header slot[name='header-action']")).not.toBeNull();
  });
});

describe('long text (P3-CHO-5, P2-CHO-6)', () => {
  it('title two-line clamp, name and lines one line with ellipsis, word readouts step down', () => {
    const css = mediaCardStyles.cssText;
    expect(css).toMatch(/\.np-title \{[^}]*-webkit-line-clamp: 2/);
    expect(css).toMatch(/\.np-l2,\s*\.np-l3 \{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.big\.fit \{\s*font-size: 44px/);
    expect(css).toMatch(/@container \(max-width: 353px\) \{\s*\.mode \{\s*height: 50px/);
  });

  it('RTL text gets dir=auto', async () => {
    const el = await fakeHass().mount('rtl_title');
    expect($(el, '.np-title')!.getAttribute('dir')).toBe('auto');
  });
});

// ---- Gestures against the writer (GD1, GD3, GD4), call lists as the prototype ----------------------------

/** The fake writer the mounted card holds (WriterRegistry keeps `{ writer, refs }` per entity). */
const writerOf = (id: string) => (mediaWriters as unknown as { writers: Map<string, { writer: FakeWriter }> }).writers.get(id)!.writer;

describe('GD1 and GD2: the volume pill', () => {
  it('a drag holds once, previews each value, ends the hold once (throttle and final write in the writer)', async () => {
    const el = await fakeHass().mount('volume_mid');
    const pill = $(el, '.slwrap .lc-slider')!;
    pointerOn(pill, 'pointerdown', 0, 200);
    for (const y of [190, 180, 170]) pointerOn(pill, 'pointermove', 0, y);
    pointerOn(pill, 'pointerup', 0, 170);
    expect(calls[0]).toBe('holdFor()');
    expect(calls.at(-1)).toBe('endHoldFor()');
    const previews = calls.filter((c) => c.startsWith('setVolume'));
    expect(previews.length).toBe(3);
    expect(calls.filter((c) => c.startsWith('holdFor')).length).toBe(1);
  });

  it('keys: arrows 2 %, PageUp 10 %, Home 0, End 100; one hold per key gesture, ended at keyup', async () => {
    const el = await fakeHass().mount('volume_mid');
    const pill = $(el, '.slwrap .lc-slider')!;
    keyOn(pill, 'keydown', 'ArrowUp');
    keyOn(pill, 'keydown', 'ArrowUp');
    keyOn(pill, 'keydown', 'PageUp');
    keyOn(pill, 'keyup', 'PageUp');
    expect(calls).toEqual(['holdFor()', 'setVolume(37)', 'setVolume(39)', 'setVolume(49)', 'endHoldFor()']);
    calls.length = 0;
    keyOn(pill, 'keydown', 'End');
    keyOn(pill, 'keyup', 'End');
    keyOn(pill, 'keydown', 'Home');
    keyOn(pill, 'keyup', 'Home');
    expect(calls).toEqual(['holdFor()', 'setVolume(100)', 'endHoldFor()', 'holdFor()', 'setVolume(0)', 'endHoldFor()']);
    expect([volumeKeyStep(50, 'ArrowDown'), volumeKeyStep(50, 'PageDown'), volumeKeyStep(50, 'x')]).toEqual([48, 40, undefined]);
  });

  it('steps call step() once per tap; the writer decides the service (P3-CHO-17)', async () => {
    const el = await fakeHass().mount('volume_step');
    $$(el, '.step')[0].click();
    $$(el, '.step')[1].click();
    expect(calls).toEqual(['step(1)', 'step(-1)']);
  });
});

describe('GD3: the seek line', () => {
  it('a drag previews only; one commit at release; the clock sees the drag', async () => {
    const el = await fakeHass().mount('paused');
    const seek = $(el, '.seek .lc-slider')!;
    const clock = (el as unknown as { _clock: { inputs(): { dragging: boolean } } })._clock;
    pointerOn(seek, 'pointerdown', 10, 0);
    pointerOn(seek, 'pointermove', 11, 0);
    pointerOn(seek, 'pointermove', 12, 0);
    await el.updateComplete;
    expect(clock.inputs().dragging).toBe(true);
    expect(calls.some((c) => c.startsWith('seekCommit'))).toBe(false);
    pointerOn(seek, 'pointerup', 12, 0);
    expect(calls.filter((c) => c.startsWith('seekPreview')).length).toBeGreaterThanOrEqual(1);
    expect(calls.filter((c) => c === 'seekCommit()').length).toBe(1);
    expect(calls.some((c) => c.startsWith('holdFor'))).toBe(false);
  });

  it('a pointercancel (the browser took the touch for scrolling) cancels the seek and sends nothing', async () => {
    const el = await fakeHass().mount('paused');
    const seek = $(el, '.seek .lc-slider')!;
    pointerOn(seek, 'pointerdown', 10, 0);
    pointerOn(seek, 'pointermove', 12, 0);
    pointerOn(seek, 'pointercancel', 12, 0);
    await el.updateComplete;
    expect(calls.filter((c) => c.startsWith('seekPreview')).length).toBeGreaterThanOrEqual(1);
    expect(calls.filter((c) => c === 'seekCommit()').length).toBe(0);
    expect(calls.filter((c) => c === 'seekCancel()').length).toBe(1);
    expect(seek.getAttribute('aria-valuenow')).toBe('45');
    // The next gesture is not marked: its pointerup still commits once.
    calls.length = 0;
    pointerOn(seek, 'pointerdown', 10, 0);
    pointerOn(seek, 'pointermove', 12, 0);
    pointerOn(seek, 'pointerup', 12, 0);
    expect(calls.filter((c) => c === 'seekCommit()').length).toBe(1);
    expect(calls.filter((c) => c === 'seekCancel()').length).toBe(0);
  });

  it('a tap without movement changes nothing (relative drag) and cancels', async () => {
    const el = await fakeHass().mount('paused');
    const seek = $(el, '.seek .lc-slider')!;
    pointerOn(seek, 'pointerdown', 10, 0);
    pointerOn(seek, 'pointerup', 10, 0);
    expect(calls).toEqual(['seekCancel()']);
  });

  it('keys: 5 s per arrow, 10 % per page, Home 0, End the duration; one commit per key gesture at keyup', async () => {
    const el = await fakeHass().mount('paused');
    const seek = $(el, '.seek .lc-slider')!;
    const clock = (el as unknown as { _clock: { inputs(): { dragging: boolean } } })._clock;
    keyOn(seek, 'keydown', 'ArrowRight');
    keyOn(seek, 'keydown', 'ArrowRight');
    await el.updateComplete;
    // RH1 L5: a key gesture counts as dragging for the clock.
    expect(clock.inputs().dragging).toBe(true);
    keyOn(seek, 'keydown', 'PageUp');
    expect(calls).toEqual(['seekPreview(50)', 'seekPreview(55)', 'seekPreview(85)']);
    keyOn(seek, 'keyup', 'PageUp');
    expect(calls.at(-1)).toBe('seekCommit()');
    calls.length = 0;
    keyOn(seek, 'keydown', 'End');
    keyOn(seek, 'keyup', 'End');
    expect(calls).toEqual(['seekPreview(300)', 'seekCommit()']);
    expect([seekKeyStep(10, 'ArrowLeft', 300), seekKeyStep(10, 'Home', 300), seekKeyStep(4000, 'PageDown', 12300)]).toEqual([5, 0, 2770]);
  });

  it('read-only (no SEEK, buffering): keys and pointer do nothing', async () => {
    for (const fixture of ['playing', 'buffering'] as MediaFixtureName[]) {
      const el = await fakeHass().mount(fixture);
      const p = $(el, '.seek .lc-slider')!;
      keyOn(p, 'keydown', 'ArrowRight');
      keyOn(p, 'keyup', 'ArrowRight');
      pointerOn(p, 'pointerdown', 10, 0);
      pointerOn(p, 'pointermove', 40, 0);
      pointerOn(p, 'pointerup', 40, 0);
      expect(calls.filter((c) => c.startsWith('seek'))).toEqual([]);
      el.remove();
    }
  });

  it('while dragging the left time shows the target "m:ss of m:ss" (prototype section 2)', async () => {
    const el = await fakeHass().mount('paused');
    const seek = $(el, '.seek .lc-slider')!;
    keyOn(seek, 'keydown', 'ArrowRight');
    await el.updateComplete;
    expect(text($$(el, '.times span')[0])).toBe('0:50 of 5:00');
    expect(text($$(el, '.times span')[1])).toBe('-4:10');
    keyOn(seek, 'keyup', 'ArrowRight');
  });
});

describe('GD4: transport taps', () => {
  it('Play/Pause, Previous, Next, Mute and Power each call the writer once per tap', async () => {
    const el = await fakeHass().mount('seek_live');
    for (const k of ['play', 'previous', 'next', 'mute', 'power']) $(el, `.mode[data-action='${k}']`)!.click();
    expect(calls).toEqual(['playPause()', 'previous()', 'next()', 'mute()', 'power()']);
  });

  it('standby: Play is disabled and a tap sends nothing', async () => {
    const el = await fakeHass().mount('standby');
    const play = $(el, ".mode[data-action='play']") as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    play.click();
    expect(calls).toEqual([]);
  });

  it('buffering: Play/Pause sends nothing', async () => {
    const el = await fakeHass().mount('buffering');
    $(el, ".mode[data-action='play']")!.click();
    expect(calls).toEqual([]);
  });

  it('the optimistic state of the writer flips the button and the subline at once', async () => {
    const h = fakeHass();
    const el = await h.mount('seek_live');
    const w = writerOf(mediaIds.seek_live);
    w.pending = { ...w.pending, state: 'paused' };
    el.requestUpdate();
    await el.updateComplete;
    expect(text($(el, 'header .sub'))).toBe('Paused');
    expect($(el, ".mode[data-action='play']")!.getAttribute('aria-label')).toBe('Play, Seek live');
    w.pending = { ...w.pending, state: null, trackChange: true };
    el.requestUpdate();
    await el.updateComplete;
    expect(text($(el, 'header .sub'))).toBe('Buffering');
    expect(($(el, ".mode[data-action='play']") as HTMLButtonElement).disabled).toBe(true);
    expect($(el, '.seek .lc-slider')!.getAttribute('role')).toBe('progressbar');
  });

  it('the writer error shows as the alert (as the fan card)', async () => {
    const el = await fakeHass().mount('seek_live');
    writerOf(mediaIds.seek_live).error = 'Command failed';
    el.requestUpdate();
    await el.updateComplete;
    expect(text($(el, '.alert'))).toBe('Command failed');
    expect($(el, '.alert')!.getAttribute('role')).toBe('alert');
  });

  it('the on/off-only toggle pill calls power()', async () => {
    const el = await fakeHass().mount('onoff_only');
    const sw = $(el, '.lc-slider')!;
    keyOn(sw, 'keydown', 'Enter');
    expect(calls).toEqual(['power()']);
  });
});

describe('config and registration', () => {
  it('is registered, rejects a non media player, offers a stub config', () => {
    expect(customElements.get(TAGS.media)).toBe(LiquidHomeMediaCard);
    const el = new LiquidHomeMediaCard();
    expect(() => el.setConfig({ entity: 'light.a' })).toThrow();
    expect(() => el.setConfig({ entity: 'media_player.a' })).not.toThrow();
    expect(LiquidHomeMediaCard.getStubConfig(fakeHass().hass)).toEqual({
      type: CARD_TYPES.media,
      entity: mediaIds.kitchen,
      config_version: 1,
    });
  });

  it('a missing entity shows "Entity not found"', async () => {
    const el = await fakeHass().mount('media_player.gone');
    expect(text($(el, '.unavailable'))).toBe('Entity not found: media_player.gone');
  });
});

describe('review RH2 follow-ups', () => {
  it('a seek drag cut off by removing the card cancels the target in the shared writer', async () => {
    const el = await fakeHass().mount('paused');
    const seek = $(el, '.seek .lc-slider')!;
    pointerOn(seek, 'pointerdown', 10, 0);
    pointerOn(seek, 'pointermove', 11, 0);
    expect(calls.some((c) => c.startsWith('seekPreview'))).toBe(true);
    el.parentNode!.removeChild(el);
    expect(calls.filter((c) => c === 'seekCancel()').length).toBe(1);
    expect(calls).not.toContain('seekCommit()');
  });

  it('an on/off-only player in standby is not "On"', async () => {
    const standby = { ...MEDIA_FIXTURES.onoff_only(), state: 'standby' };
    const el = await fakeHass({ extra: [standby] }).mount(standby.entity_id);
    expect(text($(el, '.big'))).toBe('Off');
    expect($(el, '.lc-slider')!.getAttribute('aria-checked')).toBe('false');
  });

  it('the seek line shows only while playing, paused or buffering', async () => {
    const idle = { ...MEDIA_FIXTURES.idle(), attributes: { ...MEDIA_FIXTURES.idle().attributes, media_duration: 245, media_position: 83 } };
    const el = await fakeHass({ extra: [idle] }).mount(idle.entity_id);
    expect($(el, '.seek')).toBeNull();
  });

  it('the time labels are left to right, also on an RTL page', async () => {
    const el = await fakeHass().mount('paused');
    expect($$(el, '.times span').map((x) => x.getAttribute('dir'))).toEqual(['ltr', 'ltr']);
  });

  it('the menu is the core menuStyles: no local menu rules, the core classes in the markup', async () => {
    const { menuStyles, MENU_CHECK } = await import('@decibel95/liquid-core');
    expect(LiquidHomeMediaCard.elementStyles).toContain(menuStyles);
    expect(mediaCardStyles.cssText).not.toMatch(/\.m(panel|group|head|label|check)\b/);
    // The one local rule: RTL rows align to the start (core menuStyles has left), after menuStyles in the cascade.
    expect(mediaCardStyles.cssText).toMatch(/\.mitem\s*\{\s*text-align: start;\s*\}/);
    expect(mediaCardStyles.cssText.match(/\.mitem\s*\{/g)).toHaveLength(1);
    const order = LiquidHomeMediaCard.elementStyles;
    expect(order.indexOf(mediaCardStyles)).toBeGreaterThan(order.indexOf(menuStyles));
    const el = await fakeHass().mount('tv_sources');
    ($(el, '.chip') as HTMLButtonElement).click();
    await el.updateComplete;
    expect($$(el, '.mpanel > .mhead, .mpanel > .mgroup > .mitem > .mlabel, .mitem > svg.mcheck').length).toBe(1 + 5 + 5);
    expect($(el, 'svg.mcheck path')!.getAttribute('d')).toBe(MENU_CHECK);
  });

  it('only word readouts are measured for the fit (no layout per tick for a percent)', async () => {
    expect($(await fakeHass().mount('volume_mid'), '.big')!.hasAttribute('data-word')).toBe(false);
    expect($(await fakeHass().mount('onoff_only'), '.big')!.hasAttribute('data-word')).toBe(true);
  });
});
