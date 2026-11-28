import { expect, test, type Page } from 'playwright/test';
import { expectCapped, measureBadges as measure } from './support/badges';
import { stubFavicon, watchErrors } from './support/helpers';

/**
 * Gate 3 fix (plan 2.6): at 390 px a badge with a long name must not widen the page, in every domain. Two layouts:
 * - the dev harness (/dev/, its `[data-long]` rows, one per glass), and
 * - a repro of Home Assistant's badge row, which applies `.badges > * { min-width: fit-content }` to each badge host
 *   (test/e2e/pages/domains.html, built bundle).
 * Each long badge must be capped at the row width and show its name with an ellipsis.
 */
test.use({ viewport: { width: 390, height: 844 } });

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('dev harness at 390 px', () => {
  test('the long-name badge rows of both glasses cap every badge at the row width and ellipsize the name', async ({ page }) => {
    const errors = watchErrors(page);
    await stubFavicon(page);
    await page.goto('/dev/');
    await page.waitForFunction(() => document.querySelectorAll('[data-long="true"] liquid-home-badge').length >= 10);
    await page.waitForTimeout(500);
    const measures = await measure(page, '[data-long="true"]');
    // Five badges (light, two covers, two fans) in each of the two glass rows.
    expectCapped(measures.filter((_, i) => i < 5), 5, 4);
    expectCapped(measures.filter((_, i) => i >= 5), 5, 4);
    expect(errors).toEqual([]);
  });
});

test.describe('media players at 390 px (RH4)', () => {
  test('the long-name media badge rows of the dev harness (data-long-media, both glasses) cap every badge at the row width and ellipsize the name', async ({ page }) => {
    const errors = watchErrors(page);
    await stubFavicon(page);
    await page.goto('/dev/?domain=media');
    await page.waitForFunction(() => document.querySelectorAll('[data-long-media="true"] liquid-home-badge').length >= 4);
    await page.waitForTimeout(500);
    const measures = await measure(page, '[data-long-media="true"]');
    // Two badges (the fixture name, a longer `name` option) in each of the two glass rows.
    expect(measures.map((m) => m.entity)).toEqual(Array(4).fill('media_player.lh_fixture_long_title'));
    for (const half of [measures.slice(0, 2), measures.slice(2)]) expectCapped(half, 2, 1);
    expect(errors).toEqual([]);
  });

  for (const glass of ['dark', 'light'] as const) {
    test(`in Home Assistant's badge row (min-width: fit-content) a long-name media badge is capped at the row width with an ellipsis, ${glass} glass`, async ({ page }) => {
      const errors = watchErrors(page);
      await stubFavicon(page);
      await page.goto(`/test/e2e/pages/domains.html?show=badges-media&glass=${glass}`);
      await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
      await page.waitForTimeout(500);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      // The long `name` option is cut; the fixture's own name may nearly fit.
      expectCapped(await measure(page, '.badges.ha'), 2, 1);
      expect(errors).toEqual([]);
    });

    test(`a media tile with a long name, title and artist stays inside the page, one line each with an ellipsis, ${glass} glass`, async ({ page }) => {
      const errors = watchErrors(page);
      await stubFavicon(page);
      await page.goto(`/test/e2e/pages/domains.html?show=tiles-media&glass=${glass}`);
      await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
      await page.waitForTimeout(600);
      expect(await horizontalOverflow(page), 'the page does not scroll sideways').toBeLessThanOrEqual(0);
      for (const id of ['long-media-tile', 'long-media-tile-named']) {
        const m = await page.locator(`#${id}`).evaluate((host) => {
          const root = host.shadowRoot!;
          const h = host.getBoundingClientRect();
          const text = (sel: string) => {
            const el = root.querySelector<HTMLElement>(sel);
            if (!el) return null;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return { text: (el.textContent ?? '').trim().slice(0, 40), scroll: el.scrollWidth, client: el.clientWidth, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, right: r.right };
          };
          return { hostRight: h.right, hostWidth: h.width, name: text('button.body .name'), sub: text('button.body .sub') };
        });
        console.log(`[long media tile ${glass}] ${id}: ${JSON.stringify(m)}`);
        expect(m.hostWidth, `${id}: the tile fits the 390 px page`).toBeLessThanOrEqual(390);
        expect(m.hostRight).toBeLessThanOrEqual(390);
        for (const part of [m.name, m.sub]) {
          if (!part) continue;
          expect(part.whiteSpace, `${id} ${part.text}`).toBe('nowrap');
          expect(part.textOverflow, `${id} ${part.text}`).toBe('ellipsis');
          expect(part.right, `${id}: text ends inside the tile`).toBeLessThanOrEqual(m.hostRight);
        }
        expect(m.name, `${id}: a name element`).not.toBeNull();
        expect(m.name!.scroll, `${id}: the long name is cut`).toBeGreaterThan(m.name!.client);
      }
      expect(errors).toEqual([]);
    });
  }
});

for (const glass of ['dark', 'light'] as const) {
  test.describe(`Home Assistant badge row (min-width: fit-content), ${glass} glass`, () => {
    test(`a long-name badge of each domain is capped at the row width with an ellipsis, and the page does not scroll sideways`, async ({ page }) => {
      const errors = watchErrors(page);
      await stubFavicon(page);
      await page.goto(`/test/e2e/pages/domains.html?show=badges-ha&glass=${glass}`);
      await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
      await page.waitForTimeout(500);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const measures = await measure(page, '.badges.ha');
      // Three of the five carry a name option longer than the row; the fixture names of the other two nearly fit.
      expectCapped(measures, 5, 3);
      // The domains in the row: light, two covers, two fans.
      expect(measures.map((m) => m.entity.split('.')[0])).toEqual(['light', 'cover', 'cover', 'fan', 'fan']);
      expect(errors).toEqual([]);
    });

    test('in a plain wrapping row the same badges stay inside the row too', async ({ page }) => {
      await stubFavicon(page);
      await page.goto(`/test/e2e/pages/domains.html?show=badges-plain&glass=${glass}`);
      await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
      await page.waitForTimeout(500);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expectCapped(await measure(page, '.badges.plain'), 5, 3);
    });
  });
}

test('a short name keeps its natural width in the Home Assistant row (the cap only bites on long names)', async ({ page }) => {
  await stubFavicon(page);
  await page.goto('/test/e2e/pages/domains.html?show=history&glass=dark');
  await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
  const width = await page.locator('#hist-badge').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(80);
  expect(width).toBeLessThan(260);
});
