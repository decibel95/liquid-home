import { expect, test, type Page } from 'playwright/test';
import { LC_SHA256 } from '../../scripts/e2e/fetch-lc.mjs';
import { definesOf, glassOf, recordDefines, stubFavicon, watchErrors } from './support/helpers';

/**
 * Plan 2.3: liquid-climate.js (v0.11.1 release asset) and liquid-home.js on one page, in both orders (plus both at
 * once, as Home Assistant may load its resources). The fake hass has one dimmed light and one climate entity.
 */
const LH_TAGS = ['liquid-home-light-card', 'liquid-home-tile', 'liquid-home-badge', 'liquid-home-room'];
const LC_TAGS = ['liquid-climate-card', 'liquid-climate-tile', 'liquid-climate-badge', 'liquid-climate-cluster'];

interface Entry {
  type: string;
}

test('the Liquid Climate bundle under test is the pinned v0.11.1 asset', async ({ request }) => {
  const res = await request.get('/__bundles/liquid-climate.js');
  const { createHash } = await import('node:crypto');
  expect(createHash('sha256').update(await res.body()).digest('hex')).toBe(LC_SHA256);
});

for (const order of ['lc-first', 'lh-first', 'parallel'] as const) {
  test.describe(`both bundles on one page, order ${order}`, () => {
    let page: Page;
    let errors: string[];

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      errors = watchErrors(page);
      await stubFavicon(page);
      await page.addInitScript(recordDefines);
      await page.goto(`/test/e2e/pages/two-bundles.html?order=${order}`);
      await page.waitForFunction(() => (window as unknown as { __twoBundles: { done: boolean } }).__twoBundles.done, null, { timeout: 30_000 });
    });
    test.afterAll(async () => {
      await page.close();
    });

    test('loads both bundles without a console error or a NotSupportedError', async () => {
      const state = await page.evaluate(() => (window as unknown as { __twoBundles: { error?: string } }).__twoBundles);
      expect(state.error).toBeUndefined();
      expect(errors).toEqual([]);
      expect((await definesOf(page)).filter((d) => !d.ok)).toEqual([]);
    });

    test('defines every tag exactly once', async () => {
      const names = (await definesOf(page)).map((d) => d.name);
      expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
      for (const tag of [...LH_TAGS, ...LC_TAGS]) expect(names, tag).toContain(tag);
    });

    test('every defined tag belongs to one of the two products', async () => {
      const names = (await definesOf(page)).map((d) => d.name);
      expect(names.filter((n) => !n.startsWith('liquid-home-') && !n.startsWith('liquid-climate-'))).toEqual([]);
    });

    test('window.customCards holds both products with no duplicate type', async () => {
      const types = (await page.evaluate(() => (window as unknown as { customCards: Entry[] }).customCards)).map((c) => c.type);
      expect(types.filter((t, i) => types.indexOf(t) !== i)).toEqual([]);
      for (const tag of [...LH_TAGS, ...LC_TAGS]) expect(types, tag).toContain(tag);
    });

    test('window.customBadges holds both badges with no duplicate type', async () => {
      const types = (await page.evaluate(() => (window as unknown as { customBadges: Entry[] }).customBadges)).map((c) => c.type);
      expect(types.filter((t, i) => types.indexOf(t) !== i)).toEqual([]);
      expect(types).toContain('liquid-home-badge');
      expect(types).toContain('liquid-climate-badge');
    });

    test('the Liquid Home light card renders glass with one backdrop-filter and the 40px radius', async () => {
      const glass = await glassOf(page, '#lh-card');
      expect(glass?.count).toBe(1);
      expect(glass?.backdropFilter).toMatch(/blur\(\d+(\.\d+)?px\)/);
      expect(glass?.borderRadius).toBe('40px');
    });

    test('the Liquid Climate dial renders glass with the 40px radius', async () => {
      const glass = await glassOf(page, '#lc-card');
      expect(glass?.backdropFilter).toMatch(/blur\(\d+(\.\d+)?px\)/);
      expect(glass?.borderRadius).toBe('40px');
    });

    test('the two badges render glass with the same pill radius rule', async () => {
      const lh = await glassOf(page, '#lh-badge');
      const lc = await glassOf(page, '#lc-badge');
      expect(lh?.backdropFilter).toMatch(/blur\(/);
      expect(lc?.backdropFilter).toMatch(/blur\(/);
      expect(lh?.borderRadius).toBe(lc?.borderRadius);
    });
  });
}
