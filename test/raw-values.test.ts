import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Plan 3.3, "Liquid Home has no raw style values": anywhere in src/, outside the allowlist below, no hex colour, no
 * colour function literal (rgb, rgba, hsl, hsla in any case, oklch, oklab, lch, lab, hwb, color-mix), and no length
 * (px, rem, em) for a radius (any longhand, camelCase too), a font size or the font shorthand, a blur, a shadow or a
 * custom property, also as a var() or calc() fallback; and no `${expression}px` unless the expression reads a
 * liquid-core token (DIAL., TILE., BADGE., CLUSTER., CLUSTER_ICON., SLIDER., READOUT., PILL_MODES., FOCUS.) or the
 * card's look.blur, and no length in a drop-shadow() filter. The editors (src/editor/) are scanned like the cards. Every
 * visual value comes from liquid-core.
 */

const SRC = join(__dirname, '../src');

/**
 * The single allowlist: file (relative to src/), the exact matched text (whitespace folded), how often it occurs and
 * why it may stay. A literal inside another finding (a colour inside a shadow) counts once, as the outer finding.
 * Empty today: the card chrome (dial, tile, badge, cluster) and every size the cards draw come from liquid-core.
 */
const ALLOW: { file: string; text: string; count: number; why: string }[] = [];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|css|json)$/.test(n) ? [p] : [];
  });
}

/** Source without comments, with whitespace runs folded, so a declaration split over lines matches as one. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/** A length literal: px, rem or em. */
const LEN = String.raw`\d+(?:\.\d+)?(?:px|rem|em)\b`;
/**
 * A declaration of one of `props` (CSS, or a quoted or camelCase style object key) whose value holds a length literal
 * anywhere, a var() or calc() fallback included. The value runs to the next ; { or } (an interpolation ends it).
 */
const decl = (props: string) => new RegExp(String.raw`(?<![\w-])(?:${props})['"]?\s*:\s*[^;{}]*?${LEN}[^;{}]*`, 'g');
/** A colour function with one level of nested parentheses. */
const fn = (names: string, first = '') => new RegExp(String.raw`\b(?:${names})\(${first}(?:[^()]|\([^()]*\))*\)`, 'gi');

/** A function argument with balanced nesting, two levels deep (`blur(var(--a, var(--b, 4px)))`). */
const ARG = String.raw`(?:[^()]|\((?:[^()]|\([^()]*\))*\))*`;
const hasLen = (m: RegExpMatchArray) => new RegExp(LEN).test(m[0]);

/** An interpolated length may only read a liquid-core token or the card's look.blur. */
/** Case-sensitive on purpose: `dial.gap` or `Tile.size` is a local name, not a liquid-core token namespace. */
const TOKEN_EXPR = /\b(?:DIAL|TILE|BADGE|CLUSTER|CLUSTER_ICON|SLIDER|READOUT|PILL_MODES|FOCUS|MENU)\.|\blook\??\.blur\b/;

const RULES: { name: string; re: RegExp; keep?: (m: RegExpMatchArray) => boolean }[] = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/g },
  // A literal starts with a number; core's rgba(colour, alpha) helper starts with a name and is not a literal.
  { name: 'rgb/hsl literal', re: fn('rgba?|hsla?', String.raw`\s*[\d.]`) },
  { name: 'colour function', re: fn('oklch|oklab|lch|lab|hwb|color-mix') },
  { name: 'radius length', re: decl(String.raw`border(?:-[a-z]+)*-radius|border[A-Za-z]*Radius`) },
  { name: 'font length', re: decl(String.raw`font(?:-size)?|fontSize`) },
  { name: 'blur length', re: new RegExp(String.raw`(?<!\w)blur\(${ARG}\)`, 'g'), keep: hasLen },
  // A drop-shadow filter is a shadow too: its offsets and blur radius are lengths (`filter: drop-shadow(0 2px 4px ...)`).
  { name: 'drop-shadow length', re: new RegExp(String.raw`drop-shadow\(${ARG}\)`, 'g'), keep: hasLen },
  { name: 'shadow length', re: decl(String.raw`box-shadow|boxShadow|text-shadow|textShadow`) },
  { name: 'custom property length', re: new RegExp(String.raw`--[\w-]+['"]?\s*:\s*[^;{}]*?${LEN}[^;{}]*`, 'g') },
  { name: 'interpolated length', re: /\$\{([^{}]*)\}(?:px|rem|em)\b/g, keep: (m) => !TOKEN_EXPR.test(m[1]) },
];

interface Finding {
  file: string;
  rule: string;
  text: string;
  at: number;
  end: number;
}

