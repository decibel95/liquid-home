import { expect, test, type Page } from 'playwright/test';
import { expectCapped, measureBadges } from './support/badges';
import { beginDrag, callsOf, watchCalls } from './support/domains';
import { glassOf, stubFavicon, watchErrors } from './support/helpers';
import { artState, beginSeekDrag, mediaCalls, openMedia, routeArt, seekBar } from './support/media';

/**
 * D-10 cross-browser smoke (plan 2.12): the subset that runs in Chromium, Firefox and WebKit. Everything else in
 * test/e2e runs in Chromium only. Render the cover, fan and media cards, a drag write, the media seek drag, the media chip menu by keyboard and the artwork fallback, a keyboard step, the sheet History navigation, a long
 * badge at 390 px, and the room tile `overflow-x: clip` ellipsis (Safari 16 and later).
 * Firefox and WebKit: `LH_E2E_BROWSERS=firefox,webkit npx playwright test -c test/e2e/playwright.config.ts` (see the config).
 */
const COVER = '#slot-cover liquid-home-cover-card';
const FAN = '#slot-fan liquid-home-fan-card';

async function openHarness(page: Page, query: string) {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto(`/dev/?${query}&glass=dark`);
  await expect(page.locator(`${COVER} [role="slider"]`).first()).toBeVisible();
  await expect(page.locator(`${FAN} [role="slider"]`).first()).toBeVisible();
  await watchCalls(page);
  return errors;
}

async function domainsPage(page: Page, query: string): Promise<void> {
  await stubFavicon(page);
  await page.goto(`/test/e2e/pages/domains.html?${query}`);
  await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
  await page.waitForTimeout(400);
}

test.describe('smoke: cover and fan cards', () => {
  test('both cards render on glass with their slider, readout and no console error', async ({ page }) => {
    const errors = await openHarness(page, 'cover=hall&fan=pct67');
    const cover = page.locator(COVER).first();
    const fan = page.locator(FAN).first();
    await expect(cover.locator('[role="slider"]')).toHaveAttribute('aria-label', 'Position, Hall Window');
    await expect(cover.locator('.ro .big')).toHaveText('10');
    await expect(fan.locator('[role="slider"]')).toHaveAttribute('aria-label', 'Speed, Living Room Fan');
    await expect(fan.locator('.ro .big')).toHaveText('67');
    for (const host of [`${COVER}`, `${FAN}`]) {
      const glass = await glassOf(page, host);
      expect(glass?.count, host).toBe(1);
      expect(glass?.backdropFilter, host).toMatch(/blur\(\d+(\.\d+)?px\)/);
      expect(glass?.borderRadius, host).toBe('40px');
    }
    expect(errors).toEqual([]);
  });

  test('a cover drag writes once, at release', async ({ page }) => {
    await openHarness(page, 'cover=hall');
    const drag = await beginDrag(page, page.locator(`${COVER} [role="slider"]`).first());
    await drag.to(70, 700);
    expect(await callsOf(page)).toEqual([]);
    await drag.up();
    await expect.poll(async () => (await callsOf(page)).length).toBe(1);
    await page.waitForTimeout(700);
    const calls = await callsOf(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ service: 'set_cover_position', data: { entity_id: 'cover.hall_window' } });
    expect(Math.abs((calls[0]!.data.position as number) - 70)).toBeLessThanOrEqual(1);
  });

  test('a fan drag shows the snapped step while dragging and writes snapped values, the last one at release', async ({ page }) => {
    await openHarness(page, 'fan=pct33');
    const slider = page.locator(`${FAN} [role="slider"]`).first();
    const drag = await beginDrag(page, slider);
    await drag.to(52, 300);
    await expect(slider).toHaveAttribute('aria-valuenow', '66');
    await drag.to(95, 300);
    await drag.up();
    await expect.poll(async () => (await callsOf(page, 'fan.set_percentage')).at(-1)?.data.percentage).toBe(100);
    for (const c of await callsOf(page, 'fan.set_percentage')) expect([33, 66, 100]).toContain(c.data.percentage);
  });

  test('keyboard: ArrowUp on the cover pill sends one set_cover_position, on the fan pill the next step', async ({ page }) => {
    await openHarness(page, 'cover=hall&fan=ten');
    await page.locator(`${COVER} [role="slider"]`).first().focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await callsOf(page, 'cover.set_cover_position')).length).toBe(1);
    expect((await callsOf(page, 'cover.set_cover_position'))[0]!.data.position).toBe(11);
    const fan = page.locator(`${FAN} [role="slider"]`).first();
    await fan.focus();
    await page.keyboard.press('ArrowUp');
    await expect(fan).toHaveAttribute('aria-valuenow', '50');
    await expect.poll(async () => (await callsOf(page, 'fan.set_percentage')).at(-1)?.data.percentage).toBe(50);
  });
});

