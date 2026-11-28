import { expect, test, type Page } from 'playwright/test';
import { glassOf } from './support/helpers';
import {
  activeIntervals,
  artImages,
  artState,
  beginSeekDrag,
  card,
  intervalTicks,
  mediaCalls,
  openMedia,
  routeArt,
  seekBar,
  setVisibility,
  volumePill,
  watchArtImages,
} from './support/media';

/**
 * H9 (plan 2.4, 2.11, 2.12): the media card on the built bundle, on a controllable fake player (pages/media.ts). Volume
 * throttle and hold, seek writes, the ticker, the artwork layer and the chip menu. Chromium only; the Firefox and WebKit
 * subset is in smoke.spec.ts.
 */
const valueNow = async (page: Page, which: 'volume' | 'seek') => Number(await (which === 'volume' ? volumePill(page) : seekBar(page)).getAttribute('aria-valuenow'));
const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

test.describe('glass and art layer cost', () => {
  test('the card and the tile each draw exactly one backdrop-filter, with the artwork layer showing', async ({ page }) => {
    await routeArt(page, 'a.png', 'dark');
    await openMedia(page, { art: '/__art/a.png', echo: 'none', show: 'card,tile' });
    await expect.poll(async () => (await artState(page)).imgs.length).toBe(1);
    await expect.poll(async () => (await artState(page, '#tile')).imgs.length).toBe(1);
    for (const host of ['#card', '#tile']) {
      const glass = await glassOf(page, host);
      expect(glass?.count, `${host}: the art layer uses filter: blur on an img, never a second backdrop-filter`).toBe(1);
    }
    const blur = await card(page).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('.art img')!).filter);
    expect(blur).toMatch(/blur\(30px\)/);
  });
});

test.describe('volume pill', () => {
  test('a 1.5 s drag sends a throttled stream: a leading write at once, at most one per 300 ms, the final value last', async ({ page }) => {
    const { errors } = await openMedia(page, { echo: 'none' });
    const pill = volumePill(page);
    const box = (await pill.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const t0 = Date.now();
    const pageT0 = await page.evaluate(() => performance.now());
    // 15 moves, 100 ms apart, 8 px each: 120 px down on a 280 px pill is about 43 %.
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(x, y + i * 8);
      await sleep(page, 100);
    }
    const dragMs = Date.now() - t0;
    const shown = await valueNow(page, 'volume');
    await page.mouse.up();
    await expect.poll(async () => (await mediaCalls(page, 'volume_set')).length).toBeGreaterThanOrEqual(3);
    await sleep(page, 400);
    const calls = await mediaCalls(page, 'volume_set');
    console.log(`[volume throttle] drag ${dragMs} ms, ${calls.length} volume_set calls at ${calls.map((c) => Math.round(c.t - calls[0]!.t)).join(', ')} ms, final ${calls.at(-1)!.data.volume_level}`);
    expect(calls.length, 'a 1.5 s drag').toBeLessThanOrEqual(Math.floor(dragMs / 300) + 2);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // The first write comes with the first preview (the first 8 px move), not after a throttle window.
    expect(calls[0]!.t - pageT0, 'leading write').toBeLessThan(250);
    // Spacing of the throttled writes: at least one window apart (the release flush is the only one allowed to come sooner).
    for (let i = 1; i < calls.length - 1; i++) expect(calls[i]!.t - calls[i - 1]!.t, `gap ${i}`).toBeGreaterThanOrEqual(270);
    expect(calls.at(-1)!.data.volume_level).toBeCloseTo(shown / 100, 2);
    expect(calls.every((c) => c.data.entity_id === 'media_player.e2e_player')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('after release the pill holds the sent value until the player echoes it', async ({ page }) => {
    await openMedia(page, { echo: 800 });
    const pill = volumePill(page);
    const box = (await pill.boundingBox())!;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2 + 84, { steps: 6 });
    const target = await valueNow(page, 'volume');
    await page.mouse.up();
    expect(target).toBeLessThan(40);
    await sleep(page, 400);
    expect(await valueNow(page, 'volume'), 'before the echo').toBe(target);
    await sleep(page, 1200);
    expect(await valueNow(page, 'volume'), 'after the echo').toBe(target);
    expect((await mediaCalls(page, 'volume_set')).at(-1)!.data.volume_level).toBeCloseTo(target / 100, 2);
  });

  test('without an echo the held value ends after write_hold and the pill shows the reported volume again', async ({ page }) => {
    await openMedia(page, { echo: 'none', hold: 1 });
    const pill = volumePill(page);
    const box = (await pill.boundingBox())!;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2 + 84, { steps: 6 });
    const target = await valueNow(page, 'volume');
    await page.mouse.up();
    await sleep(page, 500);
    expect(await valueNow(page, 'volume'), 'inside the hold').toBe(target);
    await expect.poll(() => valueNow(page, 'volume'), { timeout: 4000 }).toBe(60);
  });

  test('a held arrow key writes a throttled stream and keyup flushes the final value', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    await volumePill(page).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.down('ArrowUp');
    expect(await valueNow(page, 'volume'), 'arrows move 2 %').toBe(70);
    await page.keyboard.up('ArrowUp');
    await expect.poll(async () => (await mediaCalls(page, 'volume_set')).at(-1)?.data.volume_level).toBeCloseTo(0.7, 2);
    const calls = await mediaCalls(page, 'volume_set');
    expect(calls.length).toBeLessThanOrEqual(3);
  });

  for (const [key, expected] of [
    ['PageUp', 70],
    ['PageDown', 50],
    ['Home', 0],
    ['End', 100],
  ] as const) {
    test(`${key} on the pill writes ${expected} % once`, async ({ page }) => {
      await openMedia(page, { echo: 'none' });
      await volumePill(page).focus();
      await page.keyboard.press(key);
      await expect.poll(async () => (await mediaCalls(page, 'volume_set')).length).toBe(1);
      await sleep(page, 500);
      const calls = await mediaCalls(page, 'volume_set');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.data.volume_level).toBeCloseTo(expected / 100, 2);
      await expect(volumePill(page)).toHaveAttribute('aria-valuetext', `${expected}%`);
    });
  }
});

