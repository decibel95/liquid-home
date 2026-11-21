import { defineConfig } from 'playwright/test';

/**
 * End-to-end suite (plan P18). Run `npm run e2e` (or `npx playwright test -c test/e2e/playwright.config.ts`).
 * One worker: the frame-time measurement must not share the machine with other specs.
 * The web server (scripts/e2e/serve.mjs) serves the dev harness, the test pages and the two bundles
 * (dist/liquid-home.js, built when missing, and the Liquid Climate v0.11.1 asset from the cache directory).
 */
const PORT = Number(process.env.LH_E2E_PORT || 5291);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
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
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    colorScheme: 'dark',
    launchOptions: { args: ['--force-color-profile=srgb', '--font-render-hinting=none'] },
  },
});
