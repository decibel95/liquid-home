import { expect, type Page } from 'playwright/test';

export interface Measure {
  entity: string;
  host: { left: number; right: number; width: number };
  rowWidth: number;
  rowRight: number;
  rowScrollWidth: number;
  rowClientWidth: number;
  name: { clientWidth: number; scrollWidth: number; overflow: string; textOverflow: string; whiteSpace: string } | null;
}

/** Measures every pill badge of the rows matched by `rowSelector`, from the host element to its name text. */
export async function measureBadges(page: Page, rowSelector: string): Promise<Measure[]> {
  return page.evaluate((sel) => {
    const out: unknown[] = [];
    for (const row of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = row.getBoundingClientRect();
      for (const badge of Array.from(row.querySelectorAll<HTMLElement>('liquid-home-badge'))) {
        const b = badge.getBoundingClientRect();
        const n = badge.shadowRoot?.querySelector<HTMLElement>('.pill .n');
        const cs = n ? getComputedStyle(n) : null;
        out.push({
          entity: badge.dataset.entity ?? '',
          host: { left: b.left, right: b.right, width: b.width },
          rowWidth: r.width,
          rowRight: r.right,
          rowScrollWidth: row.scrollWidth,
          rowClientWidth: row.clientWidth,
          name: n ? { clientWidth: n.clientWidth, scrollWidth: n.scrollWidth, overflow: cs!.overflow, textOverflow: cs!.textOverflow, whiteSpace: cs!.whiteSpace } : null,
        });
      }
    }
    return out;
  }, rowSelector) as Promise<Measure[]>;
}

export function expectCapped(measures: Measure[], expectedCount: number, minCut: number): void {
  expect(measures.length).toBe(expectedCount);
  for (const m of measures) {
    const label = `${m.entity} (badge ${Math.round(m.host.width)} px in a row of ${Math.round(m.rowWidth)} px)`;
    expect(m.host.width, `${label}: the badge is not wider than its row`).toBeLessThanOrEqual(m.rowWidth + 0.5);
    expect(m.host.right, `${label}: the badge ends inside the row`).toBeLessThanOrEqual(m.rowRight + 0.5);
    expect(m.rowScrollWidth, `${label}: the row does not scroll sideways`).toBeLessThanOrEqual(m.rowClientWidth);
    expect(m.name, `${label}: has a name element`).not.toBeNull();
    expect(m.name!.textOverflow, `${label}: ellipsis`).toBe('ellipsis');
  }
  // The long ones really are cut: their name text is wider than the space they have.
  const cut = measures.filter((m) => m.name!.scrollWidth > m.name!.clientWidth);
  expect(cut.length, 'the badges with the long names are shown with an ellipsis').toBeGreaterThanOrEqual(minCut);
}

