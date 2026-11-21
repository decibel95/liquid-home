import { join } from 'node:path';
import { newPage, openScene } from './browser.mjs';
import { startCapture } from './capture.mjs';
import { encodeGif, encodeWebp, mb } from './encode.mjs';
import { centerOf, pointer, sleep } from './input.mjs';

const HOLD = 450;

const slider = 'liquid-home-light-card .lc-slider';

/**
 * Reusable interaction segments. Every one ends in the state it started in, so any sequence
 * of them loops without a jump.
 */
export const steps = {
  /** Drag the brightness pill up by about 60 % of its height and back down to where it started (relative drag). */
  async dragSlider(page, p) {
    const box = await page.locator(slider).first().boundingBox();
    if (!box) throw new Error(`No box for ${slider}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.8;
    const up = box.height * 0.6;
    await p.dragThrough([{ x, y }, { x, y: y - up * 0.5 }, { x, y: y - up }, { x, y: y - up * 0.5 }, { x, y }], 360);
    await sleep(600);
  },
};

/**
 * Animation definitions: name -> { scene, first?(page) -> {x, y}, run(page, p), pointer?, webpMax? }.
 */
export const ANIMATIONS = {
  'light-drag': {
    scene: 'light',
    first: (page) => centerOf(page, slider).then((c) => ({ x: c.x + 120, y: c.y + 120 })),
    run: (page, p) => steps.dragSlider(page, p),
  },
};

export async function renderAnimations(browser, base, out, only = []) {
  console.log('Animations');
  for (const [name, def] of Object.entries(ANIMATIONS)) {
    if (only.length && !only.includes(name)) continue;
    const page = await newPage(browser);
    try {
      await openScene(page, base, { scene: def.scene, theme: 'light', lang: 'en', cursor: '1' });
      await page.waitForTimeout(1200);
      const p = await pointer(page, def.first ? await def.first(page) : { x: -50, y: -50 });
      const cap = await startCapture(page, name);
      await sleep(HOLD + 300);
      if (def.pointer !== false) await p.show();
      await def.run(page, p);
      if (def.pointer !== false) await p.hide();
      await sleep(HOLD + 300);
      const done = await cap.stop();
      const gif = await encodeGif(done, join(out, `${name}.gif`));
      const webp = await encodeWebp(done, join(out, `${name}.webp`), def.webpMax ? { maxBytes: def.webpMax } : {});
      console.log(`  ${name}: ${done.frames.length} frames, gif ${gif.width}px ${gif.fps}fps ${mb(gif.size)} MB, webp ${webp.width}px ${webp.fps}fps ${mb(webp.size)} MB`);
    } finally {
      await page.context().close();
    }
  }
}
