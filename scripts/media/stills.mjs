import { join } from 'node:path';
import { newPage, openScene } from './browser.mjs';

/** Scene names of dev/media.ts. Each renders a -light and a -dark still. */
export const SCENES = ['light', 'tile', 'badge', 'room'];

const stageSize = (page) =>
  page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });

/** Wait for transitions to finish and park the endless animations, so re-runs match. */
const settle = (page) => page.evaluate(() => window.__media.settle());

async function still(browser, base, out, { scene, theme, name }) {
  const page = await newPage(browser);
  try {
    await openScene(page, base, { scene, theme, lang: 'en' });
    await settle(page);
    const size = await stageSize(page);
    await page.mouse.move(size.width + 50, size.height + 50);
    await settle(page);
    await page.screenshot({ path: join(out, `${name}.png`), clip: { x: 0, y: 0, ...size } });
    console.log(`  ${name}.png`);
  } finally {
    await page.context().close();
  }
}

/** Without names: every still. With names: only the stills of those scenes. */
export async function renderStills(browser, base, out, only = []) {
  console.log('Stills');
  for (const scene of SCENES) {
    if (only.length && !only.includes(scene)) continue;
    for (const theme of ['light', 'dark']) {
      await still(browser, base, out, { scene, theme, name: `${scene}-${theme}` });
    }
  }
}
