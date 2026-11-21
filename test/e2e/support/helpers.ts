import type { Page } from 'playwright/test';

/** Everything that would show up as an error in the browser console of a page. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.name}: ${e.message}`));
  return errors;
}

/** The dev server has no favicon; answer it so a 404 does not count as a console error. */
export async function stubFavicon(page: Page): Promise<void> {
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
}

export interface DefineRecord {
  name: string;
  ok: boolean;
  error?: string;
}

/** Init script: records every customElements.define call (name and whether it threw). Read window.__defines. */
export function recordDefines(): void {
  const w = window as unknown as { __defines: { name: string; ok: boolean; error?: string }[] };
  w.__defines = [];
  const original = customElements.define.bind(customElements);
  customElements.define = function (name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions) {
    try {
      original(name, ctor, options);
      w.__defines.push({ name, ok: true });
    } catch (err) {
      w.__defines.push({ name, ok: false, error: `${(err as Error)?.name}: ${(err as Error)?.message}` });
      throw err;
    }
  };
}

/** The defines of the page, without the dev server's own `vite-error-overlay` element. */
export async function definesOf(page: Page): Promise<DefineRecord[]> {
  const all = await page.evaluate(() => (window as unknown as { __defines: DefineRecord[] }).__defines.slice());
  return all.filter((d) => !d.name.startsWith('vite-'));
}

export interface GlassInfo {
  /** Number of elements in the card's shadow tree (and nested shadow trees) with a backdrop-filter. */
  count: number;
  /** Computed backdrop-filter of the outermost glass element. */
  backdropFilter: string;
  borderRadius: string;
}

/**
 * Looks for the glass of a card: the outermost element in the card's open shadow tree with a computed backdrop-filter.
 * Evaluated in the page, so it takes a CSS selector for the host.
 */
export async function glassOf(page: Page, hostSelector: string): Promise<GlassInfo | null> {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector);
    if (!host) return null;
    const found: Element[] = [];
    const visit = (root: ParentNode) => {
      for (const child of Array.from(root.children)) {
        const filter = getComputedStyle(child).backdropFilter;
        if (filter && filter !== 'none') found.push(child);
        if (child.shadowRoot) visit(child.shadowRoot);
        visit(child);
      }
    };
    if (host.shadowRoot) visit(host.shadowRoot);
    const first = found[0];
    if (!first) return { count: 0, backdropFilter: 'none', borderRadius: '' };
    const cs = getComputedStyle(first);
    return { count: found.length, backdropFilter: cs.backdropFilter, borderRadius: cs.borderTopLeftRadius };
  }, hostSelector);
}

/** Descriptor of the element that has keyboard focus, through open shadow roots. */
export interface FocusInfo {
  tag: string;
  role: string | null;
  label: string | null;
  mode: string | null;
  pressed: string | null;
  top: number;
  left: number;
}

export async function focusedElement(page: Page): Promise<FocusInfo | null> {
  return page.evaluate(() => {
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label'),
      mode: el.getAttribute('data-mode'),
      pressed: el.getAttribute('aria-pressed'),
      top: Math.round(r.top + scrollY),
      left: Math.round(r.left + scrollX),
    };
  });
}

/** Computed outline of the element that has keyboard focus. */
export async function focusedOutline(page: Page): Promise<{ style: string; width: string; offset: string; color: string }> {
  return page.evaluate(() => {
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
    const cs = getComputedStyle(el!);
    return { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset, color: cs.outlineColor };
  });
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/**
 * Writes a JSON report next to the run. Directory: $LH_E2E_REPORT_DIR, else node_modules/.cache/lh-e2e/reports
 * (ignored by git). Returns the path written.
 */
export async function writeReport(name: string, data: unknown): Promise<string> {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const dir = resolve(process.env.LH_E2E_REPORT_DIR || 'node_modules/.cache/lh-e2e/reports');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, name);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}
