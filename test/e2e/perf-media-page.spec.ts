import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'playwright/test';
import { watchErrors } from './support/helpers';

/**
 * The real-device perf page (plan 2.12): scripts/e2e/build-perf-media.mjs inlines the built bundle, the Inter font and the
 * six covers into one HTML file. Opened here from file://, so the check also proves it needs no server and no other file:
 * every request is a data URL or the file itself, the cards render with their artwork, and one short scroll test returns
 * numbers. The viewport is tall so every card is on screen (the art layer loads only for cards on screen). (The fps values of this run mean nothing: software rendering on a CI machine. The page is for a phone.)
 */
test('the standalone perf page runs from one file: cards with artwork, the Inter font from the bundle, a scroll test with numbers', async ({ browser }) => {
  test.setTimeout(90_000);
  const out = join(mkdtempSync(join(tmpdir(), 'lh-perf-media-')), 'perf-media.html');
  execFileSync(process.execPath, [resolve('scripts/e2e/build-perf-media.mjs'), '--out', out], { stdio: 'pipe' });
  const context = await browser.newContext({ viewport: { width: 900, height: 5000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = watchErrors(page);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(pathToFileURL(out).href);
  await page.waitForFunction(() => (window as unknown as { __perfMedia?: { ready: boolean } }).__perfMedia?.ready === true);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('liquid-home-media-card'));
    const tiles = Array.from(document.querySelectorAll('liquid-home-tile'));
    return {
      cards: cards.length,
      tiles: tiles.length,
      art: [...cards, ...tiles].filter((el) => el.shadowRoot?.querySelector('.art img')).length,
      font: document.fonts.check("14px 'Liquid Inter'") || Array.from(document.fonts).some((f) => /inter/i.test(f.family) && f.status === 'loaded'),
      families: Array.from(document.fonts).map((f) => `${f.family}:${f.status}`),
    };
  });
  console.log(`[perf page] ${JSON.stringify(info)}`);
  expect(info).toMatchObject({ cards: 4, tiles: 4, art: 8 });
  expect(info.font, `fonts: ${info.families.join(', ')}`).toBe(true);
  // The backdrop toggle drops the art layers and brings them back.
  await page.locator('#bd').click();
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('liquid-home-media-card')).filter((el) => el.shadowRoot?.querySelector('.art img')).length)).toBe(0);
  await page.locator('#bd').click();
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('liquid-home-media-card')).filter((el) => el.shadowRoot?.querySelector('.art img')).length)).toBe(4);
  // The card count buttons.
  await page.locator('#counts button[data-n="8"]').click();
  await expect(page.locator('liquid-home-media-card')).toHaveCount(8);
  await page.locator('#counts button[data-n="4"]').click();
  await expect(page.locator('liquid-home-media-card')).toHaveCount(4);
  // One scroll test through the button (5 s).
  await page.locator('#run-one').click();
  await expect(page.locator('#result')).toContainText(/average [\d.]+ fps, worst 250 ms window [\d.]+ fps/, { timeout: 20_000 });
  const result = await page.locator('#result').textContent();
  console.log(`[perf page] ${result}`);
  expect(result).toMatch(/4 cards, backdrop on/);
  expect(result).toMatch(/Criterion \(4 cards, backdrop on\): (MET|NOT MET)/);
  const external = requests.filter((u) => !u.startsWith('data:') && !u.startsWith('file:'));
  expect(external, 'no request leaves the file').toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
