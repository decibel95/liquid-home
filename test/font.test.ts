// Node environment on purpose: happy-dom's URL class does not resolve file: URLs (it maps them to localhost:3000).
import { basename } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ensureLiquidFont = vi.fn();
vi.mock('@decibel95/liquid-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@decibel95/liquid-core')>()),
  ensureLiquidFont,
}));

// src/register.ts fills window.customCards and window.customBadges; the global object stands in for window here.
(globalThis as { window?: unknown }).window = globalThis;

/** import.meta.url of src/register.ts under Vitest (the file URL, without a query). */
const MODULE = new URL('../src/register.ts', import.meta.url).href;

async function loadRegister() {
  ensureLiquidFont.mockClear();
  vi.resetModules();
  await import('../src/register');
}

afterEach(() => vi.unstubAllGlobals());

// Imported lazily: vite.config.ts is also the Vitest config.
const { FONT_ASSETS } = await import('../vite.config');

describe('font loading (liquid-core README, "Font")', () => {
  it('calls ensureLiquidFont once at module load, with liquid-inter.woff2 next to the bundle', async () => {
    await loadRegister();
    expect(ensureLiquidFont).toHaveBeenCalledTimes(1);
    const [url] = ensureLiquidFont.mock.calls[0] as [string];
    expect(url).toBe(new URL('./liquid-inter.woff2', MODULE).href);
    expect(new URL(url).pathname.endsWith('/liquid-inter.woff2')).toBe(true);
    expect(url.startsWith('data:')).toBe(false);
    expect(new URL(url).search).toBe('');
  });

  it("carries the bundle's own query string (HACS serves the bundle as ?hacstag=...)", async () => {
    // Vitest drops the query from import.meta.url, so this URL class makes the module's URL read as HACS serves it.
    const Real = URL;
    const served = `${MODULE}?hacstag=1234567`;
    vi.stubGlobal(
      'URL',
      class extends Real {
        constructor(input: string | URL, base?: string | URL) {
          super(input === MODULE ? served : input, base === MODULE ? served : base);
        }
      },
    );
    await loadRegister();
    expect(ensureLiquidFont).toHaveBeenCalledTimes(1);
    const [url] = ensureLiquidFont.mock.calls[0] as [string];
    expect(url).toBe(new Real('./liquid-inter.woff2?hacstag=1234567', MODULE).href);
    expect(new Real(url).search).toBe('?hacstag=1234567');
  });

  it('resolves to a file name the build ships and the dev server routes (contract with vite.config.ts)', () => {
    const name = basename(new URL('./liquid-inter.woff2', 'http://x/src/register.ts').pathname);
    expect(Object.keys(FONT_ASSETS)).toContain(name);
  });
});
