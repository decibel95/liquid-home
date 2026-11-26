// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { CLUSTER, DISABLED_OPACITY, ICONS, parseColor, PILL_MODES, rgba } from '@decibel95/liquid-core';
import type { CoverFixtureName } from '../../covers/fixtures';

/**
 * Plan 2.4 render rules on both glasses, aria (plan 2.12) and P2-CHO-6. The header device icon is H3's module; this
 * file pins the call (glyph, state, the neutral colour) through a recording stand-in, so it holds against the H0 stub
 * and the real icon alike.
 */
const iconCalls: unknown[][] = [];
vi.mock('../../../src/cards/shared/header-icon', async () => {
  const { css } = await import('lit');
  return {
    headerIconStyles: css``,
    renderHeaderIcon: (...args: unknown[]) => {
      iconCalls.push(args);
      return html`<span class="hicon-test" data-glyph=${String(args[0])} data-state=${String(args[1])} data-colour=${String(args[2])} aria-hidden="true"></span>`;
    },
  };
});

/** P2-CHO-6 worst-case readout words (Dutch and German, long forms a translator may pick), behind pseudo languages. */
const WORST: Record<string, Record<string, string>> = {
  'xx-de': { 'cover.state.open': 'Offen', 'cover.state.closed': 'Geschlossen', 'cover.state.opening': 'Wird geöffnet', 'cover.state.closing': 'Wird geschlossen' },
  'xx-nl': { 'cover.state.open': 'Open', 'cover.state.closed': 'Gesloten', 'cover.state.opening': 'Wordt geopend', 'cover.state.closing': 'Wordt gesloten' },
};
vi.mock('../../../src/i18n', async (orig) => {
  const real = (await orig()) as typeof import('../../../src/i18n');
  return {
    ...real,
    t: (hass: { language?: string } | null | undefined, key: string, vars?: Record<string, string | number>) =>
      WORST[hass?.language ?? '']?.[key] ?? real.t(hass, key, vars),
  };
});

const { $, $$, coverHarness, ids, pill, text } = await import('./helpers');
const { coverCardStyles } = await import('../../../src/cards/cover/styles');

afterEach(() => {
  document.body.innerHTML = '';
  iconCalls.length = 0;
  vi.restoreAllMocks();
});

const rgbOf = (c: string) => parseColor(c).slice(0, 3).join(',');
/** happy-dom keeps a style property Lit's styleMap clears with null as the text "null"; a browser drops it. */
const css = (v: string) => (v === 'null' ? '' : v);
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' } as const;

interface Expect {
  fixture: CoverFixtureName;
  tilt?: boolean;
  readout: string;
  what: string;
  sub: string;
  role: 'slider' | 'switch';
  label: string;
  /** aria-valuenow (slider) or aria-checked (switch). */
  value: string;
  valuetext?: string;
  available: boolean;
  modes: string[];
  /** Visible row buttons with their state: label, d (disabled) or a (active Stop). */
  row: string[];
  glyph: 'blinds' | 'door';
  icon: 'active' | 'inactive' | 'unavailable';
  fill: number;
}

