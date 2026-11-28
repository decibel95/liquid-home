import { expect, test, type Browser, type CDPSession, type Page } from 'playwright/test';
import { percentile, stubFavicon, watchErrors, writeReport } from './support/helpers';

/**
 * Plan 2.10: frame time during a 4 s drag of the main control on a dashboard-like page, on the built bundles. Frame time
 * is the requestAnimationFrame delta. Two kinds of criterion:
 * - Ratio against Liquid Climate (software rendering, the default here): the same page with Liquid Climate cards only,
 *   same quantities and layout (1 dial, 12 tiles, 1 cluster, 6 badges, climates idle). Liquid Home p95 must be at most
 *   max(Liquid Climate p95 x 1.10, Liquid Climate p95 + 16.7 ms): 10 % or one frame of headroom, whichever is larger,
 *   because software rendering quantizes frame times to multiples of 16.7 ms. Asserted by default;
 *   LH_E2E_PERF_ENFORCE=0 turns the assertion off (the numbers are still reported).
 * - Absolute budgets (p95 at most 16.7 ms unthrottled, 33 ms with 4x CPU throttling) for runners with a GPU: asserted
 *   when LH_E2E_GPU=1, otherwise reported.
 * The numbers are always printed and written to the report (environment, idle baseline, frame counts included).
 *
 * Environment caveat: headless Chromium without a GPU renders in software, a worst case for backdrop-filter, and
 * quantizes frame times to multiples of 16.7 ms.
 */
const DRAG_MS = 4000;
const BUDGET_P95 = { unthrottled: 16.7, throttled4x: 33 } as const;
const RATIO_LIMIT = 1.1;
const FRAME_MS = 16.7;
/** The largest Liquid Home p95 the ratio criterion allows for a given Liquid Climate p95. */
const ratioAllowance = (lcP95: number) => Math.max(lcP95 * RATIO_LIMIT, lcP95 + FRAME_MS);
const REPEATS = 3;

interface FrameStats {
  frames: number;
  p50: number;
  p95: number;
  max: number;
  over16_7: number;
  over33: number;
  longTasks: number;
  longTaskMs: number;
}

function stats(deltas: number[], longTasks: { duration: number }[]): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    frames: sorted.length,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    max: round(sorted[sorted.length - 1] ?? NaN),
    over16_7: sorted.filter((d) => d > 16.7).length,
    over33: sorted.filter((d) => d > 33).length,
    longTasks: longTasks.length,
    longTaskMs: round(longTasks.reduce((n, t) => n + t.duration, 0)),
  };
}