/** Every finding in a source; a finding inside another one's span is left out (it is part of that finding). */
function scan(file: string, src: string): Finding[] {
  const all: Finding[] = [];
  for (const r of RULES) {
    for (const m of src.matchAll(r.re)) if (!r.keep || r.keep(m)) all.push({ file, rule: r.name, text: m[0].trim(), at: m.index!, end: m.index! + m[0].length });
  }
  return all.filter((f) => !all.some((g) => g !== f && g.at <= f.at && g.end >= f.end && g.end - g.at > f.end - f.at)).sort((f, g) => f.at - g.at);
}

const tally = (list: { file: string; text: string }[]) => {
  const out = new Map<string, number>();
  for (const f of list) out.set(`${f.file} | ${f.text}`, (out.get(`${f.file} | ${f.text}`) ?? 0) + 1);
  return Object.fromEntries([...out].sort());
};

describe('no raw style values in src/ (plan 3.3)', () => {
  const all = files(SRC);
  const found = all.flatMap((path) => scan(relative(SRC, path).split('\\').join('/'), code(readFileSync(path, 'utf8'))));

  it('scans every card, the sheet, the editors and the shared modules', () => {
    const scanned = all.map((p) => relative(SRC, p).split('\\').join('/'));
    for (const f of ['cards/light/card.ts', 'cards/light/styles.ts', 'cards/tile/liquid-home-tile.ts', 'cards/badge/liquid-home-badge.ts', 'cards/room/liquid-home-room.ts', 'cards/room/styles.ts', 'cards/sheet/liquid-home-sheet.ts', 'lights/model.ts', 'lights/writer.ts', 'index.ts', 'register.ts', 'editor/base.ts', 'editor/light.ts', 'editor/tile.ts', 'editor/badge.ts', 'editor/room.ts']) {
      expect(scanned).toContain(f);
    }
  });

  it('finds exactly the allowlisted literals, each as often as listed', () => {
    expect(tally(found)).toEqual(Object.fromEntries(ALLOW.map((a) => [`${a.file} | ${a.text}`, a.count]).sort()));
  });

  /** The rule names a sample is flagged for, in order. */
  const rules = (src: string) => scan('x', code(src)).map((f) => f.rule);

  it('the scanner sees what it should (self check)', () => {
    const sample = code(
      'a { color: #fff; background: rgba(0,0,0,.1); border-radius: 12px; font-size: 9px; filter: blur(4px); box-shadow: 0 1px 2px red } x = rgba(colour, 0.28) // #abc',
    );
    expect(scan('x', sample).map((f) => [f.rule, f.text])).toEqual([
      ['hex colour', '#fff'],
      ['rgb/hsl literal', 'rgba(0,0,0,.1)'],
      ['radius length', 'border-radius: 12px'],
      ['font length', 'font-size: 9px'],
      ['blur length', 'blur(4px)'],
      ['shadow length', 'box-shadow: 0 1px 2px red'],
    ]);
    // A colour inside a shadow is one finding: the shadow.
    expect(rules('b { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) }')).toEqual(['shadow length']);
  });

  it('colour functions: nested parentheses, any case, modern functions (self check)', () => {
    expect(scan('x', code('c { background: rgba(0,0,0,var(--x)); color: hsl(10 20% 30% / var(--a, 1)) }')).map((f) => f.text)).toEqual([
      'rgba(0,0,0,var(--x))',
      'hsl(10 20% 30% / var(--a, 1))',
    ]);
    expect(rules('c { color: RGB(1, 2, 3) }')).toEqual(['rgb/hsl literal']);
    expect(rules('c { color: Hsla(1 2% 3% / 0.5) }')).toEqual(['rgb/hsl literal']);
    expect(rules('c { color: oklch(0.7 0.1 30) }')).toEqual(['colour function']);
    expect(rules('c { color: color-mix(in srgb, var(--a) 40%, white) }')).toEqual(['colour function']);
    // Function names inside other words are not colour functions.
    expect(rules('const label = toOklch(x); setLabel(1)')).toEqual([]);
  });

  it('lengths inside var() and calc() fallbacks, rem and em (self check)', () => {
    expect(rules('d { border-radius: var(--lc-radius, 26px) }')).toEqual(['radius length']);
    expect(rules('d { font-size: var(--ha-font-size-xs, 10px) }')).toEqual(['font length']);
    expect(rules('d { border-radius: var(--r, calc(var(--ha-badge-size, 36px) / 2)) }')).toEqual(['radius length']);
    expect(rules('d { filter: blur(var(--lc-blur, var(--_blur, 30px))) }')).toEqual(['blur length']);
    expect(rules('d { font-size: 1.2rem } e { border-radius: 2em }')).toEqual(['font length', 'radius length']);
    // A length in another property is not one of these (layout: gaps, widths).
    expect(rules('d { gap: 16px; width: 1em; letter-spacing: -0.04em }')).toEqual([]);
  });

  it('drop-shadow filters: offsets and blur radius, var() fallbacks, next to other filters (self check)', () => {
    expect(scan('x', code('h { filter: drop-shadow(0 2px 4px black) }')).map((f) => [f.rule, f.text])).toEqual([['drop-shadow length', 'drop-shadow(0 2px 4px black)']]);
    expect(rules('h { filter: drop-shadow(0 0 var(--g, 6px) var(--c)) }')).toEqual(['drop-shadow length']);
    expect(rules('h { filter: saturate(1.2) drop-shadow(1px 1px 0 red) }')).toEqual(['drop-shadow length']);
    expect(rules("styleMap({ filter: 'drop-shadow(0 1px 2px black)' })")).toEqual(['drop-shadow length']);
    // A colour function or var() before the lengths does not hide them: the whole argument is checked.
    expect(rules('h { filter: drop-shadow(var(--a) 0 2px 4px black) }')).toEqual(['drop-shadow length']);
    expect(rules('h { filter: drop-shadow(var(--c, red) 2px 2px) }')).toEqual(['drop-shadow length']);
    expect(rules('h { filter: drop-shadow(rgb(0 0 0) 0 2px 4px) }')).toEqual(['drop-shadow length']);
    // No length, no finding: a drop-shadow from tokens only.
    expect(rules('h { filter: drop-shadow(var(--lc-shadow)) }')).toEqual([]);
    expect(rules('h { filter: drop-shadow(var(--lc-shadow-x) var(--lc-shadow-y) var(--lc-shadow-blur) var(--lc-shadow-colour)) }')).toEqual([]);
    expect(rules('h { filter: blur(var(--lc-blur)) drop-shadow(var(--a, var(--b))) }')).toEqual([]);
  });

  it('longhand radius, the font shorthand and text shadows (self check)', () => {
    expect(rules('e { border-top-left-radius: 4px; border-end-start-radius: 2px }')).toEqual(['radius length', 'radius length']);
    expect(rules('e { font: 600 16px/1.2 Inter; font-family: Inter }')).toEqual(['font length']);
    expect(rules('e { text-shadow: 0 1px 2px black }')).toEqual(['shadow length']);
  });

  it('styleMap keys, quoted keys and custom property definitions count too (self check)', () => {
    expect(rules("styleMap({ borderRadius: '8px' })")).toEqual(['radius length']);
    expect(rules("styleMap({ borderTopLeftRadius: '8px' })")).toEqual(['radius length']);
    expect(rules("styleMap({ fontSize: '14px' })")).toEqual(['font length']);
    expect(rules("styleMap({ boxShadow: '0 2px 4px black' })")).toEqual(['shadow length']);
    expect(rules("styleMap({ 'border-radius': '8px' })")).toEqual(['radius length']);
    expect(rules(':host { --lc-radius-default: 40px }')).toEqual(['custom property length']);
    expect(rules('f { --_blur: 22px }')).toEqual(['custom property length']);
    expect(rules("styleMap({ '--_blur': '22px' })")).toEqual(['custom property length']);
  });

  it('an interpolated length must read a liquid-core token or look.blur (self check)', () => {
    expect(rules('g { gap: ${gap}px; height: ${2 * h}rem }')).toEqual(['interpolated length', 'interpolated length']);
    expect(rules("styleMap({ width: `${size}px` })")).toEqual(['interpolated length']);
    const ok = 'g { gap: ${SLIDER.row.gap}px; font-size: ${DIAL.sub}px; width: ${CLUSTER_ICON.room.size}px; max: ${PILL_MODES.height}px }';
    expect(rules(ok)).toEqual([]);
    expect(rules("styleMap({ '--_blur': `${cfg.look.blur}px`, '--b': `${cfg.look?.blur ?? defaultLook.blur}px` })")).toEqual([]);
    // Not a token namespace: a local constant with a similar name.
    expect(rules('g { gap: ${MY_DIAL_GAP}px }')).toEqual(['interpolated length']);
    // Token namespaces are upper case: a lower-case or mixed-case name is a local object, not a token.
    expect(rules('g { gap: ${dial.gap}px; width: ${Tile.size}px; top: ${Look.blur}px }')).toEqual(['interpolated length', 'interpolated length', 'interpolated length']);
  });
});