test.describe('seek bar', () => {
  test('a drag sends nothing while it runs and exactly one media_seek at release', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    const before = await valueNow(page, 'seek');
    const drag = await beginSeekDrag(page, seekBar(page));
    await drag.by(60, 8);
    await sleep(page, 700);
    expect(await mediaCalls(page), 'during the drag').toEqual([]);
    await drag.up();
    await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(1);
    await sleep(page, 500);
    const calls = await mediaCalls(page);
    expect(calls).toHaveLength(1);
    const target = calls[0]!.data.seek_position as number;
    // 60 px of a 266 px bar over 300 s is about 68 s.
    expect(target - before).toBeGreaterThan(55);
    expect(target - before).toBeLessThan(80);
  });

  test('a key gesture sends one media_seek at keyup: three held arrows are +15 s in one call, the next gesture one more call', async ({ page }) => {
    await openMedia(page, { state: 'paused', echo: 'none' });
    await seekBar(page).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.down('ArrowRight');
    expect(await mediaCalls(page), 'before keyup').toEqual([]);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(1);
    expect((await mediaCalls(page, 'media_seek'))[0]!.data.seek_position).toBe(60);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(2);
    await sleep(page, 400);
    const calls = await mediaCalls(page, 'media_seek');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.data.seek_position).toBe(55);
  });

  for (const [key, expected] of [
    ['PageUp', 75],
    ['PageDown', 15],
    ['Home', 0],
    ['End', 300],
  ] as const) {
    test(`${key} seeks to ${expected} s (10 % of 5:00 is 30 s) in one call`, async ({ page }) => {
      await openMedia(page, { state: 'paused', echo: 'none' });
      await seekBar(page).focus();
      await page.keyboard.press(key);
      await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(1);
      await sleep(page, 300);
      const calls = await mediaCalls(page);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.data.seek_position).toBe(expected);
    });
  }

  test('the slider announces elapsed and total time', async ({ page }) => {
    await openMedia(page, { state: 'paused', echo: 'none' });
    await expect(seekBar(page)).toHaveAttribute('aria-label', 'Position, Kitchen speaker');
    await expect(seekBar(page)).toHaveAttribute('aria-valuemax', '300');
    await expect(seekBar(page)).toHaveAttribute('aria-valuetext', '0:45 of 5:00');
  });
});

