#!/usr/bin/env node
/**
 * Render the README and docs media into docs/public/media. See scripts/media/README.md.
 * Usage: npm run media [-- stills [scene ...] | animations [name ...] | demo]   (no argument renders everything)
 */
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { launchBrowser } from './browser.mjs';
import { renderStills, SCENES } from './stills.mjs';
import { renderAnimations, ANIMATIONS } from './animations.mjs';
import { CAPTURE_ROOT } from './capture.mjs';
import { renderDemo } from './demo.mjs';

const OUT = join(ROOT, 'docs', 'public', 'media');
const only = process.argv[2];

const STEPS = ['stills', 'animations', 'demo'];
function usage(message) {
  console.error(`${message}\nUsage: npm run media [-- stills [scene ...] | animations [name ...] | demo]\nScenes: ${SCENES.join(', ')}\nAnimations: ${Object.keys(ANIMATIONS).join(', ')}`);
  process.exit(1);
}
if (only && !STEPS.includes(only)) usage(`Unknown step "${only}".`);
const unknown = process.argv.slice(3).filter((n) => !Object.hasOwn(ANIMATIONS, n));
if (only === 'animations' && unknown.length) usage(`Unknown animation "${unknown.join('", "')}".`);
const unknownScenes = process.argv.slice(3).filter((n) => !SCENES.includes(n));
if (only === 'stills' && unknownScenes.length) usage(`Unknown scene "${unknownScenes.join('", "')}".`);
if (only !== 'animations' && only !== 'stills' && process.argv.length > 3) usage('Only the stills and animations steps take names.');

async function main() {
  if (!only) {
    await mkdir(OUT, { recursive: true });
    for (const f of await readdir(OUT)) await rm(join(OUT, f), { recursive: true, force: true });
  }
  await mkdir(OUT, { recursive: true });
  const server = await startServer();
  let browser;
  let closing;
  const shutdown = () =>
    (closing ??= (async () => {
      await browser?.close().catch(() => {});
      await server.close().catch(() => {});
    })());
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => shutdown().finally(() => process.exit(130)));
  }
  try {
    browser = await launchBrowser();
    if (!only || only === 'stills') await renderStills(browser, server.base, OUT, process.argv.slice(3));
    if (!only || only === 'animations') await renderAnimations(browser, server.base, OUT, process.argv.slice(3));
    if (!only || only === 'demo') await renderDemo(browser, server.base, OUT);
  } finally {
    await shutdown();
    await rm(CAPTURE_ROOT, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
