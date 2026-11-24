import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const readme = readFileSync(`${root}README.md`, 'utf8');
const RAW = 'https://raw.githubusercontent.com/decibel95/liquid-home/main/';

describe('README images', () => {
  it('every raw image link points at a tracked file', () => {
    const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n'));
    const links = [...readme.matchAll(/https:\/\/raw\.githubusercontent\.com\/decibel95\/liquid-home\/main\/([^\s"')]+)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const path of links) expect(tracked.has(path), path).toBe(true);
  });

  it('every readme PNG is used in the README', () => {
    const files = readdirSync(`${root}docs/public/media/readme`).filter((f) => f.endsWith('.png'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(readme.includes(`${RAW}docs/public/media/readme/${f}`), f).toBe(true);
  });

  it('passes the HACS images rule', () => {
    const real = readme
      .split('\n')
      .filter((l) => (l.includes('<img') || l.includes('![')) && !/-shield|img\.shields\.io|buymeacoffee\.com/.test(l));
    expect(real.length).toBeGreaterThan(0);
  });
});
