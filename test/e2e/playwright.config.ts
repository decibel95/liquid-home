import { defineConfig } from 'playwright/test';

/**
 * End-to-end suite (plan P18). Run `npm run e2e` (or `npx playwright test -c test/e2e/playwright.config.ts`).
 * One worker: the frame-time measurement must not share the machine with other specs.
 * The web server (scripts/e2e/serve.mjs) serves the dev harness, the test pages and the two bundles
 * (dist/liquid-home.js, built when missing, and the Liquid Climate v0.12.1 asset from the cache directory).
 */
/**
 * Browsers (D-10). Chromium runs the full suite. Firefox and WebKit run only the smoke subset (smoke.spec.ts). They are
 * off by default because they need their browsers and system libraries (`npx playwright install --with-deps firefox webkit`,
 * as CI does; on a host without those libraries use the official image, see scripts/e2e/browsers-docker.sh):
 *   LH_E2E_BROWSERS=chromium,firefox,webkit npm run e2e      (everything)
 *   LH_E2E_BROWSERS=firefox,webkit npm run e2e               (the smoke subset in the two other engines)
 */
const BROWSERS = (process.env.LH_E2E_BROWSERS || 'chromium').split(',').map((b) => b.trim()).filter(Boolean);
const PROJECTS = {
  chromium: { name: 'chromium', use: { browserName: 'chromium' as const, launchOptions: { args: ['--force-color-profile=srgb', '--font-render-hinting=none'] } } },
  firefox: { name: 'firefox', testMatch: '**/smoke.spec.ts', use: { browserName: 'firefox' as const } },
  webkit: { name: 'webkit', testMatch: '**/smoke.spec.ts', use: { browserName: 'webkit' as const } },
};
for (const b of BROWSERS) if (!(b in PROJECTS)) throw new Error(`LH_E2E_BROWSERS: unknown browser "${b}" (chromium, firefox, webkit)`);

const PORT = Number(process.env.LH_E2E_PORT || 5291);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  projects: BROWSERS.map((b) => PROJECTS[b as keyof typeof PROJECTS]),
  outputDir: '../../node_modules/.cache/lh-e2e/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  webServer: {
    command: 'node scripts/e2e/serve.mjs',
    cwd: '../..',
    url: `${BASE}/test/e2e/pages/blank.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
  },
  use: {
    baseURL: BASE,
    headless: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    colorScheme: 'dark',
  },
});
