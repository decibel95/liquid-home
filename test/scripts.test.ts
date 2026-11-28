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
  readFileSync: (file: string, encoding: 'utf8') => string;
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

  it('fails above 285,000 bytes raw', () => {
    const r = run('scripts/size.mjs', file(new Uint8Array(285_001)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('raw 285001 > 285000');
  });

  it('passes exactly 285,000 bytes raw when it compresses', () => {
    expect(run('scripts/size.mjs', file(new Uint8Array(285_000))).status).toBe(0);
  });

  it('passes exactly 84,000 bytes gzip', () => {
    // noise(83952) gzips to exactly 84,000 bytes
    expect(run('scripts/size.mjs', file(noise(83_952))).status).toBe(0);
  });

  it('fails at 84,001 bytes gzip even when raw is within budget', () => {
    // noise(83953) gzips to exactly 84,001 bytes
    const r = run('scripts/size.mjs', file(noise(83_953)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('gzip 84001 > 84000');
  });

  it('prints the standing-rule message when over budget', () => {
    expect(run('scripts/size.mjs', file(noise(84_500))).stderr).toContain('Raise the budget and record the old value');
  });

  it('fails when the bundle does not exist', () => {
    expect(run('scripts/size.mjs', path.join(base, 'missing.js')).status).toBe(1);
  });
});

describe('scripts/e2e/core-share.mjs budget', () => {
  const probe = (raw: number) =>
    spawnSync(
      'node',
      ['--input-type=module', '-e', `import { reportCoreShare, MAX_CORE_RAW } from './scripts/e2e/core-share.mjs'; if (MAX_CORE_RAW !== 105000) process.exit(3); process.exit(reportCoreShare({ names: 1, raw: ${raw}, gzip: 1, rawWithLit: ${raw}, gzipWithLit: 1 }) ? 0 : 1);`],
      { encoding: 'utf8' },
    );

  it('passes 105,000 bytes raw', () => {
    expect(probe(105_000).status).toBe(0);
  });

  it('fails 105,001 bytes raw with the standing-rule message', () => {
    const r = probe(105_001);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Raise the budget and record the old value, the new value and the reason in the phase plan and the gates file.');
  });
});

describe('scripts/e2e/fetch-lc.mjs pin (D-17)', () => {
  const probe = () =>
    spawnSync(
      'node',
      ['--input-type=module', '-e', `import * as lc from './scripts/e2e/fetch-lc.mjs'; console.log(JSON.stringify([lc.LC_VERSION, lc.LC_URL, lc.LC_SHA256, lc.LC_BYTES]));`],
      { encoding: 'utf8' },
    );

  it('pins the Liquid Climate v0.13.0 release asset by sha256 and size', () => {
    const r = probe();
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      'v0.13.0',
      'https://github.com/decibel95/liquid-climate/releases/download/v0.13.0/liquid-climate.js',
      'bec2a35630f24e8c503f0daa9dd839ce710fbb7fc5422fb317a4ceea0ceb35ae',
      355735,
    ]);
  });
});

describe('scripts/e2e/fetch-lc.mjs size check', () => {
  it('compares the downloaded size and content-length before hashing', () => {
    const src = fs.readFileSync('scripts/e2e/fetch-lc.mjs', 'utf8');
    expect(src).toContain('body.length !== LC_BYTES');
    expect(src).toContain("res.headers.get('content-length')");
    expect(src.indexOf('body.length !== LC_BYTES')).toBeLessThan(src.indexOf('sha256(body)'));
  });
});

describe('.github/workflows/e2e.yml (plan 2.15 item 11)', () => {
  const yml = fs.readFileSync('.github/workflows/e2e.yml', 'utf8');
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const uses = (text: string) => [...text.matchAll(/uses:\s*(\S+?)@([0-9a-f]{40})\s+# (v[\d.]+)/g)].map((m) => `${m[1]}@${m[2]} ${m[3]}`);

  it('runs on push to master and main, pull requests and workflow_dispatch, and nothing else', () => {
    expect(yml).toMatch(/^on:\n {2}push:\n {4}branches: \[master, main\]\n {2}pull_request:\n {2}workflow_dispatch:\n/m);
    expect(yml).not.toMatch(/pull_request_target|schedule:|workflow_run/);
  });

  it('runs only on GitHub, with no token permission at the top and contents: read in the job', () => {
    expect(yml).toMatch(/^permissions: \{\}$/m);
    expect(yml).toContain("if: github.server_url == 'https://github.com'");
    expect(yml).toMatch(/ {4}permissions:\n {6}contents: read\n/);
    expect((yml.match(/permissions:/g) ?? []).length).toBe(2);
    expect(yml).not.toMatch(/contents: write|id-token|secrets\./);
  });

  it('pins every action by commit SHA with a version comment, the same SHAs as ci.yml', () => {
    const own = uses(yml);
    expect(own.length).toBe(3);
    for (const u of own) expect(uses(ci), `${u} is pinned as in ci.yml`).toContain(u);
    expect(yml.match(/uses:/g)?.length).toBe(own.length);
  });

  it('uploads the hidden results folder on failure and warns when it is empty', () => {
    expect(yml).toContain('include-hidden-files: true');
    expect(yml).toContain('if-no-files-found: warn');
  });

  it('checks out without persisting credentials and installs with --ignore-scripts', () => {
    expect(yml).toMatch(/actions\/checkout@\S+ # v[\d.]+\n {8}with:\n {10}persist-credentials: false/);
    expect(yml).toContain('npm ci --ignore-scripts');
  });

  it('installs Chromium with its system libraries and runs the suite without the performance spec', () => {
    expect(yml).toContain('npx playwright install --with-deps chromium');
    expect(yml).toContain('LH_E2E_IGNORE: performance.spec.ts');
    expect(yml).toContain('run: npm run e2e');
    expect(yml).not.toContain('LH_E2E_BROWSERS');
  });

  it('does not put a github.event value into a shell command', () => {
    const runs = yml.split('\n').filter((l) => /^\s+(- )?run:/.test(l));
    expect(runs.length).toBeGreaterThan(0);
    for (const l of runs) expect(l).not.toContain('${{');
  });

  it('retries once only under CI, in the Playwright config', () => {
    const config = fs.readFileSync('test/e2e/playwright.config.ts', 'utf8');
    expect(config).toContain('retries: process.env.CI ? 1 : 0');
    expect(config).toContain("LH_E2E_IGNORE");
  });
});