async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __rec: { deltas: number[]; tasks: { duration: number }[]; stop: boolean; po?: PerformanceObserver } };
    w.__rec = { deltas: [], tasks: [], stop: false };
    try {
      w.__rec.po = new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__rec.tasks.push({ duration: e.duration })));
      w.__rec.po.observe({ entryTypes: ['longtask'] });
    } catch {
      /* long task timing unsupported: the counts stay 0 */
    }
    let last = 0;
    const tick = (t: number) => {
      if (last) w.__rec.deltas.push(t - last);
      last = t;
      if (!w.__rec.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopRecording(page: Page): Promise<{ deltas: number[]; tasks: { duration: number }[] }> {
  return page.evaluate(() => {
    const w = window as unknown as { __rec: { deltas: number[]; tasks: { duration: number }[]; stop: boolean; po?: PerformanceObserver } };
    w.__rec.stop = true;
    w.__rec.po?.disconnect();
    return { deltas: w.__rec.deltas, tasks: w.__rec.tasks };
  });
}

/** Drags the page's main control (`window.__dragPath`) back and forth for `ms`, with a pointer move every few ms. */
async function drag(page: Page, ms: number): Promise<number> {
  const at = (phase: number) => page.evaluate((p) => (window as unknown as { __dragPath: (p: number) => { x: number; y: number } }).__dragPath(p), phase);
  const start0 = await at(0);
  await page.mouse.move(start0.x, start0.y);
  await page.mouse.down();
  const start = Date.now();
  let moves = 0;
  while (Date.now() - start < ms) {
    const pos = await at(((Date.now() - start) / ms) * Math.PI * 2);
    await page.mouse.move(pos.x, pos.y);
    moves++;
    await page.waitForTimeout(4);
  }
  await page.mouse.up();
  return moves;
}

async function measure(page: Page, cdp: CDPSession, rate: number, repeats = 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  // Warm-up drag (not measured), then per repeat an idle baseline and the measured drag.
  await drag(page, 800);
  await page.waitForTimeout(1200);
  const runs: { moves: number; idle: FrameStats; drag: FrameStats }[] = [];
  for (let i = 0; i < repeats; i++) {
    await startRecording(page);
    await page.waitForTimeout(1000);
    const idle = await stopRecording(page);
    await startRecording(page);
    const moves = await drag(page, DRAG_MS);
    const dragged = await stopRecording(page);
    runs.push({ moves, idle: stats(idle.deltas, idle.tasks), drag: stats(dragged.deltas, dragged.tasks) });
    await page.waitForTimeout(500);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const byP95 = [...runs].sort((a, b) => a.drag.p95 - b.drag.p95);
  const median = byP95[Math.floor(byP95.length / 2)]!;
  return { ...median, runs: runs.map((r) => ({ frames: r.drag.frames, p50: r.drag.p50, p95: r.drag.p95, max: r.drag.max, moves: r.moves, idleP95: r.idle.p95 })) };
}

/** LH_E2E_GPU=1: the runner has a GPU, assert the absolute budgets. LH_E2E_PERF_ENFORCE=0: do not assert the ratio against Liquid Climate. */
const GPU = process.env.LH_E2E_GPU === '1';
const ENFORCE_RATIO = process.env.LH_E2E_PERF_ENFORCE !== '0';

const results: Record<string, unknown> = {};

async function openPerfPage(browser: Browser, query: string) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto(`/test/e2e/pages/perf.html?${query}`);
  await page.waitForFunction(() => (window as unknown as { __perfReady: boolean }).__perfReady === true, null, { timeout: 30_000 });
  const cdp = await context.newCDPSession(page);
  await page.waitForTimeout(1500);
  return { page, cdp, errors, close: () => context.close() };
}

test.afterAll(async () => {
  await writeReport('performance.json', results);
});

test('records the renderer the numbers come from', async ({ page }) => {
  await page.goto('/test/e2e/pages/blank.html');
  const info = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'no webgl', userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency };
  });
  results.environment = { ...info, softwareRendering: /swiftshader|llvmpipe|software/i.test(info.renderer), gpuBudgetsAsserted: GPU, ratioAsserted: ENFORCE_RATIO };
  console.log(`renderer: ${JSON.stringify(results.environment)}`);
});

/**
 * `idle`: the Liquid Climate entities are off, so its two cards are static glass. This is the run the budgets apply to.
 * `none`: Liquid Home on its own, and `heating`: Liquid Climate cards heating (endless flame and rising-particle
 * animations on top of their glass) are measured and reported without a budget, to show where the cost sits.
 */
const VARIANTS = [
  { lc: 'idle', budget: true },
  { lc: 'none', budget: false },
  { lc: 'heating', budget: false },
] as const;

