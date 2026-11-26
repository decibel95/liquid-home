import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { newPage, openScene } from './browser.mjs';

/** Scene names of dev/media.ts. Each renders a -light and a -dark still. */
export const SCENES = ['light', 'cover', 'fan', 'tile', 'badge', 'room'];

/** README scenes: rendered into docs/public/media/readme/ as <scene>-light.png and <scene>-dark.png. */
export const README_SCENES = ['hero', 'modes', 'sheet'];

const stageSize = (page) =>
  page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });

/** Wait for transitions to finish and park the endless animations, so re-runs match. */
const settle = (page) => page.evaluate(() => window.__media.settle());

async function stillOnce(browser, base, out, { scene, theme, name }) {
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

/** A renderer crash (out of memory on a busy machine) is retried up to three times with a fresh page. */
async function still(browser, base, out, job) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await stillOnce(browser, base, out, job);
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`  ${job.name}: ${String(err.message).split('\n')[0]}, retrying`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

/** Without names: every still. With names: only the stills of those scenes. */
export async function renderStills(browser, base, out, only = []) {
  console.log('Stills');
  for (const scene of [...SCENES, ...README_SCENES]) {
    if (only.length && !only.includes(scene)) continue;
    const dir = README_SCENES.includes(scene) ? join(out, 'readme') : out;
    await mkdir(dir, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await still(browser, base, dir, { scene, theme, name: `${scene}-${theme}` });
    }
  }
}
