import { expect, test, type Page } from 'playwright/test';
import { writeReport } from './support/helpers';
import { beginSeekDrag, mediaCalls, openMedia, seekBar } from './support/media';

/**
 * Plan 2.11: the media card on a right-to-left page (`dir="rtl"` on the document element). The seek fill grows from the
 * right, Left increases and Right decreases (Up and Down never swap), a drag to the left seeks forward, the time labels
 * stay left to right, and the open chip menu is inspected (core `.mitem` uses `text-align: left`; the findings are printed
 * and written to the report, with a screenshot).
 */
const open = (page: Page, q: Record<string, string | number> = {}) => openMedia(page, { dir: 'rtl', state: 'paused', echo: 'none', ...q });

test.describe('seek bar in RTL', () => {
  test('the page is right to left and the fill grows from the right edge', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#card')!).direction)).toBe('rtl');
    const geo = await seekBar(page).evaluate((bar) => {
      const b = bar.getBoundingClientRect();
      const f = bar.querySelector('.lc-slider-fill')!.getBoundingClientRect();
      return { barLeft: b.left, barRight: b.right, fillLeft: f.left, fillRight: f.right, width: b.width };
    });
    // 45 of 300 s: the fill is 15 % of the bar, anchored at the right edge.
    expect(Math.abs(geo.fillRight - geo.barRight), 'fill ends at the right edge').toBeLessThanOrEqual(2);
    expect(geo.fillLeft - geo.barLeft, 'fill leaves the left part empty').toBeGreaterThan(geo.width * 0.7);
    expect((geo.fillRight - geo.fillLeft) / geo.width).toBeCloseTo(0.15, 1);
  });

  test('ArrowLeft seeks forward and ArrowRight backward; ArrowUp forward and ArrowDown backward', async ({ page }) => {
    await open(page);
    await seekBar(page).focus();
    const seen: number[] = [];
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const before = (await mediaCalls(page, 'media_seek')).length;
      await page.keyboard.press(key);
      await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(before + 1);
      seen.push((await mediaCalls(page, 'media_seek')).at(-1)!.data.seek_position as number);
    }
    // 45 +5 (Left), -5 (Right), +5 (Up), -5 (Down), each from the position the previous gesture left.
    expect(seen).toEqual([50, 45, 50, 45]);
  });

  test('a drag to the left seeks forward and a drag to the right seeks backward', async ({ page }) => {
    await open(page);
    const left = await beginSeekDrag(page, seekBar(page));
    await left.by(-40, 6);
    await left.up();
    await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(1);
    expect((await mediaCalls(page, 'media_seek'))[0]!.data.seek_position as number, 'drag left').toBeGreaterThan(45 + 30);
    const right = await beginSeekDrag(page, seekBar(page));
    await right.by(30, 6);
    await right.up();
    await expect.poll(async () => (await mediaCalls(page, 'media_seek')).length).toBe(2);
    const first = (await mediaCalls(page, 'media_seek'))[0]!.data.seek_position as number;
    expect((await mediaCalls(page, 'media_seek'))[1]!.data.seek_position as number, 'drag right').toBeLessThan(first - 20);
  });

  test('the elapsed and remaining time stay left to right, elapsed first from the bar start (the right edge)', async ({ page }) => {
    await open(page);
    const spans = await page.locator('#card .times span').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { text: e.textContent, dir: e.getAttribute('dir'), direction: getComputedStyle(e).direction, left: Math.round(r.left), right: Math.round(r.right) };
      }),
    );
    console.log(`[rtl] time labels: ${JSON.stringify(spans)}`);
    expect(spans.map((s) => s.text)).toEqual(['0:45', '-4:15']);
    expect(spans.map((s) => s.direction)).toEqual(['ltr', 'ltr']);
    expect(spans.map((s) => s.dir)).toEqual(['ltr', 'ltr']);
    // The elapsed label is at the start of the bar, which is the right edge in RTL.
    expect(spans[0]!.right, 'elapsed on the right').toBeGreaterThan(spans[1]!.right);
  });

  test('the value text and the minus sign of the remaining time are plain text with no bidi mark', async ({ page }) => {
    await open(page);
    await expect(seekBar(page)).toHaveAttribute('aria-valuetext', '0:45 of 5:00');
    expect(await page.locator('#card .times span').nth(1).textContent()).toBe('-4:15');
  });
});