const CASES: Record<string, Expect> = {
  position: { fixture: 'hall', readout: '10%', what: 'Position', sub: 'Open', role: 'slider', label: 'Position, Hall Window', value: '10', valuetext: '10%', available: true, modes: [], row: ['Open', 'Stop', 'Close'], glyph: 'blinds', icon: 'active', fill: 10 },
  tiltOnly: { fixture: 'pergola', readout: '60%', what: 'Tilt', sub: 'Closed', role: 'slider', label: 'Tilt, Pergola Roof', value: '60', available: true, modes: [], row: ['Open tilt', 'Stop tilt', 'Close tilt'], glyph: 'blinds', icon: 'inactive', fill: 60 },
  positionTiltPosition: { fixture: 'living', readout: '70%', what: 'Position', sub: 'Open', role: 'slider', label: 'Position, Living Room Window', value: '70', available: true, modes: ['Position*', 'Tilt'], row: ['Open', 'Stop', 'Close'], glyph: 'blinds', icon: 'active', fill: 70 },
  positionTiltTilt: { fixture: 'living', tilt: true, readout: '50%', what: 'Tilt', sub: 'Open', role: 'slider', label: 'Tilt, Living Room Window', value: '50', available: true, modes: ['Position', 'Tilt*'], row: ['Open tilt', 'Stop tilt', 'Close tilt'], glyph: 'blinds', icon: 'active', fill: 50 },
  toggleOpen: { fixture: 'kitchenOpen', readout: 'Open', what: 'Tap to switch', sub: 'Open', role: 'switch', label: 'Kitchen Window', value: 'true', available: true, modes: [], row: ['Open d', 'Stop', 'Close'], glyph: 'blinds', icon: 'active', fill: 100 },
  toggleClosed: { fixture: 'kitchen', readout: 'Closed', what: 'Tap to switch', sub: 'Closed', role: 'switch', label: 'Kitchen Window', value: 'false', available: true, modes: [], row: ['Open', 'Stop', 'Close d'], glyph: 'blinds', icon: 'inactive', fill: 0 },
  // P2-CHO-4: full while moving, Stop active.
  toggleOpening: { fixture: 'kitchenOpening', readout: 'Opening', what: 'Tap to switch', sub: 'Opening', role: 'switch', label: 'Kitchen Window', value: 'true', available: true, modes: [], row: ['Open d', 'Stop a', 'Close'], glyph: 'blinds', icon: 'active', fill: 100 },
  toggleClosing: { fixture: 'kitchenClosing', readout: 'Closing', what: 'Tap to switch', sub: 'Closing', role: 'switch', label: 'Kitchen Window', value: 'true', available: true, modes: [], row: ['Open', 'Stop a', 'Close d'], glyph: 'blinds', icon: 'active', fill: 100 },
  // Q3 b: no row on the garage; P2-CHO-7: the door glyph.
  garage: { fixture: 'garage', readout: 'Closed', what: 'Tap to switch', sub: 'Closed', role: 'switch', label: 'Garage Door', value: 'false', available: true, modes: [], row: [], glyph: 'door', icon: 'inactive', fill: 0 },
  garageOpen: { fixture: 'garageOpen', readout: 'Open', what: 'Tap to switch', sub: 'Open', role: 'switch', label: 'Garage Door', value: 'true', available: true, modes: [], row: [], glyph: 'door', icon: 'active', fill: 100 },
  // P2-CHO-11.
  unavailable: { fixture: 'unavailable', readout: '--', what: 'Position', sub: 'Unavailable', role: 'slider', label: 'Position, Hall Window', value: '0', valuetext: 'Unavailable', available: false, modes: [], row: ['Open d', 'Stop d', 'Close d'], glyph: 'blinds', icon: 'unavailable', fill: 0 },
  longName: { fixture: 'longName', readout: '40%', what: 'Position', sub: 'Open', role: 'slider', label: 'Position, Upstairs Guest Bathroom Skylight Window Blind', value: '40', available: true, modes: [], row: ['Open', 'Stop', 'Close'], glyph: 'blinds', icon: 'active', fill: 40 },
  opening: { fixture: 'hallOpening', readout: '40%', what: 'Position', sub: 'Opening', role: 'slider', label: 'Position, Hall Window', value: '40', available: true, modes: [], row: ['Open d', 'Stop a', 'Close'], glyph: 'blinds', icon: 'active', fill: 40 },
  closedAt0: { fixture: 'hallClosed', readout: '0%', what: 'Position', sub: 'Closed', role: 'slider', label: 'Position, Hall Window', value: '0', valuetext: '0%', available: true, modes: [], row: ['Open', 'Stop', 'Close d'], glyph: 'blinds', icon: 'inactive', fill: 0 },
};