test.describe('ticker', () => {
  const open = (page: Page, q: Record<string, string | number> = {}) => openMedia(page, { echo: 'none', ...q }, { timers: true, visibility: true });

  test('a playing card runs one 1 s interval and the position moves each second', async ({ page }) => {
    await open(page);
    expect(await activeIntervals(page)).toBe(1);
    const before = await valueNow(page, 'seek');
    await sleep(page, 2600);
    const after = await valueNow(page, 'seek');
    expect(after - before).toBeGreaterThanOrEqual(2);
    expect(await intervalTicks(page)).toBeGreaterThanOrEqual(2);
  });

  test('a paused card has no timer and nothing ticks', async ({ page }) => {
    await open(page, { state: 'paused' });
    expect(await activeIntervals(page)).toBe(0);
    const before = await valueNow(page, 'seek');
    await sleep(page, 2200);
    expect(await intervalTicks(page)).toBe(0);
    expect(await valueNow(page, 'seek')).toBe(before);
  });

  test('pausing the player stops the timer, playing starts it again', async ({ page }) => {
    await open(page);
    expect(await activeIntervals(page)).toBe(1);
    await page.evaluate(() => (window as unknown as { __media: { patch(a: object, s?: string): void } }).__media.patch({}, 'paused'));
    await expect.poll(() => activeIntervals(page)).toBe(0);
    await page.evaluate(() => (window as unknown as { __media: { patch(a: object, s?: string): void } }).__media.patch({}, 'playing'));
    await expect.poll(() => activeIntervals(page)).toBe(1);
  });

  test('a hidden page (visibilitychange) stops the timer and no tick runs; showing it again restarts it', async ({ page }) => {
    await open(page);
    expect(await activeIntervals(page)).toBe(1);
    await setVisibility(page, 'hidden');
    await expect.poll(() => activeIntervals(page)).toBe(0);
    const ticks = await intervalTicks(page);
    const seek = await valueNow(page, 'seek');
    await sleep(page, 2200);
    expect(await intervalTicks(page), 'ticks while hidden').toBe(ticks);
    expect(await valueNow(page, 'seek'), 'position while hidden').toBe(seek);
    await setVisibility(page, 'visible');
    await expect.poll(() => activeIntervals(page)).toBe(1);
    // The position catches up with the clock on the first render after the restart.
    await expect.poll(() => valueNow(page, 'seek')).toBeGreaterThan(seek + 1);
  });

  test('a card scrolled off screen stops its timer and no tick runs; scrolled back it restarts', async ({ page }) => {
    await open(page);
    expect(await activeIntervals(page)).toBe(1);
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect.poll(() => activeIntervals(page), { timeout: 3000 }).toBe(0);
    const ticks = await intervalTicks(page);
    await sleep(page, 2200);
    expect(await intervalTicks(page), 'ticks off screen').toBe(ticks);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => activeIntervals(page), { timeout: 3000 }).toBe(1);
  });

  test('a seek drag stops the timer while it runs and restarts it at release', async ({ page }) => {
    await open(page);
    const drag = await beginSeekDrag(page, seekBar(page));
    await drag.by(20, 4);
    await expect.poll(() => activeIntervals(page)).toBe(0);
    await drag.up();
    await expect.poll(() => activeIntervals(page)).toBe(1);
  });
});