test.describe('smoke: sheet History', () => {
  for (const [what, opener, entity, card] of [
    ['cover tile', '#hist-tile button.body', 'cover.hall_window', 'liquid-home-cover-card'],
    ['fan badge', '#hist-badge button.pill', 'fan.living_room_fan', 'liquid-home-fan-card'],
  ] as const) {
    test(`History from a ${what} closes the sheet, then pushes /history?entity_id=${entity}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.addInitScript(() => {
        const w = window as unknown as { __order: string[] };
        w.__order = [];
        const push = history.pushState.bind(history);
        history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
          const sheet = document.querySelector('liquid-home-sheet') as (HTMLElement & { isOpen?: boolean }) | null;
          w.__order.push(`pushState ${url} (sheet open: ${sheet?.isOpen})`);
          push(data, unused, url);
        };
        window.addEventListener('location-changed', () => w.__order.push('location-changed'));
      });
      await domainsPage(page, 'show=history&glass=dark');
      await page.locator(opener).click();
      await expect(page.locator(`liquid-home-sheet ${card}`)).toBeVisible();
      await page.locator('liquid-home-sheet button.history').click();
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __order: string[] }).__order.slice()))
        .toEqual([`pushState /history?entity_id=${entity} (sheet open: false)`, 'location-changed']);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/history?entity_id=${entity}`);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('smoke: 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a long-name badge of each domain is capped at the row width with an ellipsis, in a row with min-width: fit-content', async ({ page }) => {
    const errors = watchErrors(page);
    await domainsPage(page, 'show=badges-ha&glass=dark');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expectCapped(await measureBadges(page, '.badges.ha'), 5, 3);
    expect(errors).toEqual([]);
  });

  test('the room tile value of a long preset word is clipped on the x axis with an ellipsis, and the y axis stays open', async ({ page }) => {
    const errors = watchErrors(page);
    await domainsPage(page, 'show=room&glass=dark');
    const tiles = await page.locator('#room-card').evaluate((host) => {
      const root = host.shadowRoot!;
      return Array.from(root.querySelectorAll<HTMLElement>('.room .big')).map((el) => {
        const cs = getComputedStyle(el);
        return { text: el.textContent ?? '', overflowX: cs.overflowX, overflowY: cs.overflowY, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, client: el.clientWidth, scroll: el.scrollWidth };
      });
    });
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    for (const t of tiles) {
      expect(t.overflowX, `${t.text}: overflow-x`).toBe('clip');
      expect(t.overflowY, `${t.text}: overflow-y stays visible, descenders are not cut`).toBe('visible');
      expect(t.textOverflow, t.text).toBe('ellipsis');
      expect(t.whiteSpace, t.text).toBe('nowrap');
    }
    const word = tiles.find((t) => /preset/i.test(t.text));
    expect(word, 'the preset word is shown as a tile value').toBeDefined();
    expect(word!.scroll, 'the long word is wider than its tile value').toBeGreaterThan(word!.client);
    // The tile did not grow with the word: the page does not scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

/** 0.4: the media card, on the built bundle with a controllable player (pages/media.ts). */
test.describe('smoke: media card', () => {
  test('renders glass with its sliders, an artwork layer over a decoded cover and no console error', async ({ page }) => {
    await routeArt(page, 'a.png', 'dark');
    const { errors } = await openMedia(page, { art: '/__art/a.png', echo: 'none' });
    await expect(page.locator('#card [role="slider"][aria-label="Position, Kitchen speaker"]')).toBeVisible();
    await expect(page.locator('#card [role="slider"][aria-label="Volume, Kitchen speaker"]')).toBeVisible();
    await expect(page.locator('#card h2')).toHaveText('Kitchen speaker');
    await expect.poll(async () => (await artState(page)).imgs.length).toBe(1);
    const glass = await glassOf(page, '#card');
    expect(glass?.count, 'one backdrop-filter, the art layer has none').toBe(1);
    expect(glass?.backdropFilter).toMatch(/blur\(\d+(\.\d+)?px\)/);
    expect(glass?.borderRadius).toBe('40px');
    expect(errors).toEqual([]);
  });

  test('a seek drag sends nothing while it runs and one media_seek at release', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    const before = Number(await seekBar(page).getAttribute('aria-valuenow'));
    const drag = await beginSeekDrag(page, seekBar(page));
    await drag.by(60, 8);
    await page.waitForTimeout(500);
    expect(await mediaCalls(page)).toEqual([]);
    await drag.up();
    await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(1);
    await page.waitForTimeout(400);
    const calls = await mediaCalls(page);
    expect(calls).toHaveLength(1);
    expect((calls[0]!.data.seek_position as number) - before).toBeGreaterThan(55);
  });

  test('chip menu by keyboard: arrows send nothing, Space selects once and the menu does not reopen, Enter selects once', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    const chip = page.locator('#card .chip[data-chip="source"]');
    await chip.focus();
    await page.keyboard.press('Space');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    expect(await mediaCalls(page), 'moving focus sends nothing').toEqual([]);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mediaCalls(page, 'select_source')).length).toBe(1);
    await page.waitForTimeout(700);
    expect(await mediaCalls(page), 'one call, no second one from the keyup').toHaveLength(1);
    expect((await mediaCalls(page))[0]!.data.source).toBe('HDMI 2');
    await expect(chip, 'the menu did not reopen').toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#card .mitem')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await mediaCalls(page, 'select_source')).length).toBe(2);
    await page.waitForTimeout(500);
    expect(await mediaCalls(page)).toHaveLength(2);
    expect((await mediaCalls(page))[1]!.data.source).toBe('YouTube');
    await expect(chip).toBeFocused();
  });

  test('a cover that answers 404 falls back to plain glass and the card still works', async ({ page }) => {
    await routeArt(page, 'missing.png', 'dark', { status: 404 });
    const { errors } = await openMedia(page, { art: '/__art/missing.png', echo: 'none' });
    await page.waitForTimeout(1500);
    expect(await artState(page)).toEqual({ layer: false, layerOn: false, imgs: [] });
    const glass = await glassOf(page, '#card');
    expect(glass?.count).toBe(1);
    await page.locator('#card button[data-action="play"]').click();
    await expect.poll(async () => (await mediaCalls(page, 'media_pause')).length).toBe(1);
    expect(errors.filter((e) => !/Failed to load resource|NS_ERROR|404/.test(e))).toEqual([]);
  });
});
