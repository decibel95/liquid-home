// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { FOCUS, focusRing } from '@decibel95/liquid-core';
import '../../../src/cards/tile';
import '../../../src/cards/badge';
import { badgeChrome as badgeStyles, tileChrome as tileStyles } from '@decibel95/liquid-core';
import LC from './lc-0.11.1-style.json';
import { $, cssAtRules, cssRules, fakeHass, type AnyEl } from './helpers';

/**
 * Tile and badge parity with Liquid Climate 0.11.1 (rendered parity: sizes, radius
 * and fonts equal). The reference is a recorded fixture of the Liquid Climate styles (lc-0.11.1-style.json, taken once
 * from commit 373b340, read-only). Two checks: every Liquid Climate rule is declared here with identical values, and
 * the rendered elements compute the same sizes, radius and fonts.
 */

type Rules = Record<string, Record<string, string | number>>;
const lcTile = LC.tile as Rules;
const lcBadge = LC.badge as Rules;

/** Liquid Climate rules Liquid Home does not carry, each with its reason. */
const NOT_CARRIED = {
  tile: {
    '.target.range': 'setpoint range pill: climate dual setpoints only',
    '.flick': 'heating flame flicker: climate only',
    'button:focus-visible': 'core focusRing (TOK-19), same 2px lc-bright ring at offset 2px (checked below)',
  },
  badge: {
    '.g-dark': 'ring around the attention dot: no light state asks for attention in 0.1',
    '.g-light': 'ring around the attention dot',
    '.dot': 'attention dot (error, paused, low battery): not a light state',
    '.m-minimal .dot': 'attention dot animation',
    'button.badge:focus-visible': 'core focusRing (TOK-19), same 2px lc-bright ring at offset 2px (checked below)',
  },
} as const;

const strip = ({ line: _line, ...decl }: Record<string, string | number>) => decl;

function declaredParity(lc: Rules, mine: Record<string, Record<string, string>>, skip: Record<string, string>) {
  for (const [sel, decl] of Object.entries(lc)) {
    if (sel in skip) {
      expect(mine[sel], `${sel} should not be carried`).toBeUndefined();
      continue;
    }
    expect(mine[sel], `rule ${sel} (Liquid Climate line ${decl.line})`).toEqual(strip(decl));
  }
  // Nothing of our own beyond Liquid Climate's rules.
  for (const sel of Object.keys(mine)) expect(Object.keys(lc), `extra rule ${sel}`).toContain(sel);
}

describe('declared styles equal Liquid Climate 0.11.1', () => {
  it('tile', () => declaredParity(lcTile, cssRules(tileStyles.cssText), NOT_CARRIED.tile));
  it('badge', () => declaredParity(lcBadge, cssRules(badgeStyles.cssText), NOT_CARRIED.badge));

  it('at-rules: the reduced-motion rule of the tile, nothing climate-only', () => {
    const lcAt = LC.atRules as Record<'tile' | 'badge', Record<string, Record<string, Record<string, string>>>>;
    const RM = '@media (prefers-reduced-motion: reduce)';
    // Tile: .press loses its transition under reduced motion, exactly as Liquid Climate; .flick and its keyframes are climate only.
    const tile = cssAtRules(tileStyles.cssText);
    expect(Object.keys(tile)).toEqual([RM]);
    expect(tile[RM]).toEqual({ '.press': lcAt.tile[RM]['.press'] });
    expect(lcAt.tile[RM]['.press']).toEqual({ transition: 'none' });
    expect(Object.keys(lcAt.tile[RM]).sort()).toEqual(['.flick', '.press']);
    expect(Object.keys(lcAt.tile).sort()).toEqual(['@keyframes lcFlick', RM]);
    // Badge: Liquid Climate's at-rules only animate the attention dot, which lights do not have.
    expect(cssAtRules(badgeStyles.cssText)).toEqual({});
    expect(Object.keys(lcAt.badge).sort()).toEqual(['@keyframes lcDot', RM]);
    expect(Object.keys(lcAt.badge[RM])).toEqual(['.dot']);
  });

  it('the focus ring Liquid Climate declares per card is core focusRing with the same values', () => {
    const ring = cssRules(focusRing.cssText);
    const sel = Object.keys(ring).find((s) => s.split(',').map((x) => x.trim()).includes('button:focus-visible'))!;
    expect(ring[sel]).toEqual({ outline: `${FOCUS.width}px solid var(--lc-bright)`, 'outline-offset': `${FOCUS.offset}px` });
    expect(ring[sel]).toEqual(strip(lcTile['button:focus-visible']));
    expect(ring[sel]).toEqual(strip(lcBadge['button.badge:focus-visible']));
  });
});