describe.each(['dark', 'light'] as const)('every fixture state on %s glass (plan 2.4)', (glass) => {
  it.each(Object.keys(CASES))('%s', async (name) => {
    const c = CASES[name];
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids[c.fixture], { look: { glass } });
    if (c.tilt) {
      $(el, '[data-mode="tilt"]')!.click();
      await el.updateComplete;
    }
    const card = $(el, 'section.lc')!;
    expect(card.classList.contains(`g-${glass}`)).toBe(true);
    expect($$(el, '.lc').length).toBe(1);

    // Header (P2-CHO-1): device icon, name and subline only, no power button.
    expect($(el, 'button.power')).toBeNull();
    const icon = $(el, 'header > .hicon-test')!;
    expect(icon).toBe($(el, 'header')!.firstElementChild);
    expect(icon.nextElementSibling!.classList.contains('titles')).toBe(true);
    expect([icon.dataset.glyph, icon.dataset.state, icon.dataset.colour]).toEqual([c.glyph, c.icon, NEUTRAL[glass]]);
    expect(text($(el, 'header .sub'))).toBe(c.sub);

    expect(text($(el, '.ro-v'))).toBe(c.readout);
    expect(text($(el, '.ro .sub'))).toBe(c.what);

    const p = pill(el);
    expect(p.getAttribute('role')).toBe(c.role);
    expect(p.getAttribute('aria-label')).toBe(c.label);
    expect(p.getAttribute(c.role === 'switch' ? 'aria-checked' : 'aria-valuenow')).toBe(c.value);
    if (c.valuetext) expect(p.getAttribute('aria-valuetext')).toBe(c.valuetext);
    expect(p.getAttribute('aria-disabled')).toBe(String(!c.available));
    const f = $(el, '.lc-slider-fill')!;
    expect(parseFloat(f.style.height)).toBe(c.fill);
    // P2-COL-1: the fan_only neutral only.
    expect(rgbOf(f.style.backgroundColor)).toBe(rgbOf(NEUTRAL[glass]));

    const modes = $$(el, '[data-mode]');
    expect(modes.map((b) => text(b) + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''))).toEqual(c.modes);
    const row = $$(el, '[data-action]') as HTMLButtonElement[];
    expect(row.map((b) => text(b) + (b.disabled ? ' d' : '') + (css(b.style.borderColor) ? ' a' : ''))).toEqual(c.row);
    for (const b of row) {
      // No aria-pressed on actions; label equals the visible text (WCAG 2.5.3).
      expect(b.hasAttribute('aria-pressed')).toBe(false);
      expect(b.getAttribute('aria-label')).toBe(text(b));
      expect(css(b.style.opacity)).toBe(b.disabled ? String(DISABLED_OPACITY) : '');
    }
  });
});

describe('details', () => {
  it('icons: Open chevronUp, Stop stop, Close chevronDown; Position swingV, Tilt moveDiagonal', async () => {
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.living);
    const d = (sel: string) => $(el, `${sel} path`)!.getAttribute('d');
    expect([d('[data-action="open"]'), d('[data-action="stop"]'), d('[data-action="close"]')]).toEqual([ICONS.chevronUp, ICONS.stop, ICONS.chevronDown]);
    expect([d('[data-mode="position"]'), d('[data-mode="tilt"]')]).toEqual([ICONS.swingV, ICONS.moveDiagonal]);
  });

  it('active Stop and the selected mode use the TOK-22 tint of the neutral', async () => {
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.hallOpening, { look: { glass: 'dark' } });
    const stop = $(el, '[data-action="stop"]')!;
    expect(rgbOf(stop.style.background)).toBe(rgbOf(rgba(NEUTRAL.dark, PILL_MODES.tint.fill)));
    expect(rgbOf(stop.style.borderColor)).toBe(rgbOf(rgba(NEUTRAL.dark, PILL_MODES.tint.edge)));
    const lr = await h.mount(ids.living, { look: { glass: 'light' } });
    expect(rgbOf($(lr, '[data-mode="position"]')!.style.background)).toBe(rgbOf(rgba(NEUTRAL.light, PILL_MODES.tint.fill)));
  });

  it('the mode is per card and not stored; unavailable disables the mode buttons at 0.3', async () => {
    const h = coverHarness({ echoMs: null });
    const a = await h.mount(ids.living);
    a.setPillMode('tilt');
    await a.updateComplete;
    const b = await h.mount(ids.living);
    expect(pill(a).getAttribute('aria-label')).toBe('Tilt, Living Room Window');
    expect(pill(b).getAttribute('aria-label')).toBe('Position, Living Room Window');
    h.set(ids.living, 'unavailable');
    await a.updateComplete;
    expect(($$(a, '[data-mode]') as HTMLButtonElement[]).map((m) => [m.disabled, m.style.opacity])).toEqual([
      [true, '0.3'],
      [true, '0.3'],
    ]);
  });

  it('no row at all on a cover with no action bits (1024); toggle pill disabled', async () => {
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.unknownBits);
    expect($(el, '.row')).toBeNull();
    expect(pill(el).getAttribute('aria-disabled')).toBe('true');
  });

  it('assumed_state never disables Open or Close', async () => {
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.assumed);
    expect(($$(el, '[data-action]') as HTMLButtonElement[]).map((b) => b.disabled)).toEqual([false, false, false]);
  });

  it('a missing entity shows the name and a message', async () => {
    const h = coverHarness({ echoMs: null });
    const el = await h.mount('cover.nope');
    expect(text($(el, '.unavailable'))).toBe('Entity not found: cover.nope');
  });

  it('is defined under its tag; config defaults (plan section 4) and checked options', async () => {
    const { CARD_TYPES, TAGS } = await import('../../../src/const');
    const { defaultConfig, normalizeConfig, pruneConfig } = await import('../../../src/cards/cover');
    expect(customElements.get(TAGS.cover)).toBeDefined();
    const cfg = normalizeConfig({ type: CARD_TYPES.cover, entity: 'cover.a' });
    expect([cfg.write_hold, cfg.config_version, cfg.look.glass]).toEqual([defaultConfig.write_hold, 1, 'theme']);
    expect(normalizeConfig({ entity: 'cover.a', write_hold: '3' }).write_hold).toBe(3);
    expect(normalizeConfig({ entity: 'cover.a', write_hold: -1 }).write_hold).toBe(10);
    expect(normalizeConfig({ entity: 'cover.a', look: { glass: 'pink', motion: 'x' } }).look).toMatchObject({ glass: 'theme', motion: 'rich' });
    expect(pruneConfig({ type: CARD_TYPES.cover, entity: 'cover.a', write_hold: 10 })).toEqual({ type: CARD_TYPES.cover, entity: 'cover.a' });
  });

  it('rejects another domain', async () => {
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.hall);
    expect(() => el.setConfig({ entity: 'light.a' })).toThrow();
  });

  it('a long name ellipsizes beside the icon (h2 nowrap, hidden, ellipsis)', () => {
    const rules = coverCardStyles.cssText.replace(/\s+/g, ' ');
    expect(rules).toMatch(/h2 \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
  });
});

