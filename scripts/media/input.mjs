/** Human-paced pointer input, so recordings look like someone using the card. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The pointer starts hidden at `start`; show() fades it in, hide() fades it out. */
export async function pointer(page, start) {
  await page.mouse.move(start.x, start.y);
  let pos = { ...start };
  const api = {
    start,
    async show() {
      await page.evaluate(() => window.__media.pointer(true));
      await sleep(350);
    },
    async hide() {
      await page.evaluate(() => window.__media.pointer(false));
      await sleep(400);
    },
    get pos() {
      return pos;
    },
    /** Glide to (x, y) over `ms`, one mouse event per ~16 ms. */
    async move(x, y, ms = 500) {
      const from = pos;
      const steps = Math.max(2, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const e = ease(i / steps);
        await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
        await sleep(ms / steps);
      }
      pos = { x, y };
    },
    async down() {
      await page.mouse.down();
      await sleep(90);
    },
    async up() {
      await page.mouse.up();
    },
    async click(x, y, ms = 450) {
      await api.move(x, y, ms);
      await api.down();
      await api.up();
      await sleep(120);
    },
    /** Glide along a list of points while the button is held. */
    async dragThrough(points, msPerLeg = 500) {
      await api.move(points[0].x, points[0].y, 450);
      await api.down();
      for (const p of points.slice(1)) await api.move(p.x, p.y, msPerLeg);
      await api.up();
    },
  };
  return api;
}

/** Centre of an element found by a (shadow-piercing) selector. */
export async function centerOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`No box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
