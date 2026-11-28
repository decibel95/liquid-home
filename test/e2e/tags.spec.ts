import { expect, test } from 'playwright/test';
import { TAGS } from '../../src/const';
import { definesOf, recordDefines, stubFavicon, watchErrors } from './support/helpers';

const BUNDLE = '/__bundles/liquid-home.js';

/** Plan 2.3 / 4.2: liquid-home.js alone defines only tags that start with `liquid-home-`. */
test.describe('tags defined by liquid-home.js on its own', () => {
  test('every defined tag starts with liquid-home- and belongs to the documented list', async ({ page }) => {
    const errors = watchErrors(page);
    await stubFavicon(page);
    await page.addInitScript(recordDefines);
    await page.goto('/test/e2e/pages/blank.html');
    await page.evaluate(async (url) => {
      await import(/* @vite-ignore */ url);
    }, BUNDLE);
    const names = (await definesOf(page)).map((d) => d.name);
    expect(errors).toEqual([]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => !n.startsWith('liquid-home-'))).toEqual([]);
    expect(names.filter((n) => !(Object.values(TAGS) as string[]).includes(n))).toEqual([]);
    for (const tag of [TAGS.light, TAGS.tile, TAGS.badge, TAGS.room, TAGS.cover, TAGS.fan, TAGS.media]) expect(names, tag).toContain(tag);
  });

  test('loading the bundle twice defines every tag once and does not throw', async ({ page }) => {
    const errors = watchErrors(page);
    await stubFavicon(page);
    await page.addInitScript(recordDefines);
    await page.goto('/test/e2e/pages/blank.html');
    await page.evaluate(async (url) => {
      await import(/* @vite-ignore */ url);
      await import(/* @vite-ignore */ `${url}?second-copy`);
    }, BUNDLE);
    const defines = await definesOf(page);
    expect(errors).toEqual([]);
    expect(defines.filter((d) => !d.ok)).toEqual([]);
    const names = defines.map((d) => d.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
