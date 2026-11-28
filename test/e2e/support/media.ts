import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from 'playwright/test';
import { stubFavicon, watchErrors } from './helpers';

/** Helpers of the media specs: the controllable page (test/e2e/pages/media.ts), synthetic covers, timers, call log. */
const COVER_DIR = fileURLToPath(new URL('../../../dev/covers/', import.meta.url));
export const cover = (name: 'dark' | 'light' | 'saturated' | 'busy' | '43' | 'wide'): Buffer => readFileSync(`${COVER_DIR}cover-${name}.png`);

export interface MediaCall {
  t: number;
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** URL of the media page; every value is encoded, so a `/__art/` value never matches a route aimed at the cover. */
export const mediaUrl = (q: Record<string, string | number> = {}): string => `/test/e2e/pages/media.html?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`;

/** Init script: counts the 1 s intervals created by the page (active ones, and how often their callback ran). */
export function installTimerSpy(): void {
  const w = window as unknown as { __timers: { active: Set<unknown>; ticks: number }; setInterval: typeof setInterval; clearInterval: typeof clearInterval };
  w.__timers = { active: new Set(), ticks: 0 };
  const si = w.setInterval.bind(window);
  const ci = w.clearInterval.bind(window);
  w.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    if (ms !== 1000 || typeof fn !== 'function') return si(fn as never, ms, ...args);
    const id = si(
      (...a: unknown[]) => {
        w.__timers.ticks++;
        return (fn as (...x: unknown[]) => void)(...a);
      },
      ms,
      ...args,
    );
    w.__timers.active.add(id);
    return id;
  }) as unknown as typeof setInterval;
  w.clearInterval = ((id?: number) => {
    w.__timers.active.delete(id);
    return ci(id);
  }) as typeof clearInterval;
}

/** Init script: `document.visibilityState` follows window.__vis, which a test flips together with a visibilitychange event. */
export function installVisibilityControl(): void {
  const w = window as unknown as { __vis: string };
  w.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => w.__vis });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => w.__vis === 'hidden' });
}

export async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((s) => {
    (window as unknown as { __vis: string }).__vis = s;
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

export const activeIntervals = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __timers: { active: Set<unknown> } }).__timers.active.size);
export const intervalTicks = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __timers: { ticks: number } }).__timers.ticks);

export interface Opened {
  errors: string[];
}

/** Opens the media page and waits until it is ready and the card has rendered. */
export async function openMedia(page: Page, q: Record<string, string | number> = {}, opts: { timers?: boolean; visibility?: boolean } = {}): Promise<Opened> {
  const errors = watchErrors(page);
  await stubFavicon(page);
  if (opts.timers) await page.addInitScript(installTimerSpy);
  if (opts.visibility) await page.addInitScript(installVisibilityControl);
  await page.goto(mediaUrl(q));
  await page.waitForFunction(() => (window as unknown as { __media: { ready: boolean } }).__media.ready);
  await page.locator('#card [role="slider"]').first().waitFor();
  return { errors };
}

export const mediaCalls = (page: Page, service?: string): Promise<MediaCall[]> =>
  page.evaluate((s) => (window as unknown as { __media: { calls: MediaCall[] } }).__media.calls.filter((c) => !s || c.service === s), service);

export const card = (page: Page): Locator => page.locator('#card');
export const volumePill = (page: Page): Locator => page.locator('#card [role="slider"][aria-label^="Volume"]');
export const seekBar = (page: Page): Locator => page.locator('#card [role="slider"][aria-orientation="horizontal"]');

/**
 * Routes `**\/__art/<name>` to one of the synthetic covers, after `delayMs`, with `status` (404 answers an empty body).
 * Returns the number of requests the route saw.
 */
export async function routeArt(page: Page, name: string, file: Parameters<typeof cover>[0], opts: { delayMs?: number; status?: number } = {}): Promise<{ count: () => number }> {
  let n = 0;
  await page.route(`**/__art/${name}`, async (route) => {
    n++;
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    try {
      if (opts.status && opts.status !== 200) await route.fulfill({ status: opts.status, body: '' });
      else await route.fulfill({ status: 200, contentType: 'image/png', body: cover(file), headers: { 'Cache-Control': 'max-age=3600' } });
    } catch {
      /* the page went away while the response was delayed */
    }
  });
  return { count: () => n };
}

/** Records every `img` that enters the art layer of the media card from now on, with whether it was decoded at that moment. */
export async function watchArtImages(page: Page, selector = '#card'): Promise<void> {
  await page.evaluate((sel) => {
    const w = window as unknown as { __imgs: { src: string; complete: boolean; naturalWidth: number }[] };
    w.__imgs = [];
    const host = document.querySelector(sel)!;
    const seen = new WeakSet<Element>();
    const record = (n: Node) => {
      if (n instanceof HTMLImageElement && !seen.has(n)) {
        seen.add(n);
        w.__imgs.push({ src: n.getAttribute('src') ?? '', complete: n.complete, naturalWidth: n.naturalWidth });
      } else if (n instanceof Element) n.querySelectorAll('img').forEach(record);
    };
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(record))).observe(host.shadowRoot!, { childList: true, subtree: true });
  }, selector);
}

export const artImages = (page: Page) => page.evaluate(() => (window as unknown as { __imgs: { src: string; complete: boolean; naturalWidth: number }[] }).__imgs.slice());

/** The `img` elements in the art layer of the card right now, with their src tail and class. */
export const artState = (page: Page, selector = '#card') =>
  page.evaluate((sel) => {
    // `sheet` is the media card hosted by the sheet (inside the sheet's shadow tree).
    const deep = (r: ParentNode): Element | null => {
      for (const el of Array.from(r.querySelectorAll('*'))) {
        if (el.localName === 'liquid-home-media-card' && el.getRootNode() !== document) return el;
        const f = el.shadowRoot && deep(el.shadowRoot);
        if (f) return f;
      }
      return null;
    };
    const root = (sel === 'sheet' ? deep(document) : document.querySelector(sel))!.shadowRoot!;
    const art = root.querySelector('.art');
    return { layer: !!art, layerOn: !!art?.classList.contains('on'), imgs: Array.from(root.querySelectorAll('.art img')).map((i) => ({ src: (i.getAttribute('src') ?? '').split('/').pop() ?? '', on: i.classList.contains('on') })) };
  }, selector);

/**
 * Relative horizontal drag on a seek bar (the core horizontal slider is relative: value = start + dx / width * max).
 * Returns handles to move and release.
 */
export async function beginSeekDrag(page: Page, bar: Locator) {
  await bar.scrollIntoViewIfNeeded();
  const box = (await bar.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  return {
    box,
    async by(dx: number, steps = 6) {
      await page.mouse.move(x0 + dx, y, { steps });
    },
    up: () => page.mouse.up(),
  };
}
