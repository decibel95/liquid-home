#!/usr/bin/env node
/**
 * Release check: a release must depend on published packages only.
 * Usage: node scripts/check-dependencies.mjs [--root dir]
 * Fails on any `file:` dependency in package.json or package-lock.json, and on a `vendor/` folder
 * (liquid-core must come from the npm registry, never from a local tarball).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const i = process.argv.indexOf('--root');
const root = i > 0 ? process.argv[i + 1] : '.';

const problems = [];
for (const f of ['package.json', 'package-lock.json']) {
  const path = join(root, f);
  if (!existsSync(path)) {
    if (f === 'package.json') problems.push('package.json is missing');
    continue;
  }
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((line, n) => {
      if (/"file:/.test(line)) problems.push(`${f}:${n + 1}: ${line.trim()}`);
    });
}
if (existsSync(join(root, 'vendor'))) problems.push('vendor/ exists: delete it after switching to the published liquid-core version');

if (problems.length) {
  console.error(`Not releasable:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('No file: dependency and no vendor/ folder.');
