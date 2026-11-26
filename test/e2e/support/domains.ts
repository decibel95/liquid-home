import type { Locator, Page } from 'playwright/test';

/** One service call of the dev harness log (`#log`), with the time it appeared (ms, page clock). */
export interface LoggedCall {
  t: number;
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/**
 * Starts recording the service calls the dev harness writes to `#log` (one line per call, `<time>  <domain>.<service> <json>`).
 * Call it after `page.goto`, before the first interaction. Read the calls with `callsOf`.
 */
export async function watchCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __calls: unknown[] };
    const log = document.getElementById('log')!;
    w.__calls = [];
    let seen = log.textContent ? log.textContent.split('\n').length : 0;
    new MutationObserver(() => {
      const lines = (log.textContent ?? '').split('\n');
      for (const line of lines.slice(seen)) {
        const m = /\s\s([a-z_]+)\.([a-z_]+) (\{.*\})\s*$/.exec(line);
        if (m) w.__calls.push({ t: performance.now(), domain: m[1], service: m[2], data: JSON.parse(m[3]!) });
      }
      seen = lines.length;
    }).observe(log, { childList: true, characterData: true, subtree: true });
  });
}

/** The recorded calls, optionally of one `domain.service` (for example `cover.set_cover_position`). */
export async function callsOf(page: Page, name?: string): Promise<LoggedCall[]> {
  const all = await page.evaluate(() => (window as unknown as { __calls: LoggedCall[] }).__calls.slice());
  return name ? all.filter((c) => `${c.domain}.${c.service}` === name) : all;
}

export interface Drag {
  /** Moves the pointer so the pill would show `value` (relative gesture: the pill starts from the value it had). */
  to(value: number, pauseMs?: number): Promise<void>;
  up(): Promise<void>;
}

/**
 * Presses the mouse on a vertical pill and returns a handle to move and release it. The core slider is relative
 * (value = start + moved distance / height * 100), so the target is converted from the value the pill showed at the start.
 */
export async function beginDrag(page: Page, slider: Locator): Promise<Drag> {
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  const start = Number(await slider.getAttribute('aria-valuenow'));
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  return {
    async to(value, pauseMs = 0) {
      await page.mouse.move(x, y0 - ((value - start) / 100) * box.height, { steps: 4 });
      if (pauseMs) await page.waitForTimeout(pauseMs);
    },
    up: () => page.mouse.up(),
  };
}

/** Clicks a caption (not focusable) so the next Tab starts right after it, in the document order. */
export async function tabStartAfter(page: Page, caption: Locator): Promise<void> {
  await caption.scrollIntoViewIfNeeded();
  await caption.click();
}
