#!/usr/bin/env node
/**
 * Release check: the OWNER placeholder must be replaced in the public URLs.
 * Usage: node scripts/check-owner.mjs [--root dir]
 * Checks src/const.ts, .github/ISSUE_TEMPLATE/config.yml and README.md. Exit 1 on a hit or a missing file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FILES = ['src/const.ts', '.github/ISSUE_TEMPLATE/config.yml', 'README.md'];
const PLACEHOLDER = /OWNER\.github\.io|github\.com\/OWNER/;

const i = process.argv.indexOf('--root');
const root = i > 0 ? process.argv[i + 1] : '.';

const problems = [];
for (const f of FILES) {
  const path = join(root, f);
  if (!existsSync(path)) {
    problems.push(`${f}: file is missing`);
    continue;
  }
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((line, n) => {
      if (PLACEHOLDER.test(line)) problems.push(`${f}:${n + 1}: ${line.trim()}`);
    });
}
if (problems.length) {
  console.error(`Replace the OWNER placeholder URLs in ${FILES.join(', ')} before releasing:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('No OWNER placeholder left.');
