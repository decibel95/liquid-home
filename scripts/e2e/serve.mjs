#!/usr/bin/env node
/**
 * Static and dev server of the end-to-end suite (started by test/e2e/playwright.config.ts, or by hand).
 *
 * - Vite dev server on the repository root: the dev harness (/dev/) and the test pages (/test/e2e/pages/).
 * - /__bundles/liquid-home.js: the built dist/liquid-home.js (built first when it is missing, or with LH_E2E_REBUILD=1).
 * - /__bundles/liquid-climate.js: the Liquid Climate v0.11.1 release asset, downloaded and sha256-checked into the
 *   cache directory (scripts/e2e/fetch-lc.mjs). The Liquid Climate repository is never built or touched.
 *
 * Port: $LH_E2E_PORT, default 5291. Binds to 127.0.0.1 only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import { ensureLc } from './fetch-lc.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = resolve(ROOT, 'dist', 'liquid-home.js');

export async function startE2eServer({ port = Number(process.env.LH_E2E_PORT || 5291) } = {}) {
  const lcFile = await ensureLc();
  if (!existsSync(DIST) || process.env.LH_E2E_REBUILD === '1') {
    console.log('[e2e] building dist/liquid-home.js');
    await build({ root: ROOT, logLevel: 'warn' });
  }
  const bundles = {
    '/__bundles/liquid-home.js': DIST,
    '/__bundles/liquid-climate.js': lcFile,
  };
  const server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    // No HMR socket: a page under measurement must not be reloaded by a file change.
    server: { port, strictPort: true, host: '127.0.0.1', open: false, hmr: false },
    plugins: [
      {
        name: 'lh-e2e-bundles',
        configureServer(s) {
          s.middlewares.use((req, res, next) => {
            const file = bundles[(req.url ?? '').split('?')[0]];
            if (!file) return next();
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(readFileSync(file));
          });
        },
      },
    ],
  });
  await server.listen();
  console.log(`[e2e] serving on http://127.0.0.1:${port} (liquid-climate from ${lcFile})`);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startE2eServer().then(
    (server) => {
      const stop = () => server.close().finally(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