/** A Liquid Climate value with every var() replaced by its fallback, as it computes without theme variables. */
function fallback(v: string): string {
  let out = v;
  for (let i = 0; i < 5 && out.includes('var('); i++) out = out.replace(/var\(--[\w-]+,\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g, '$1');
  return out.trim();
}

const norm = (v: string) => v.replace(/["']/g, '').replace(/\s+/g, ' ').trim();

async function render(tag: string, entity: string, cfg: Record<string, unknown> = {}) {
  const el = document.createElement(tag) as AnyEl;
  el.setConfig({ entity, look: { glass: 'dark' }, ...cfg });
  el.hass = fakeHass().hass;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

/** Sizes, radius and fonts: [selector, properties] compared computed (here) against the Liquid Climate fixture. */
const TILE_COMPUTED: [string, string[]][] = [
  ['.tile', ['height', 'padding-left', 'padding-right', 'gap', 'border-radius', 'font-family', 'border-top-width']],
  ['.power', ['width', 'height', 'border-radius']],
  ['.body', ['gap', 'border-radius']],
  ['.name', ['font-size', 'font-weight']],
  ['.sub', ['font-size']],
  ['.steps', ['gap']],
  ['.step', ['width', 'height', 'border-radius']],
  ['.target', ['width', 'font-size', 'font-weight']],
];
const BADGE_COMPUTED: [string, string[]][] = [
  ['.badge', ['height', 'min-width', 'font-family', 'border-top-width']],
  ['.ic svg', ['width', 'height']],
  ['.pill', ['padding-left', 'padding-right']],
  ['.n', ['font-size', 'font-weight', 'line-height', 'letter-spacing']],
  ['.v', ['font-size', 'font-weight', 'line-height', 'letter-spacing']],
];

/** The Liquid Climate value of a longhand, from the fixture (shorthands expanded where the fixture uses one). */
function lcValue(rules: Rules, sel: string, prop: string): string {
  const d = rules[sel];
  // A rule's own custom property (the badge's --_size) stands in for var(--name) without a fallback.
  const own = (v: string) => v.replace(/var\((--[\w-]+)\)/g, (m, name: string) => (name in d ? String(d[name]) : m));
  if (prop in d) return fallback(own(String(d[prop])));
  if (prop.startsWith('padding-') && d.padding) {
    const p = String(d.padding).split(' ');
    const [t, r = t, b = t, l = r] = p;
    return { 'padding-top': t, 'padding-right': r, 'padding-bottom': b, 'padding-left': l }[prop]!;
  }
  if (prop === 'border-top-width' && d.border) return String(d.border).split(' ')[0];
  throw new Error(`no Liquid Climate value for ${sel} ${prop}`);
}

describe('rendered sizes, radius and fonts equal Liquid Climate 0.11.1', () => {
  it('tile (an on light, so every part renders)', async () => {
    const tile = await render('liquid-home-tile', 'light.kitchen_lights');
    const rows: string[] = [];
    for (const [sel, props] of TILE_COMPUTED) {
      const cs = getComputedStyle($(tile, sel)!);
      for (const p of props) {
        const want = lcValue(lcTile, sel, p);
        rows.push(`${sel} ${p}: ${cs.getPropertyValue(p)} / ${want}`);
        expect(norm(cs.getPropertyValue(p)), `${sel} ${p}`).toBe(norm(want));
      }
    }
    expect(rows.length).toBeGreaterThan(15);
  });

  it('tile honours --lc-radius and --lc-blur like Liquid Climate (D-3)', async () => {
    const tile = await render('liquid-home-tile', 'light.kitchen_lights');
    tile.style.setProperty('--lc-radius', '12px');
    expect(getComputedStyle($(tile, '.tile')!).borderRadius).toBe('12px');
    expect(String(lcTile['.tile']['border-radius'])).toBe('var(--lc-radius, 26px)');
    expect(cssRules(tileStyles.cssText)['.tile']['backdrop-filter']).toBe(lcTile['.tile']['backdrop-filter']);
  });

  it('badge (pill)', async () => {
    const badge = await render('liquid-home-badge', 'light.kitchen_lights');
    for (const [sel, props] of BADGE_COMPUTED) {
      const cs = getComputedStyle($(badge, sel)!);
      for (const p of props) expect(norm(cs.getPropertyValue(p)), `${sel} ${p}`).toBe(norm(lcValue(lcBadge, sel, p)));
    }
  });
});