for (const { lc, budget } of VARIANTS) {
  test.describe(`frame time during a 2 s slider drag, Liquid Climate cards: ${lc}`, () => {
    let ctx: Awaited<ReturnType<typeof openPerfPage>>;

    test.beforeAll(async ({ browser }) => {
      ctx = await openPerfPage(browser, `lc=${lc}`);
    });
    test.afterAll(async () => {
      await ctx.close();
    });

    test('the dashboard has the expected cards and one backdrop-filter per card', async () => {
      const counts = await ctx.page.evaluate(() => {
        const count = (sel: string) => document.querySelectorAll(sel).length;
        let glass = 0;
        const visit = (root: ParentNode) => {
          for (const el of Array.from(root.children)) {
            const f = getComputedStyle(el).backdropFilter;
            if (f && f !== 'none') glass++;
            if (el.shadowRoot) visit(el.shadowRoot);
            visit(el);
          }
        };
        visit(document.body);
        return {
          light: count('liquid-home-light-card'),
          tiles: count('liquid-home-tile'),
          room: count('liquid-home-room'),
          badges: count('liquid-home-badge'),
          lcCards: count('liquid-climate-card') + count('liquid-climate-tile'),
          glass,
        };
      });
      results[`${lc}.layout`] = counts;
      const lcCards = lc === 'none' ? 0 : 2;
      expect(counts).toMatchObject({ light: 1, tiles: 12, room: 1, badges: 6, lcCards });
      // 1 light card + 12 tiles + 1 room card + 6 badges, plus the Liquid Climate dial and tile.
      expect(counts.glass).toBe(1 + 12 + 1 + 6 + lcCards);
    });

    for (const [name, rate, limit] of [
      ['unthrottled', 1, BUDGET_P95.unthrottled],
      ['4x CPU throttling', 4, BUDGET_P95.throttled4x],
    ] as const) {
      test(`${name}${budget ? `: p95 frame time is at most ${limit} ms (asserted with LH_E2E_GPU=1)` : ' (reported, no budget)'}`, async () => {
        const r = await measure(ctx.page, ctx.cdp, rate);
        results[`${lc}.${rate === 1 ? 'unthrottled' : 'throttled4x'}`] = r;
        console.log(`[lc ${lc}] ${name} drag: ${JSON.stringify(r.drag)}  (${r.moves} mouse moves)  idle: ${JSON.stringify(r.idle)}`);
        expect(r.drag.frames).toBeGreaterThan(5);
        if (budget && GPU) expect(r.drag.p95).toBeLessThanOrEqual(limit);
      });
    }

    test('the page raised no console error', async () => {
      expect(ctx.errors).toEqual([]);
    });
  });
}

/** Cost by group (reported only): the same drag with fewer Liquid Home cards mounted, and with look.blur 0. */
const SCALING = [
  { name: 'light card only', query: 'groups=light' },
  { name: 'light card + 6 badges', query: 'groups=light,badges' },
  { name: 'light card + 12 tiles', query: 'groups=light,tiles' },
  { name: 'light card + room card', query: 'groups=light,room' },
  { name: 'all Liquid Home cards', query: 'groups=light,tiles,room,badges' },
  { name: 'all Liquid Home cards, look.blur 0', query: 'groups=light,tiles,room,badges&blur=0' },
] as const;