test.describe('artwork layer', () => {
  test('decode first: no img and no layer while the cover loads, then one decoded img', async ({ page }) => {
    const a = await routeArt(page, 'a.png', 'dark', { delayMs: 1200 });
    await openMedia(page, { art: '/__art/a.png', echo: 'none' });
    await watchArtImages(page);
    await sleep(page, 500);
    expect(await artState(page), 'while loading').toEqual({ layer: false, layerOn: false, imgs: [] });
    await expect.poll(async () => (await artState(page)).imgs.length, { timeout: 5000 }).toBe(1);
    const imgs = await artImages(page);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toMatchObject({ complete: true });
    expect(imgs[0]!.naturalWidth).toBeGreaterThan(0);
    expect(a.count(), 'one request for the card and the tile together').toBe(1);
  });

  test('card, tile and sheet of one player load the cover once', async ({ page }) => {
    const a = await routeArt(page, 'a.png', 'dark');
    await openMedia(page, { art: '/__art/a.png', echo: 'none' });
    await expect.poll(async () => (await artState(page)).imgs.length).toBe(1);
    await page.locator('#tile button.body').click();
    await expect(page.locator('liquid-home-sheet liquid-home-media-card')).toBeVisible();
    await expect.poll(async () => (await artState(page, 'sheet')).imgs.length).toBe(1);
    await sleep(page, 300);
    expect(a.count()).toBe(1);
  });

  test('a new cover crossfades: the old one stays until the new one is decoded, two imgs for the 0.8 s fade, then only the new one', async ({ page }) => {
    await routeArt(page, 'a.png', 'dark');
    await routeArt(page, 'b.png', 'saturated', { delayMs: 700 });
    await openMedia(page, { art: '/__art/a.png', echo: 'none' });
    await expect.poll(async () => (await artState(page)).imgs.length).toBe(1);
    await sleep(page, 1000);
    await watchArtImages(page);
    await page.evaluate(() => (window as unknown as { __media: { setPicture(u: string): void } }).__media.setPicture('/__art/b.png'));
    await sleep(page, 350);
    const loading = await artState(page);
    expect(loading.imgs.map((i) => i.src), 'old cover stays while the new one loads').toEqual(['a.png']);
    await expect.poll(async () => (await artState(page)).imgs.length, { timeout: 4000 }).toBe(2);
    const fading = await artState(page);
    expect(fading.imgs.map((i) => i.src)).toEqual(['a.png', 'b.png']);
    await expect.poll(async () => (await artState(page)).imgs.map((i) => i.src), { timeout: 3000 }).toEqual(['b.png']);
    const imgs = await artImages(page);
    expect(imgs.map((i) => i.src)).toEqual(['/__art/b.png']);
    expect(imgs.every((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  });

  test('3 s cap: a cover that does not decode within 3 s leaves plain glass, and the late arrival is not shown', async ({ page }) => {
    await routeArt(page, 'slow.png', 'dark', { delayMs: 4500 });
    await openMedia(page, { art: '/__art/slow.png', echo: 'none' });
    await watchArtImages(page);
    await sleep(page, 2500);
    expect(await artState(page), 'before the cap').toMatchObject({ layer: false, imgs: [] });
    await sleep(page, 1200);
    expect(await artState(page), 'after the cap (3.7 s)').toEqual({ layer: false, layerOn: false, imgs: [] });
    await sleep(page, 2300);
    expect(await artState(page), 'after the late response (6 s)').toEqual({ layer: false, layerOn: false, imgs: [] });
    expect(await artImages(page)).toEqual([]);
    // The glass is still the card's single glass: the card has no art layer, so it is plain glass.
    await expect(card(page).locator('section')).toBeVisible();
  });

  test('a 404 falls back to plain glass without a page error', async ({ page }) => {
    await routeArt(page, 'missing.png', 'dark', { status: 404 });
    const { errors } = await openMedia(page, { art: '/__art/missing.png', echo: 'none' });
    await watchArtImages(page);
    await sleep(page, 1500);
    expect(await artState(page)).toEqual({ layer: false, layerOn: false, imgs: [] });
    expect(await artImages(page)).toEqual([]);
    expect(errors.filter((e) => !/Failed to load resource/.test(e)), 'only the browser resource message is allowed').toEqual([]);
  });

  test('no player picture draws plain glass, and adding one later shows it', async ({ page }) => {
    await routeArt(page, 'late.png', 'busy');
    await openMedia(page, { art: 'none', echo: 'none' });
    expect(await artState(page)).toEqual({ layer: false, layerOn: false, imgs: [] });
    await page.evaluate(() => (window as unknown as { __media: { setPicture(u: string): void } }).__media.setPicture('/__art/late.png'));
    await expect.poll(async () => (await artState(page)).imgs.length).toBe(1);
  });

  test('no undecoded img ever enters the DOM over a good cover, a 404, a slow cover and a good one again', async ({ page }) => {
    await routeArt(page, 'a.png', 'dark');
    await routeArt(page, 'b.png', 'light', { delayMs: 400 });
    await routeArt(page, 'gone.png', 'dark', { status: 404 });
    await routeArt(page, 'c.png', 'saturated', { delayMs: 200 });
    await openMedia(page, { art: '/__art/a.png', echo: 'none' });
    await watchArtImages(page);
    const set = (url: string) => page.evaluate((u) => (window as unknown as { __media: { setPicture(u: string): void } }).__media.setPicture(u), url);
    for (const url of ['/__art/b.png', '/__art/gone.png', '/__art/c.png']) {
      await set(url);
      await sleep(page, 1300);
    }
    const imgs = await artImages(page);
    console.log(`[art decode] images that entered the DOM: ${imgs.map((i) => `${i.src.split('/').pop()}(complete=${i.complete}, w=${i.naturalWidth})`).join(', ')}`);
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(imgs.filter((i) => !i.complete || i.naturalWidth === 0)).toEqual([]);
    expect(imgs.map((i) => i.src.split('/').pop())).not.toContain('gone.png');
  });

  test('look.motion minimal swaps the cover without a fade (one img at all times)', async ({ page }) => {
    await routeArt(page, 'a.png', 'dark');
    await routeArt(page, 'b.png', 'saturated');
    await openMedia(page, { art: '/__art/a.png', echo: 'none', motion: 'minimal' });
    await expect.poll(async () => (await artState(page)).imgs.length).toBe(1);
    await page.evaluate(() => (window as unknown as { __media: { setPicture(u: string): void } }).__media.setPicture('/__art/b.png'));
    await expect.poll(async () => (await artState(page)).imgs.map((i) => i.src)).toContain('b.png');
    const transition = await card(page).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('.art img')!).transitionDuration);
    expect(transition).toBe('0s');
  });
});

test.describe('chip menu', () => {
  const chip = (page: Page, key: 'source' | 'soundMode') => page.locator(`#card .chip[data-chip="${key}"]`);
  const rows = (page: Page) => page.locator('#card .mitem');
  const focusedValue = (page: Page) =>
    page.evaluate(() => (document.querySelector('#card')!.shadowRoot!.activeElement as HTMLElement | null)?.dataset.value ?? document.querySelector('#card')!.shadowRoot!.activeElement?.getAttribute('data-chip'));

  test('opening puts focus on the current row; arrows, Home and End move focus and send nothing', async ({ page }) => {
    const { errors } = await openMedia(page, { echo: 'none' });
    await chip(page, 'source').focus();
    await page.keyboard.press('Enter');
    await expect(chip(page, 'source')).toHaveAttribute('aria-expanded', 'true');
    await expect(chip(page, 'source')).toHaveAttribute('aria-haspopup', 'menu');
    expect(await focusedValue(page)).toBe('HDMI 1');
    await expect(rows(page).first()).toHaveAttribute('role', 'menuitemradio');
    await expect(rows(page).first()).toHaveAttribute('aria-checked', 'true');
    const seen: unknown[] = [];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) {
      await page.keyboard.press(key);
      seen.push(await focusedValue(page));
    }
    // 4 rows: Down x4 wraps to the first; Up wraps to the last; End is the last, Home the first.
    expect(seen).toEqual(['HDMI 2', 'Netflix', 'YouTube', 'HDMI 1', 'YouTube', 'YouTube', 'HDMI 1']);
    expect(await mediaCalls(page), 'arrow keys never send').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Enter on a row sends one select_source, closes the menu and returns focus to the chip', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    await chip(page, 'source').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await mediaCalls(page)).toEqual([]);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await mediaCalls(page, 'select_source')).length).toBe(1);
    await sleep(page, 500);
    const calls = await mediaCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.data).toMatchObject({ entity_id: 'media_player.e2e_player', source: 'Netflix' });
    await expect(chip(page, 'source')).toHaveAttribute('aria-expanded', 'false');
    expect(await focusedValue(page)).toBe('source');
  });

  test('Space on a row selects once and the menu does not reopen on keyup', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    await chip(page, 'soundMode').focus();
    await page.keyboard.press('Space');
    await expect(chip(page, 'soundMode')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mediaCalls(page, 'select_sound_mode')).length).toBe(1);
    await sleep(page, 600);
    expect(await mediaCalls(page)).toHaveLength(1);
    expect((await mediaCalls(page))[0]!.data.sound_mode).toBe('Movie');
    await expect(chip(page, 'soundMode')).toHaveAttribute('aria-expanded', 'false');
    await expect(rows(page)).toHaveCount(0);
  });

  test('Enter on the row that is already selected sends nothing', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    await chip(page, 'source').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await sleep(page, 300);
    expect(await mediaCalls(page)).toEqual([]);
    await expect(chip(page, 'source')).toHaveAttribute('aria-expanded', 'false');
  });

  test('a click on a row sends one call', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    await chip(page, 'source').click();
    await rows(page).filter({ hasText: 'YouTube' }).click();
    await expect.poll(async () => (await mediaCalls(page, 'select_source')).length).toBe(1);
    expect((await mediaCalls(page))[0]!.data.source).toBe('YouTube');
  });

  test('Escape closes without a call and returns focus; Tab closes; a click outside closes', async ({ page }) => {
    await openMedia(page, { echo: 'none' });
    await chip(page, 'source').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(chip(page, 'source')).toHaveAttribute('aria-expanded', 'false');
    expect(await focusedValue(page)).toBe('source');
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveCount(4);
    await page.keyboard.press('Tab');
    await expect(chip(page, 'source')).toHaveAttribute('aria-expanded', 'false');
    await chip(page, 'source').click();
    await expect(rows(page)).toHaveCount(4);
    await page.locator('#below').click({ position: { x: 20, y: 20 } });
    await expect(rows(page)).toHaveCount(0);
    expect(await mediaCalls(page), 'closing never sends').toEqual([]);
  });
});
