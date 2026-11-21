// Records test/cards/tile/lc-0.11.1-style.json: the styles of the Liquid Climate 0.11.1 tile and badge, the read-only
// reference of parity.test.ts. Run from the repo root, with a Liquid Climate checkout next to it:
//   node test/cards/tile/extract-lc-style.mjs [/path/to/liquid-climate]
// It reads the files at commit 373b340 (git show), so the checkout's working tree does not matter. Regenerate only
// for a new Liquid Climate release, together with a reviewed change of the Liquid Home tile and badge.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const LC = process.argv[2] ?? process.env.LC_REPO;
if (!LC) {
  console.error('Pass the path of a Liquid Climate checkout as the first argument or set LC_REPO.');
  process.exit(1);
}
const REV = '373b340';
const OUT = 'test/cards/tile/lc-0.11.1-style.json';

const show = (file) => execFileSync('git', ['-C', LC, 'show', `${REV}:${file}`], { encoding: 'utf8' });

/** Declarations of one rule body, whitespace collapsed. */
function decls(body) {
  const d = {};
  for (const part of body.split(';')) {
    const k = part.indexOf(':');
    if (k > 0) d[part.slice(0, k).trim()] = part.slice(k + 1).trim().replace(/\s+/g, ' ');
  }
  return d;
}

/**
 * Rules of a stylesheet text. Top-level rules: selector to { line, ...declarations } (line = source line of the
 * selector, counted from `lineOffset`). At-rules (@media, @keyframes): prelude to { selector: declarations }.
 */
function parse(text, lineOffset) {
  const rules = {};
  const atRules = {};
  let i = 0;
  let depth = 0;
  let buf = '';
  let sel = '';
  let selLine = 0;
  let start = 0;
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i) + 2;
      continue;
    }
    const ch = text[i];
    if (ch === '{') {
      depth++;
      if (depth === 1) {
        sel = buf.trim().replace(/\s+/g, ' ');
        selLine = lineOffset + text.slice(0, i).split('\n').length - 1;
        buf = '';
        start = i + 1;
      } else buf += ch;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (sel.startsWith('@')) atRules[sel] = parse(text.slice(start, i), 0).rules;
        else rules[sel] = { line: selLine, ...decls(buf) };
        buf = '';
      } else buf += ch;
    } else buf += ch;
    i++;
  }
  return { rules, atRules };
}

/** The first css`` block after `static override styles`. */
function styles(file) {
  const text = show(file);
  const start = text.indexOf('css`', text.indexOf('static override styles'));
  const end = text.indexOf('`', start + 4);
  return parse(text.slice(start + 4, end), text.slice(0, start + 4).split('\n').length);
}

const stripLines = (rules) => Object.fromEntries(Object.entries(rules).map(([s, { line: _l, ...d }]) => [s, d]));
const tile = styles('src/cards/tile/liquid-climate-tile.ts');
const badge = styles('src/cards/badge/liquid-climate-badge.ts');
const fixture = {
  source: `Liquid Climate 0.11.1, commit ${REV}. Recorded by test/cards/tile/extract-lc-style.mjs from the styles of src/cards/tile/liquid-climate-tile.ts and src/cards/badge/liquid-climate-badge.ts (top-level rules with the source line of the selector; at-rules by prelude). Read-only reference for the Liquid Home tile and badge parity test; regenerate only from a Liquid Climate release.`,
  tile: tile.rules,
  badge: badge.rules,
  atRules: {
    tile: Object.fromEntries(Object.entries(tile.atRules).map(([p, r]) => [p, stripLines(r)])),
    badge: Object.fromEntries(Object.entries(badge.atRules).map(([p, r]) => [p, stripLines(r)])),
  },
};
writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n');
console.log(`wrote ${OUT}: tile ${Object.keys(tile.rules).length} rules, ${Object.keys(tile.atRules).length} at-rules; badge ${Object.keys(badge.rules).length} rules, ${Object.keys(badge.atRules).length} at-rules`);
