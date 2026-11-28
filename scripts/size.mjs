#!/usr/bin/env node
/**
 * Prints the raw and gzip size of the bundle and exits 1 above the budget (raw and gzip limits below).
 * Usage: node scripts/size.mjs [file] [--core | --no-core]   (default file dist/liquid-home.js)
 *
 * Also measures the liquid-core share (a fixture bundle of everything Liquid Home imports from core, budget 85,000
 * bytes raw, scripts/e2e/core-share.mjs). That runs for the default invocation (`npm run size`) and with --core, and
 * is skipped when a file is named or with --no-core.
 *
 * The default invocation also prints the size of the font files next to the bundle (dist/liquid-inter.woff2 and
 * dist/liquid-inter-OFL.txt). They are separate files, not part of the JavaScript budget.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Budget history:
//   2026-11-28: 320,000 raw / 92,000 gzip -> 285,000 raw / 83,000 gzip. Reason: final constants from the M3 build
//   (measured 283,372 raw, 82,928 gzip; raw rounded up to the next 5,000, gzip to the next 1,000).
//   2026-11-28: gzip 83,000 -> 84,000: V9 F1 art layer fix measured 83,106 gzip; final-constants rounding rule.
export const MAX_RAW = 285_000;
export const MAX_GZIP = 84_000;

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const file = positional[0] ?? 'dist/liquid-home.js';
const withCore = args.includes('--core') || (!args.includes('--no-core') && positional.length === 0);
let data;
try {
  data = readFileSync(file);
} catch (err) {
  console.error(`Cannot read ${file}: ${err.message}. Run "npm run build" first.`);
  process.exit(1);
}
const raw = data.length;
const gzip = gzipSync(data, { level: 9 }).length;
console.log(`${file}: ${raw} bytes raw (budget ${MAX_RAW}), ${gzip} bytes gzip (budget ${MAX_GZIP})`);
if (positional.length === 0) {
  for (const extra of ['dist/liquid-inter.woff2', 'dist/liquid-inter-OFL.txt']) {
    if (existsSync(extra)) console.log(`${extra}: ${statSync(extra).size} bytes (separate file, not in the JS budget)`);
  }
}

const over = [];
if (withCore) {
  const { measureCoreShare, reportCoreShare } = await import('./e2e/core-share.mjs');
  if (!reportCoreShare(await measureCoreShare())) over.push('liquid-core share over budget');
}
if (raw > MAX_RAW) over.push(`raw ${raw} > ${MAX_RAW}`);
if (gzip > MAX_GZIP) over.push(`gzip ${gzip} > ${MAX_GZIP}`);
if (over.length) {
  console.error(`Size budget exceeded: ${over.join(', ')}. Raise the budget and record the old value, the new value and the reason in the phase plan and the gates file.`);
  process.exit(1);
}