test.describe('cost by group, unthrottled (reported, no budget)', () => {
  for (const { name, query } of SCALING) {
    test(name, async ({ browser }) => {
      const ctx = await openPerfPage(browser, `lc=none&${query}`);
      try {
        const r = await measure(ctx.page, ctx.cdp, 1);
        results[`scaling.${name}`] = r.drag;
        console.log(`[scaling] ${name}: ${JSON.stringify(r.drag)}`);
        expect(r.drag.frames).toBeGreaterThan(5);
        expect(ctx.errors).toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  }
});

/**
 * Liquid Home against the Liquid Climate baseline: the same page quantities and layout, one drag of the main control
 * (the light card slider, the dial's temperature ring), median of REPEATS drags per page. The frame counts are in the
 * report. The criterion in software rendering is the ratio of the p95 values.
 */
const COMPARISONS = [
  { name: 'default blur', query: '' },
  { name: 'look.blur 0', query: '&blur=0' },
] as const;

for (const { name, query } of COMPARISONS) {
  for (const [rateName, rate] of [
    ['unthrottled', 1],
    ['4x CPU throttling', 4],
  ] as const) {
    test(`Liquid Home against the Liquid Climate baseline, ${name}, ${rateName}${ENFORCE_RATIO ? ': p95 within the allowance of the Liquid Climate p95' : ' (ratio reported, assert by unsetting LH_E2E_PERF_ENFORCE=0)'}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const measured: Record<'lh' | 'lc', Awaited<ReturnType<typeof measure>>> = {} as never;
      for (const [key, page] of [
        ['lh', `product=lh&lc=none${query}`],
        ['lc', `product=lc${query}`],
      ] as const) {
        const ctx = await openPerfPage(browser, page);
        try {
          measured[key] = await measure(ctx.page, ctx.cdp, rate, REPEATS);
          expect(ctx.errors).toEqual([]);
        } finally {
          await ctx.close();
        }
      }
      const ratio = (a: number, b: number) => Math.round((a / b) * 100) / 100;
      const summary = {
        lh: { frames: measured.lh.drag.frames, p50: measured.lh.drag.p50, p95: measured.lh.drag.p95, max: measured.lh.drag.max, runs: measured.lh.runs },
        lc: { frames: measured.lc.drag.frames, p50: measured.lc.drag.p50, p95: measured.lc.drag.p95, max: measured.lc.drag.max, runs: measured.lc.runs },
        ratioP50: ratio(measured.lh.drag.p50, measured.lc.drag.p50),
        ratioP95: ratio(measured.lh.drag.p95, measured.lc.drag.p95),
        allowanceP95: Math.round(ratioAllowance(measured.lc.drag.p95) * 100) / 100,
        withinLimit: measured.lh.drag.p95 <= ratioAllowance(measured.lc.drag.p95),
      };
      results[`comparison.${name}.${rate === 1 ? 'unthrottled' : 'throttled4x'}`] = summary;
      console.log(`[comparison ${name}, ${rateName}] LH p50 ${summary.lh.p50} p95 ${summary.lh.p95} (${summary.lh.frames} frames) | LC p50 ${summary.lc.p50} p95 ${summary.lc.p95} (${summary.lc.frames} frames) | ratio p50 ${summary.ratioP50} p95 ${summary.ratioP95} (allowance ${summary.allowanceP95}) | LH runs p95 ${summary.lh.runs.map((r) => r.p95)} LC runs p95 ${summary.lc.runs.map((r) => r.p95)}`);
      expect(measured.lh.drag.frames).toBeGreaterThan(5);
      expect(measured.lc.drag.frames).toBeGreaterThan(5);
      if (ENFORCE_RATIO) expect(measured.lh.drag.p95).toBeLessThanOrEqual(ratioAllowance(measured.lc.drag.p95));
    });
  }
}

/** Number of elements with a computed backdrop-filter in the document and in every open shadow tree. */
async function glassCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    let glass = 0;
    const visit = (root: ParentNode) => {
      for (const el of Array.from(root.children)) {
        const f = getComputedStyle(el).backdropFilter;
        if (f && f !== 'none') glass++;
        if (el.shadowRoot) visit(el.shadowRoot);
        visit(el);
      }
    };
    visit(document.body);
    return glass;
  });
}

test('the Liquid Home and Liquid Climate comparison pages have the same number of backdrop-filter elements', async ({ browser }) => {
  const counts: Record<string, number> = {};
  for (const [key, query] of [
    ['lh', 'product=lh&lc=none'],
    ['lc', 'product=lc'],
  ] as const) {
    const ctx = await openPerfPage(browser, query);
    try {
      counts[key] = await glassCount(ctx.page);
    } finally {
      await ctx.close();
    }
  }
  results['comparison.glassCount'] = counts;
  console.log(`[comparison] backdrop-filter elements: LH ${counts.lh}, LC ${counts.lc}`);
  expect(counts.lh).toBe(counts.lc);
});

/** Guards the comparison: the Liquid Climate page must be static glass, and each drag must really move its control. */
test.describe('comparison pages are comparable', () => {
  for (const [key, query] of [
    ['lh', 'product=lh&lc=none'],
    ['lc', 'product=lc'],
  ] as const) {
    test(`${key}: no endless animation runs and a drag changes the control`, async ({ browser }) => {
      const ctx = await openPerfPage(browser, query);
      try {
        const endless = await ctx.page.evaluate(() => {
          const out: string[] = [];
          const visit = (root: Document | ShadowRoot) => {
            for (const el of Array.from(root.querySelectorAll('*'))) if (el.shadowRoot) visit(el.shadowRoot);
            for (const a of root.getAnimations?.() ?? []) {
              if (a.effect?.getComputedTiming().iterations === Infinity) out.push(String((a as CSSAnimation).animationName));
            }
          };
          visit(document);
          return out;
        });
        expect(endless).toEqual([]);
        const read = () =>
          ctx.page.evaluate(() => {
            const host = document.querySelector('liquid-home-light-card, liquid-climate-card')!;
            return host.shadowRoot!.querySelector('[role="slider"]')!.getAttribute('aria-valuenow');
          });
        const at = (phase: number) => ctx.page.evaluate((p) => (window as unknown as { __dragPath: (p: number) => { x: number; y: number } }).__dragPath(p), phase);
        const before = await read();
        const from = await at(0);
        await ctx.page.mouse.move(from.x, from.y);
        await ctx.page.mouse.down();
        const to = await at(Math.PI / 2);
        await ctx.page.mouse.move(to.x, to.y, { steps: 8 });
        const during = await read();
        await ctx.page.mouse.up();
        expect(during, `value before the drag was ${before}`).not.toBe(before);
      } finally {
        await ctx.close();
      }
    });
  }
});

/**
 * Media page (plan 2.12, 0.4): 4 and 12 media cards, each with a tile of the same player, tickers running (every player
 * plays with a seek line), the artwork backdrop on and off (`art=off` removes the covers: plain glass). Same method as the
 * dashboard: the drag of the main control (the volume pill of the first card), p95 frame time, median of REPEATS runs,
 * unthrottled and with 4x CPU throttling, against Liquid Climate with the same glass count (the same number of dial cards,
 * each with a tile). Criteria: the ratio of the p95 values (asserted unless LH_E2E_PERF_ENFORCE=0) and the absolute budgets
 * with LH_E2E_GPU=1. The load average is printed and written to the report: run on an idle machine for release evidence.
 */
const MEDIA_VARIANTS = [
  { cards: 4, art: 'on' },
  { cards: 4, art: 'off' },
  { cards: 12, art: 'on' },
  { cards: 12, art: 'off' },
] as const;

test.describe('media page: 4 and 12 media cards with tiles, backdrop on and off, tickers running', () => {
  const baselines = new Map<string, Awaited<ReturnType<typeof measure>>>();

  test.beforeAll(async () => {
    const { loadavg, cpus } = await import('node:os');
    results['media.environment'] = { loadAverageBefore: loadavg().map((n) => Math.round(n * 100) / 100), cpus: cpus().length };
    console.log(`[media perf] load average before: ${JSON.stringify((results['media.environment'] as { loadAverageBefore: number[] }).loadAverageBefore)} (1, 5, 15 min), ${cpus().length} cpus`);
  });
  test.afterAll(async () => {
    const { loadavg } = await import('node:os');
    (results['media.environment'] as Record<string, unknown>).loadAverageAfter = loadavg().map((n) => Math.round(n * 100) / 100);
    console.log(`[media perf] load average after: ${JSON.stringify((results['media.environment'] as { loadAverageAfter: number[] }).loadAverageAfter)}`);
  });

  for (const { cards, art } of MEDIA_VARIANTS) {
    const label = `${cards} cards, backdrop ${art}`;

    test(`${label}: one backdrop-filter per card and per tile, the art layers match the toggle and the viewport`, async ({ browser }) => {
      const ctx = await openPerfPage(browser, `page=media&lc=none&cards=${cards}&art=${art}`);
      try {
        await ctx.page.waitForTimeout(art === 'on' ? 1500 : 200);
        const counts = await ctx.page.evaluate(() => {
          const count = (sel: string) => document.querySelectorAll(sel).length;
          const w = window as unknown as { __perfReady: boolean };
          const all = Array.from(document.querySelectorAll('liquid-home-media-card, liquid-home-tile'));
          const art = all.filter((el) => el.shadowRoot?.querySelector('.art img')).length;
          // The cover loads only while the card or tile is on screen (plan 2.12), so the cards below the fold have no layer yet.
          const visible = all.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
          }).length;
          return { cards: count('liquid-home-media-card'), tiles: count('liquid-home-tile'), artLayers: art, onScreen: visible, ready: w.__perfReady };
        });
        const glass = await glassCount(ctx.page);
        results[`media.${label}.layout`] = { ...counts, glass };
        console.log(`[media perf] ${label}: ${JSON.stringify({ ...counts, glass })}`);
        expect(counts).toMatchObject({ cards, tiles: cards });
        expect(glass, 'exactly one backdrop-filter per card and per tile').toBe(cards * 2);
        expect(counts.artLayers, 'cards and tiles on screen have their decoded cover, the ones below the fold have not loaded it').toBe(art === 'on' ? counts.onScreen : 0);
        expect(counts.onScreen).toBeGreaterThan(0);
        expect(ctx.errors).toEqual([]);
      } finally {
        await ctx.close();
      }
    });

    for (const [rateName, rate] of [
      ['unthrottled', 1],
      ['4x CPU throttling', 4],
    ] as const) {
      test(`${label}, ${rateName}${ENFORCE_RATIO ? ': p95 within the allowance of the Liquid Climate p95 (same glass count)' : ' (ratio reported)'}`, async ({ browser }) => {
        test.setTimeout(300_000);
        const lhCtx = await openPerfPage(browser, `page=media&lc=none&cards=${cards}&art=${art}`);
        let lh: Awaited<ReturnType<typeof measure>>;
        try {
          if (art === 'on') await lhCtx.page.waitForTimeout(1500);
          lh = await measure(lhCtx.page, lhCtx.cdp, rate, REPEATS);
          expect(lhCtx.errors).toEqual([]);
        } finally {
          await lhCtx.close();
        }
        const key = `${cards}.${rate}`;
        if (!baselines.has(key)) {
          const lcCtx = await openPerfPage(browser, `page=media&product=lc&cards=${cards}`);
          try {
            baselines.set(key, await measure(lcCtx.page, lcCtx.cdp, rate, REPEATS));
            expect(lcCtx.errors).toEqual([]);
          } finally {
            await lcCtx.close();
          }
        }
        const lc = baselines.get(key)!;
        const ratio = (a: number, b: number) => Math.round((a / b) * 100) / 100;
        const summary = {
          lh: { frames: lh.drag.frames, p50: lh.drag.p50, p95: lh.drag.p95, max: lh.drag.max, longTasks: lh.drag.longTasks, runs: lh.runs },
          lc: { frames: lc.drag.frames, p50: lc.drag.p50, p95: lc.drag.p95, max: lc.drag.max, longTasks: lc.drag.longTasks, runs: lc.runs },
          ratioP50: ratio(lh.drag.p50, lc.drag.p50),
          ratioP95: ratio(lh.drag.p95, lc.drag.p95),
          allowanceP95: Math.round(ratioAllowance(lc.drag.p95) * 100) / 100,
          withinLimit: lh.drag.p95 <= ratioAllowance(lc.drag.p95),
          absoluteBudget: rate === 1 ? BUDGET_P95.unthrottled : BUDGET_P95.throttled4x,
          absoluteOk: lh.drag.p95 <= (rate === 1 ? BUDGET_P95.unthrottled : BUDGET_P95.throttled4x),
        };
        results[`media.${label}.${rate === 1 ? 'unthrottled' : 'throttled4x'}`] = summary;
        console.log(`[media perf ${label}, ${rateName}] LH p50 ${summary.lh.p50} p95 ${summary.lh.p95} (${summary.lh.frames} frames, ${summary.lh.longTasks} long tasks) | LC p50 ${summary.lc.p50} p95 ${summary.lc.p95} (${summary.lc.frames} frames) | ratio p50 ${summary.ratioP50} p95 ${summary.ratioP95} (allowance ${summary.allowanceP95}) | LH runs p95 ${summary.lh.runs.map((r) => r.p95)} LC runs p95 ${summary.lc.runs.map((r) => r.p95)}`);
        expect(lh.drag.frames).toBeGreaterThan(5);
        expect(lc.drag.frames).toBeGreaterThan(5);
        if (ENFORCE_RATIO) expect(lh.drag.p95).toBeLessThanOrEqual(ratioAllowance(lc.drag.p95));
        if (GPU) expect(lh.drag.p95).toBeLessThanOrEqual(summary.absoluteBudget);
      });
    }
  }
});

test('the media drag really moves the volume pill of the first card', async ({ browser }) => {
  const ctx = await openPerfPage(browser, 'page=media&lc=none&cards=4&art=on');
  try {
    const read = () => ctx.page.evaluate(() => document.querySelector('liquid-home-media-card')!.shadowRoot!.querySelector('[role="slider"][aria-label^="Volume"]')!.getAttribute('aria-valuenow'));
    const at = (phase: number) => ctx.page.evaluate((p) => (window as unknown as { __dragPath: (p: number) => { x: number; y: number } }).__dragPath(p), phase);
    const before = await read();
    const from = await at(0);
    await ctx.page.mouse.move(from.x, from.y);
    await ctx.page.mouse.down();
    const to = await at(Math.PI / 2);
    await ctx.page.mouse.move(to.x, to.y, { steps: 8 });
    const during = await read();
    await ctx.page.mouse.up();
    expect(during, `value before the drag was ${before}`).not.toBe(before);
  } finally {
    await ctx.close();
  }
});
