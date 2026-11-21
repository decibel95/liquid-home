#!/usr/bin/env node
/**
 * Prints the raw and gzip size of the bundle and exits 1 above the budget (raw and gzip limits below).
 * Usage: node scripts/size.mjs [file] [--core | --no-core]   (default file dist/liquid-home.js)
 *
 * Also measures the liquid-core share (a fixture bundle of everything Liquid Home imports from core, budget 85,000
 * bytes raw, scripts/e2e/core-share.mjs). That runs for the default invocation (`npm run size`) and with --core, and
 * is skipped when a file is named or with --no-core.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

export const MAX_RAW = 220_000;
export const MAX_GZIP = 62_000;

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

const over = [];
if (withCore) {
  const { measureCoreShare, reportCoreShare } = await import('./e2e/core-share.mjs');
  if (!reportCoreShare(await measureCoreShare())) over.push('liquid-core share over budget');
}
if (raw > MAX_RAW) over.push(`raw ${raw} > ${MAX_RAW}`);
if (gzip > MAX_GZIP) over.push(`gzip ${gzip} > ${MAX_GZIP}`);
if (over.length) {
  console.error(`Size budget exceeded: ${over.join(', ')}. Report it; raising a budget needs maintainer approval.`);
  process.exit(1);
}
