// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

// The project has no Node typings (tsconfig types: []), so Node modules are loaded through typed shims.
type Result = { status: number | null; stdout: string; stderr: string };
const names = { cp: 'node:child_process', fs: 'node:fs', os: 'node:os', path: 'node:path' };
const { spawnSync } = (await import(/* @vite-ignore */ names.cp)) as {
  spawnSync: (cmd: string, args: string[], opts: { encoding: 'utf8' }) => Result;
};
const fs = (await import(/* @vite-ignore */ names.fs)) as {
  mkdtempSync: (prefix: string) => string;
  mkdirSync: (path: string, opts: { recursive: boolean }) => void;
  writeFileSync: (file: string, data: string | Uint8Array) => void;
  rmSync: (path: string, opts: { recursive: boolean; force: boolean }) => void;
};
const os = (await import(/* @vite-ignore */ names.os)) as { tmpdir: () => string };
const path = (await import(/* @vite-ignore */ names.path)) as { join: (...p: string[]) => string; dirname: (p: string) => string };

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'release-checks-'));
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));
let n = 0;

/** A fixture project root with the given files (relative path to content). */
function project(files: Record<string, string>): string {
  const root = path.join(base, `p${n++}`);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}
const run = (script: string, ...args: string[]): Result => spawnSync('node', [script, ...args], { encoding: 'utf8' });

const CLEAN = {
  'src/const.ts': "export const DOCS_URL = 'https://decibel95.github.io/liquid-home';\n",
  '.github/ISSUE_TEMPLATE/config.yml': 'url: https://github.com/decibel95/liquid-home/discussions\n',
  'README.md': '# Liquid Home\n',
  'package.json': '{"dependencies":{"lit":"3.2.1"}}\n',
  'package-lock.json': '{"packages":{"node_modules/lit":{"version":"3.2.1"}}}\n',
};

describe('scripts/check-owner.mjs', () => {
  it('passes when the URLs are filled in', () => {
    expect(run('scripts/check-owner.mjs', '--root', project(CLEAN)).status).toBe(0);
  });

  it('fails on the OWNER placeholder in the docs URL', () => {
    const root = project({ ...CLEAN, 'src/const.ts': "export const DOCS_URL = 'https://OWNER.github.io/liquid-home';\n" });
    const r = run('scripts/check-owner.mjs', '--root', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/const.ts:1');
  });

  it('fails on the OWNER placeholder in the issue config and the README', () => {
    const root = project({
      ...CLEAN,
      '.github/ISSUE_TEMPLATE/config.yml': 'url: https://github.com/OWNER/liquid-home/discussions\n',
      'README.md': 'See https://github.com/OWNER/liquid-home\n',
    });
    const r = run('scripts/check-owner.mjs', '--root', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('config.yml:1');
    expect(r.stderr).toContain('README.md:1');
  });

  it('fails when a checked file is missing', () => {
    const { 'README.md': _readme, ...rest } = CLEAN;
    void _readme;
    expect(run('scripts/check-owner.mjs', '--root', project(rest)).status).toBe(1);
  });

  it('passes on this repository', () => {
    expect(run('scripts/check-owner.mjs').status).toBe(0);
  });
});

describe('scripts/check-dependencies.mjs', () => {
  it('passes with registry dependencies only', () => {
    expect(run('scripts/check-dependencies.mjs', '--root', project(CLEAN)).status).toBe(0);
  });

  it('fails on a file: dependency in package.json', () => {
    const root = project({ ...CLEAN, 'package.json': '{"dependencies":{"@decibel95/liquid-core":"file:vendor/core.tgz"}}\n' });
    const r = run('scripts/check-dependencies.mjs', '--root', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('package.json:1');
  });

  it('fails on a file: dependency that only the lockfile still has', () => {
    const root = project({ ...CLEAN, 'package-lock.json': '{\n"packages":{"node_modules/x":{"resolved":"file:vendor/x.tgz"}}}\n' });
    const r = run('scripts/check-dependencies.mjs', '--root', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('package-lock.json:2');
  });

  it('fails when a vendor folder exists', () => {
    const root = project({ ...CLEAN, 'vendor/core.tgz': 'x' });
    const r = run('scripts/check-dependencies.mjs', '--root', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('vendor/');
  });
});

describe('scripts/size.mjs', () => {
  const file = (bytes: Uint8Array) => {
    const f = path.join(base, `bundle-${n++}.js`);
    fs.writeFileSync(f, bytes);
    return f;
  };
  /** Pseudo random bytes: they barely compress, so gzip is about the raw size. */
  const noise = (len: number) => {
    const out = new Uint8Array(len);
    let x = 123456789;
    for (let i = 0; i < len; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      out[i] = x >>> 24;
    }
    return out;
  };

  it('passes a small bundle and prints both sizes', () => {
    const r = run('scripts/size.mjs', file(new Uint8Array(1000)));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1000 bytes raw.*bytes gzip/);
  });

  it('fails above 220,000 bytes raw', () => {
    const r = run('scripts/size.mjs', file(new Uint8Array(220_001)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('raw 220001 > 220000');
  });

  it('passes exactly 220,000 bytes raw when it compresses', () => {
    expect(run('scripts/size.mjs', file(new Uint8Array(220_000))).status).toBe(0);
  });

  it('fails above 66,000 bytes gzip even when raw is within budget', () => {
    const r = run('scripts/size.mjs', file(noise(67_000)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('gzip');
  });

  it('fails when the bundle does not exist', () => {
    expect(run('scripts/size.mjs', path.join(base, 'missing.js')).status).toBe(1);
  });
});
