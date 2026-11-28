#!/usr/bin/env node
/**
 * Builds the self-contained real-device perf page (plan 2.12): test/e2e/pages/perf-media.html with the candidate bundle
 * (dist/liquid-home.js, built first when missing), the Inter font and the six synthetic covers (dev/covers) inlined, so one
 * HTML file runs anywhere (a phone, a private Artifact). No network, no other file.
 *
 * Usage: node scripts/e2e/build-perf-media.mjs [--out <file>]
 *   default output: node_modules/.cache/lh-e2e/perf-media-standalone.html (ignored by git). Prints the path and the size.
 * The bundle needs `npm run build` first when dist/ is stale: this script builds only when dist/liquid-home.js is missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOut = process.argv.indexOf('--out');
const OUT = resolve(argOut > 0 ? process.argv[argOut + 1] : `${ROOT}/node_modules/.cache/lh-e2e/perf-media-standalone.html`);
const dist = (f) => resolve(ROOT, 'dist', f);

if (!existsSync(dist('liquid-home.js')) || !existsSync(dist('liquid-inter.woff2'))) {
  console.log('[perf-media] building dist/');
  await build({ root: ROOT, logLevel: 'warn' });
}

let bundle = readFileSync(dist('liquid-home.js'), 'utf8');
// The bundle fetches its font next to itself through import.meta.url; inline, give it the font as a data URI.
const fontCall = /const (\w+)=new URL\("\.\/liquid-inter\.woff2",import\.meta\.url\);\1\.search=new URL\(import\.meta\.url\)\.search;(\w+)\(\1\.href\);/;
if (!fontCall.test(bundle)) throw new Error('perf-media: the font call of the bundle was not found (the minified register code changed); update the pattern in this script');
const font = readFileSync(dist('liquid-inter.woff2')).toString('base64');
bundle = bundle.replace(fontCall, (_, _u, ensure) => `${ensure}("data:font/woff2;base64,${font}");`);
if (bundle.includes('import.meta')) throw new Error('perf-media: import.meta remains in the inlined bundle');
// A script element ends at the first closing tag: keep the text from containing one.
bundle = bundle.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const covers = {};
for (const key of ['dark', 'light', 'saturated', 'busy', '43', 'wide']) {
  covers[key] = `data:image/png;base64,${readFileSync(resolve(ROOT, 'dev', 'covers', `cover-${key}.png`)).toString('base64')}`;
}

const source = readFileSync(resolve(ROOT, 'test/e2e/pages/perf-media.html'), 'utf8');
const coversTag = '<script id="lh-covers">window.__LH_COVERS = null;</script>';
const bundleTag = '<script type="module" id="lh-bundle" src="/__bundles/liquid-home.js"></script>';
if (!source.includes(coversTag) || !source.includes(bundleTag)) throw new Error('perf-media: the two placeholder tags of perf-media.html were not found');
const html = source
  .replace(coversTag, () => `<script id="lh-covers">window.__LH_COVERS = ${JSON.stringify(covers)};</script>`)
  .replace(bundleTag, () => `<script type="module" id="lh-bundle">${bundle}</script>`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`[perf-media] ${OUT} (${html.length} bytes)`);
