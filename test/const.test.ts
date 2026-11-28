// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CARD_TYPES, DOCS_URL, ISSUES_URL, REPO_URL, TAGS } from '../src/const';
import pkg from '../package.json';
import hacs from '../hacs.json';

const names = { fs: 'node:fs' };
const fs = (await import(/* @vite-ignore */ names.fs)) as { readFileSync: (file: string, enc: 'utf8') => string };
const issueConfig = fs.readFileSync('.github/ISSUE_TEMPLATE/config.yml', 'utf8');

describe('const.ts', () => {
  it('DOCS_URL and the repo URLs match the issue template config', () => {
    expect(issueConfig).toContain(`url: ${DOCS_URL}\n`);
    expect(issueConfig).toContain(`url: ${REPO_URL}/discussions\n`);
    expect(ISSUES_URL).toBe(`${REPO_URL}/issues`);
  });

  it('package.json points at the same repository and docs', () => {
    expect(pkg.homepage).toBe(DOCS_URL);
    expect(pkg.bugs.url).toBe(ISSUES_URL);
    expect(pkg.repository.url).toBe(`git+${REPO_URL}.git`);
  });

  it('tag names follow the documented naming and are unique', () => {
    expect(TAGS).toEqual({
      light: 'liquid-home-light-card',
      lightEditor: 'liquid-home-light-card-editor',
      tile: 'liquid-home-tile',
      tileEditor: 'liquid-home-tile-editor',
      badge: 'liquid-home-badge',
      badgeEditor: 'liquid-home-badge-editor',
      room: 'liquid-home-room',
      roomEditor: 'liquid-home-room-editor',
      cover: 'liquid-home-cover-card',
      coverEditor: 'liquid-home-cover-card-editor',
      fan: 'liquid-home-fan-card',
      fanEditor: 'liquid-home-fan-card-editor',
      media: 'liquid-home-media-card',
      mediaEditor: 'liquid-home-media-card-editor',
      sheet: 'liquid-home-sheet',
    });
    expect(new Set(Object.values(TAGS)).size).toBe(Object.keys(TAGS).length);
    expect(CARD_TYPES.room).toBe('custom:liquid-home-room');
  });

  it('hacs.json is exactly as specified', () => {
    expect(hacs).toEqual({ name: 'Liquid Home', filename: 'liquid-home.js', homeassistant: '2025.1.0' });
  });
});

describe('package.json', () => {
  it('is private ESM with exact pins and no @mdi/js', () => {
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    expect(all['@mdi/js']).toBeUndefined();
    for (const [name, spec] of Object.entries(all)) {
      if (name === '@decibel95/liquid-core') continue;
      expect(spec, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
