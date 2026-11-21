// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import pkg from '../package.json';

// The project has no Node typings (tsconfig types: []), so Node modules are loaded through typed shims.
type Result = { status: number | null; stdout: string; stderr: string };
const names = { cp: 'node:child_process', fs: 'node:fs', os: 'node:os', path: 'node:path' };
const { spawnSync } = (await import(/* @vite-ignore */ names.cp)) as {
  spawnSync: (cmd: string, args: string[], opts: { encoding: 'utf8' }) => Result;
};
const fs = (await import(/* @vite-ignore */ names.fs)) as {
  mkdtempSync: (prefix: string) => string;
  writeFileSync: (file: string, data: string) => void;
  rmSync: (path: string, opts: { recursive: boolean; force: boolean }) => void;
};
const os = (await import(/* @vite-ignore */ names.os)) as { tmpdir: () => string };
const path = (await import(/* @vite-ignore */ names.path)) as { join: (...p: string[]) => string };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
let n = 0;
/** Runs the script on a fixture changelog and returns the result. */
function run(version: string, changelog?: string): Result {
  const args = ['scripts/release-notes.sh', version];
  if (changelog !== undefined) {
    const file = path.join(dir, `changelog-${n++}.md`);
    fs.writeFileSync(file, changelog);
    args.push(file);
  }
  return spawnSync('bash', args, { encoding: 'utf8' });
}

const FIXTURE = [
  '# Changelog',
  '',
  '<!-- #region entries -->',
  '## 1.0.0',
  '',
  'The current version.',
  '',
  '### Added',
  '- Stable thing',
  '',
  '## 1.0.0-beta.1',
  '',
  '### Added',
  '- Beta thing',
  '',
  '## 0.9.0',
  '',
  '- Last thing',
  '<!-- #endregion entries -->',
  '',
].join('\n');

describe('scripts/release-notes.sh', () => {
  it('extracts one section without its heading, the marker line or neighbours', () => {
    const r = run('1.0.0', FIXTURE);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('### Added\n- Stable thing\n');
  });

  it('accepts a leading v', () => {
    expect(run('v1.0.0', FIXTURE).stdout).toBe('### Added\n- Stable thing\n');
  });

  it('keeps a prerelease apart from its release', () => {
    expect(run('1.0.0-beta.1', FIXTURE).stdout).toBe('### Added\n- Beta thing\n');
  });

  it('stops the last section at a comment marker', () => {
    expect(run('0.9.0', FIXTURE).stdout).toBe('- Last thing\n');
  });

  it('handles CRLF changelogs', () => {
    const r = run('1.0.0', FIXTURE.replace(/\n/g, '\r\n'));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('### Added\n- Stable thing\n');
  });

  it('fails with a clear error when the version has no section', () => {
    const r = run('9.9.9', FIXTURE);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('No CHANGELOG.md section found for version 9.9.9');
    expect(r.stdout).toBe('');
  });

  it('the real CHANGELOG has notes for the package.json version', () => {
    const r = run(pkg.version);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });
});