describe('P2-CHO-6: a word that does not fit at 18cqw steps down to the 44px cluster value, then ellipsizes', () => {
  it('the readout CSS: no wrap, clipped with an ellipsis, c44 at CLUSTER.value.wide', () => {
    const rules = coverCardStyles.cssText.replace(/\s+/g, ' ');
    expect(rules).toMatch(/\.big \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
    expect(rules).toContain(`.big.c44 { font-size: ${CLUSTER.value.wide}px; }`);
    expect(CLUSTER.value.wide).toBe(44);
  });

  /**
   * Layout model from real Chromium (Playwright on the dev harness, Liquid Inter 200, a 444px card): the readout gets
   * 266px beside the pill, and each word is this wide at 18cqw (71.64px) and at 44px. happy-dom has no layout, so the
   * card's own fit check runs against these widths.
   */
  const BOX = 266;
  const WIDTH: Record<string, [number, number]> = {
    Open: [167, 103], Closed: [211, 132], Opening: [257, 160], Closing: [224, 142],
    Offen: [165, 101], Geschlossen: [389, 245], 'Wird geöffnet': [401, 249], 'Wird geschlossen': [532, 334],
    Gesloten: [266, 166], 'Wordt geopend': [464, 291], 'Wordt gesloten': [449, 282],
  };
  const widthOf = (el: HTMLElement) => {
    const w = WIDTH[(el.textContent ?? '').trim()];
    return w ? w[el.classList.contains('c44') ? 1 : 0] : 0;
  };
  const model = () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('big') ? Math.min(BOX, widthOf(this)) : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('big') ? widthOf(this) : 0;
    });
  };
  const fitOf = (el: HTMLElement) => {
    const big = $(el, '.big')!;
    if (!big.classList.contains('c44')) return 'fits';
    return widthOf(big) > BOX + 1 ? 'ellipsis' : 'c44';
  };

  it.each([
    ['en', 'kitchen', 'fits'],
    ['en', 'kitchenOpening', 'fits'],
    ['en', 'kitchenClosing', 'fits'],
    ['xx-de', 'kitchenOpen', 'fits'],
    ['xx-de', 'kitchen', 'c44'],
    ['xx-de', 'kitchenOpening', 'c44'],
    ['xx-de', 'kitchenClosing', 'ellipsis'],
    ['xx-nl', 'kitchen', 'fits'],
    ['xx-nl', 'kitchenOpening', 'ellipsis'],
    ['xx-nl', 'kitchenClosing', 'ellipsis'],
  ] as const)('%s %s: %s', async (lang, fixture, expected) => {
    model();
    const h = coverHarness({ echoMs: null, language: lang });
    const el = await h.mount(ids[fixture]);
    el.requestUpdate();
    await el.updateComplete;
    expect(fitOf(el)).toBe(expected);
  });

  it('the class is taken off again when the word fits (state change back)', async () => {
    model();
    const h = coverHarness({ echoMs: null, language: 'xx-de' });
    const el = await h.mount(ids.kitchenClosing);
    expect($(el, '.big')!.classList.contains('c44')).toBe(true);
    h.set(ids.kitchenClosing, 'open');
    await el.updateComplete;
    expect(text($(el, '.big'))).toBe('Offen');
    expect($(el, '.big')!.classList.contains('c44')).toBe(false);
  });
});

