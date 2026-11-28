import { expect, test, type CDPSession, type Page } from 'playwright/test';
import { mediaCalls, openMedia, seekBar } from './support/media';

/**
 * Touch on the seek bar (`touch-action: pan-y`, core horizontal slider). A pointercancel commits the last previewed value
 * (prototype behaviour, core `endPointer`), so the question is whether a vertical page scroll that starts on the bar
 * seeks. Real touch events through CDP (Input.dispatchTouchEvent), phone viewport, the page scrolls 1800 px.
 * The numbers are printed; the asserts pin what must hold: a purely vertical scroll is not a seek and the page scrolls.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function swipe(page: Page, cdp: CDPSession, from: { x: number; y: number }, steps: { dx: number; dy: number }[]): Promise<void> {
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id: 1 }] });
  let x = from.x;
  let y = from.y;
  await send('touchStart', x, y);
  for (const s of steps) {
    x += s.dx;
    y += s.dy;
    await send('touchMove', x, y);
    await page.waitForTimeout(16);
  }
  await send('touchEnd');
  await page.waitForTimeout(500);
}

async function setup(page: Page) {
  await openMedia(page, { echo: 'none', state: 'paused' });
  const cdp = await page.context().newCDPSession(page);
  const box = (await seekBar(page).boundingBox())!;
  return { cdp, from: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, box };
}

const moves = (n: number, dx: number, dy: number) => Array.from({ length: n }, () => ({ dx, dy }));

test('a vertical touch scroll that starts on the seek bar scrolls the page and sends no media_seek', async ({ page }) => {
  const { cdp, from } = await setup(page);
  // Finger moves up (the page scrolls down), straight up: 20 moves of 10 px.
  await swipe(page, cdp, from, moves(20, 0, -10));
  const scrollY = await page.evaluate(() => window.scrollY);
  const seeks = (await mediaCalls(page, 'media_seek')).length;
  console.log(`[touch] vertical scroll from the seek bar: scrollY ${scrollY}, media_seek calls ${seeks}`);
  expect(scrollY, 'the page scrolled').toBeGreaterThan(50);
  expect(seeks).toBe(0);
});

for (const dx of [2, 6, 12]) {
  test(`a diagonal scroll from the seek bar with ${dx} px sideways drift before the page takes over is measured`, async ({ page }) => {
    const { cdp, from } = await setup(page);
    await swipe(page, cdp, from, [{ dx, dy: -3 }, ...moves(20, 0, -10)]);
    const scrollY = await page.evaluate(() => window.scrollY);
    const calls = await mediaCalls(page, 'media_seek');
    console.log(`[touch] diagonal scroll from the seek bar, ${dx} px sideways: scrollY ${scrollY}, media_seek calls ${calls.length}${calls.length ? `, seek_position ${calls.map((c) => c.data.seek_position)} (from 45)` : ''}`);
    expect(scrollY, 'the page scrolled').toBeGreaterThan(50);
    expect(calls.length, 'a cancelled gesture is not a seek').toBe(0);
  });
}

test('a horizontal swipe on the seek bar is a seek: one media_seek at the finger up, the page does not scroll', async ({ page }) => {
  const { cdp, from } = await setup(page);
  await swipe(page, cdp, from, moves(10, 8, 0));
  const scrollY = await page.evaluate(() => window.scrollY);
  const calls = await mediaCalls(page, 'media_seek');
  console.log(`[touch] horizontal swipe on the seek bar: scrollY ${scrollY}, media_seek calls ${calls.length}${calls.length ? `, seek_position ${calls.map((c) => c.data.seek_position)}` : ''}`);
  expect(scrollY).toBe(0);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.data.seek_position as number).toBeGreaterThan(60);
});
