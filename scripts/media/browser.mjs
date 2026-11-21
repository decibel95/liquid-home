import { chromium } from 'playwright';

/**
 * Launch headless Chromium. Falls back to an installed Chrome or Edge when the Playwright
 * browser is missing, and explains how to install it when neither works.
 */
export async function launchBrowser() {
  const args = ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'];
  const attempts = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  let first;
  for (const extra of attempts) {
    try {
      return await chromium.launch({ headless: true, args, ...extra });
    } catch (err) {
      first ??= err;
    }
  }
  throw new Error(
    'No browser found. Run "npx playwright install chromium" (or install Google Chrome), then run "npm run media" again.\n' +
      `First error: ${first?.message?.split('\n')[0]}`,
  );
}

/** A page at the given device scale factor and reduced motion off, so the animations play. */
export async function newPage(browser, { width = 1600, height = 1000, scale = 2 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  return page;
}

/** Open a media scene and wait until it has rendered. Returns the stage size in CSS px. */
export async function openScene(page, base, query) {
  const qs = new URLSearchParams(query).toString();
  await page.goto(`${base}/dev/media.html?${qs}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mediaReady === true, null, { timeout: 30000 });
  const box = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  await page.setViewportSize(box);
  return box;
}
