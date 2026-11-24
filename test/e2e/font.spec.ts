import { createHash } from 'node:crypto';
import { expect, test, type Response } from 'playwright/test';
import { watchErrors, stubFavicon } from './support/helpers';

/**
 * The Inter font ships next to the bundle: the built liquid-home.js registers 'Liquid Inter' from
 * ./liquid-inter.woff2 (with the bundle's own query), the browser loads it and the card text uses it.
 */
const HACSTAG = 'e2e-font-1'; // as test/e2e/pages/font.ts
const FONT_SHA256 = 'ec9d62021ca5940db5f5b700613aebf24d379039553795447cd407cd35b253d7'; // liquid-core fonts/liquid-inter.woff2

test('the built card loads the shipped Inter font and its text uses it', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFavicon(page);
  const fontResponses: Response[] = [];
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.endsWith('/liquid-inter.woff2')) fontResponses.push(r);
  });

  await page.goto('/test/e2e/pages/font.html');
  await page.waitForFunction(() => (window as unknown as { __font: { done: boolean } }).__font.done, null, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __font: { error?: string } }).__font.error)).toBeUndefined();

  // Nothing below asks for the font explicitly: the card text must be what triggers the load. Record the state
  // (face loaded, woff2 requested) before any document.fonts.load(), after giving the card text time to trigger it.
  const state = () =>
    page.evaluate(() => {
      const unquote = (s: string) => s.replace(/^["']|["']$/g, '');
      return [...document.fonts].filter((f) => unquote(f.family) === 'Liquid Inter').map((f) => f.status);
    });
  await expect.poll(async () => (await state()).includes('loaded'), { timeout: 10_000 }).toBe(true);
  const requestedByCardText = fontResponses.length;
  expect(requestedByCardText).toBeGreaterThan(0);

  const result = await page.evaluate(async () => {
    const unquote = (s: string) => s.replace(/^["']|["']$/g, '');
    const faces = () => [...document.fonts].filter((f) => unquote(f.family) === 'Liquid Inter');
    await document.fonts.ready;

    const card = document.getElementById('card')!;
    const title = card.shadowRoot!.querySelector('h2')!;
    return {
      styles: document.querySelectorAll('style#liquid-core-font').length,
      faces: faces().map((f) => ({ family: unquote(f.family), status: f.status, weight: f.weight })),
      titleText: title.textContent?.trim() ?? '',
      titleFamily: getComputedStyle(title).fontFamily,
      check600: document.fonts.check('600 16px "Liquid Inter"'),
    };
  });

  expect(result.styles).toBe(1);
  expect(result.faces.length).toBe(1);
  expect(result.faces[0].status).toBe('loaded');
  expect(result.titleText.length).toBeGreaterThan(0);
  expect(result.titleFamily.replace(/["']/g, '').startsWith('Liquid Inter')).toBe(true);
  expect(result.check600).toBe(true);

  // The font came from next to the bundle, with the bundle's query, as font/woff2, byte for byte the core file.
  expect(fontResponses.length).toBe(1);
  const res = fontResponses[0];
  const url = new URL(res.url());
  expect(url.pathname).toBe('/__bundles/liquid-inter.woff2');
  expect(url.search).toBe(`?hacstag=${HACSTAG}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('font/woff2');
  expect(createHash('sha256').update(await res.body()).digest('hex')).toBe(FONT_SHA256);
  expect(errors).toEqual([]);
});

test('a missing font file falls back to the system font without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.route(/\/liquid-inter\.woff2(\?|$)/, (route) => route.fulfill({ status: 404, body: 'not found' }));

  await page.goto('/test/e2e/pages/font.html');
  await page.waitForFunction(() => (window as unknown as { __font: { done: boolean } }).__font.done, null, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __font: { error?: string } }).__font.error)).toBeUndefined();

  const result = await page.evaluate(async () => {
    const unquote = (s: string) => s.replace(/^["']|["']$/g, '');
    const title = document.getElementById('card')!.shadowRoot!.querySelector('h2')!;
    await document.fonts.load('600 16px "Liquid Inter"').catch(() => []);
    await document.fonts.ready;
    return {
      titleText: title.textContent?.trim() ?? '',
      titleFamily: getComputedStyle(title).fontFamily,
      statuses: [...document.fonts].filter((f) => unquote(f.family) === 'Liquid Inter').map((f) => f.status),
      width: title.getBoundingClientRect().width,
    };
  });

  // The card renders, the face is declared but failed to load, and the stack still names Liquid Inter first,
  // so the next family (the system font) is what draws the text.
  expect(result.titleText.length).toBeGreaterThan(0);
  expect(result.width).toBeGreaterThan(0);
  expect(result.titleFamily.replace(/["']/g, '').startsWith('Liquid Inter')).toBe(true);
  expect(result.statuses).toEqual(['error']);
  // The only expected console error is the resource 404 itself; page errors would show as 'pageerror: ...'.
  const unexpected = errors.filter((e) => !/^console\.error: Failed to load resource: the server responded with a status of 404/.test(e));
  expect(unexpected).toEqual([]);
});

test('the licence is served next to the font', async ({ request }) => {
  const res = await request.get('/__bundles/liquid-inter-OFL.txt');
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('SIL OPEN FONT LICENSE');
  expect(text).toContain('Inter');
});