describe('P2-CHO-6 fit check runs only when needed (RH1 4)', () => {
  let box = 266;
  let reads = 0;
  const WIDE: Record<string, [number, number]> = { Open: [167, 103], Closed: [211, 132], Opening: [257, 160] };
  const widthOf = (el: HTMLElement) => {
    const w = WIDE[(el.textContent ?? '').trim()];
    return w ? w[el.classList.contains('c44') ? 1 : 0] : 120;
  };
  const model = () => {
    box = 266;
    reads = 0;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('big') ? Math.min(box, widthOf(this)) : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('big')) reads++;
      return this.classList.contains('big') ? widthOf(this) : 0;
    });
  };

  it('a percent readout is never measured, also not during a drag', async () => {
    model();
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.hall);
    const { pointer } = await import('./helpers');
    pointer(el, 'pointerdown', 500);
    for (let i = 1; i <= 5; i++) {
      pointer(el, 'pointermove', 500 - i * 10);
      await el.updateComplete;
    }
    pointer(el, 'pointerup', 450);
    await el.updateComplete;
    expect(reads).toBe(0);
    expect($(el, '.big')!.hasAttribute('data-word')).toBe(false);
  });

  it('a word is measured once, not again on a render with the same word', async () => {
    model();
    const h = coverHarness({ echoMs: null });
    const el = await h.mount(ids.kitchen);
    const first = reads;
    expect(first).toBeGreaterThan(0);
    el.requestUpdate();
    await el.updateComplete;
    h.publish();
    await el.updateComplete;
    expect(reads).toBe(first);
    h.set(ids.kitchen, 'opening');
    await el.updateComplete;
    expect(reads).toBeGreaterThan(first);
  });

  it('a resize of the card body re-checks the word', async () => {
    model();
    const callbacks: (() => void)[] = [];
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
        unobserve() {}
      },
    );
    try {
      const h = coverHarness({ echoMs: null });
      const el = await h.mount(ids.kitchen);
      expect(observed).toEqual([$(el, '.body')]);
      expect($(el, '.big')!.classList.contains('c44')).toBe(false);
      box = 180; // the card got narrower: "Closed" (211) no longer fits, 132 at 44px does
      callbacks[0]();
      expect($(el, '.big')!.classList.contains('c44')).toBe(true);
      box = 266;
      callbacks[0]();
      expect($(el, '.big')!.classList.contains('c44')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the word is checked again once the fonts are ready', async () => {
    model();
    let ready!: () => void;
    const fonts = { ready: new Promise<void>((r) => (ready = r)) };
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const h = coverHarness({ echoMs: null });
      const el = await h.mount(ids.kitchen);
      expect($(el, '.big')!.classList.contains('c44')).toBe(false);
      box = 180; // the loaded font is wider than the fallback was
      ready();
      await fonts.ready;
      await Promise.resolve();
      expect($(el, '.big')!.classList.contains('c44')).toBe(true);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});

describe('resize observer lifecycle (RH1 round 2)', () => {
  it('disconnect stops observing; reconnecting observes the body again', async () => {
    const log: string[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {
          log.push('observe');
        }
        disconnect() {
          log.push('disconnect');
        }
        unobserve() {}
      },
    );
    try {
      const h = coverHarness({ echoMs: null });
      const el = await h.mount(ids.kitchen);
      expect(log).toEqual(['observe']);
      el.remove();
      expect(log).toEqual(['observe', 'disconnect']);
      document.body.append(el);
      await el.updateComplete;
      expect(log).toEqual(['observe', 'disconnect', 'disconnect', 'observe']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