test.describe('volume pill and playback row in RTL', () => {
  test('the volume pill is vertical: ArrowUp raises it and ArrowLeft/ArrowRight do not swap', async ({ page }) => {
    await open(page);
    const pill = page.locator('#card [role="slider"][aria-label^="Volume"]');
    await pill.focus();
    await page.keyboard.press('ArrowUp');
    await expect(pill).toHaveAttribute('aria-valuenow', '62');
    await page.keyboard.press('ArrowRight');
    await expect(pill).toHaveAttribute('aria-valuenow', '64');
    await page.keyboard.press('ArrowLeft');
    await expect(pill).toHaveAttribute('aria-valuenow', '62');
  });
});

test.describe('chip menu in RTL', () => {
  test('the open menu rows and their labels, with Hebrew and Arabic sources (findings printed and reported)', async ({ page }) => {
    await open(page, { sources: 'HDMI 1,עברית שמע,قناة عربية,Netflix' });
    await page.locator('#card .chip[data-chip="source"]').click();
    await expect(page.locator('#card .mitem')).toHaveCount(4);
    const rows = await page.locator('#card .mitem').evaluateAll((els) =>
      els.map((row) => {
        const rr = row.getBoundingClientRect();
        const label = row.querySelector('.mlabel')!;
        const range = document.createRange();
        range.selectNodeContents(label);
        const tr = range.getBoundingClientRect();
        const check = row.querySelector('.mcheck')?.getBoundingClientRect();
        const cs = getComputedStyle(row);
        return {
          text: label.textContent,
          rowDirection: cs.direction,
          rowTextAlign: cs.textAlign,
          labelDir: label.getAttribute('dir'),
          labelTextAlign: getComputedStyle(label).textAlign,
          rowLeft: Math.round(rr.left),
          rowRight: Math.round(rr.right),
          textLeft: Math.round(tr.left),
          textRight: Math.round(tr.right),
          checkLeft: check ? Math.round(check.left) : null,
          checkRight: check ? Math.round(check.right) : null,
        };
      }),
    );
    const header = await page.locator('#card .mhead').evaluate((el) => ({ text: el.textContent, align: getComputedStyle(el).textAlign, direction: getComputedStyle(el).direction }));
    for (const r of rows) {
      const side = Math.abs(r.textLeft - r.rowLeft) < Math.abs(r.rowRight - r.textRight) ? 'left' : 'right';
      console.log(`[rtl menu] "${r.text}": row direction ${r.rowDirection}, row text-align ${r.rowTextAlign}, label dir ${r.labelDir}, text at the ${side} of the row (${r.textLeft}..${r.textRight} in ${r.rowLeft}..${r.rowRight}), check ${r.checkLeft}..${r.checkRight}`);
    }
    console.log(`[rtl menu] header ${JSON.stringify(header)}`);
    await writeReport('rtl-menu.json', { rows, header });
    await page.locator('#card .mpanel').screenshot({ path: 'node_modules/.cache/lh-e2e/reports/rtl-menu.png' });
    // What is pinned: the page is RTL, every row is its own direction (rows follow the page), the menu opens with all four sources.
    expect(rows.map((r) => r.rowDirection)).toEqual(['rtl', 'rtl', 'rtl', 'rtl']);
    expect(rows.map((r) => r.text)).toEqual(['HDMI 1', 'עברית שמע', 'قناة عربية', 'Netflix']);
  });
});
