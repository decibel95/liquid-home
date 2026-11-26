import { expect, test, type Page } from 'playwright/test';
import { stubFavicon, watchErrors } from './support/helpers';

/**
 * Plan 2.9: the sheet of a cover and of a fan has History, like the light's. A click closes the sheet first, then
 * pushes `/history?entity_id=<entity>` (history.pushState, no reload) and dispatches `location-changed` on window.
 * Built bundle on a fake hass with cover.hall_window (opened from a tile) and fan.living_room_fan (opened from a badge).
 */
async function open(page: Page): Promise<string[]> {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __order: string[] };
    w.__order = [];
    const push = history.pushState.bind(history);
    history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      const sheet = document.querySelector('liquid-home-sheet') as (HTMLElement & { isOpen?: boolean }) | null;
      w.__order.push(`pushState ${url} (sheet open: ${sheet?.isOpen})`);
      push(data, unused, url);
    };
    window.addEventListener('location-changed', () => w.__order.push('location-changed'));
  });
  await page.goto('/test/e2e/pages/domains.html?show=history&glass=dark');
  await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
  return errors;
}

const order = (page: Page) => page.evaluate(() => (window as unknown as { __order: string[] }).__order.slice());
const sheet = (page: Page) => page.locator('liquid-home-sheet');

const SURFACES = [
  { what: 'a cover tile', opener: '#hist-tile button.body', entity: 'cover.hall_window', label: 'Position, Hall Window', card: 'liquid-home-cover-card' },
  { what: 'a fan badge', opener: '#hist-badge button.pill', entity: 'fan.living_room_fan', label: 'Speed, Living Room Fan', card: 'liquid-home-fan-card' },
] as const;

for (const s of SURFACES) {
  test.describe(`sheet opened from ${s.what}`, () => {
    test('shows the entity card with a History button and a Close button', async ({ page }) => {
      const errors = await open(page);
      await page.locator(s.opener).click();
      await expect(sheet(page).locator(s.card)).toBeVisible();
      await expect(sheet(page).locator(`${s.card} [role="slider"]`)).toHaveAttribute('aria-label', s.label);
      await expect(sheet(page).locator('button.history')).toBeVisible();
      await expect(sheet(page).getByRole('button', { name: /close/i }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`History closes the sheet, then pushes /history?entity_id=${s.entity} and fires location-changed`, async ({ page }) => {
      const errors = await open(page);
      const before = page.url();
      await page.locator(s.opener).click();
      await expect(sheet(page).locator(s.card)).toBeVisible();
      await sheet(page).locator('button.history').click();
      await expect.poll(() => order(page)).toEqual([`pushState /history?entity_id=${s.entity} (sheet open: false)`, 'location-changed']);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/history?entity_id=${s.entity}`);
      expect(page.url()).not.toBe(before);
      // No reload: the page and its state are still there.
      await expect(page.locator('#hist-tile')).toBeVisible();
      expect(await sheet(page).evaluate((el) => (el as HTMLElement & { isOpen: boolean }).isOpen)).toBe(false);
      expect(errors).toEqual([]);
    });

    test('Close closes the sheet and does not navigate', async ({ page }) => {
      await open(page);
      const before = page.url();
      await page.locator(s.opener).click();
      await expect(sheet(page).locator(s.card)).toBeVisible();
      await sheet(page).getByRole('button', { name: /close/i }).first().click();
      await expect.poll(() => sheet(page).evaluate((el) => (el as HTMLElement & { isOpen: boolean }).isOpen)).toBe(false);
      expect(await order(page)).toEqual([]);
      expect(page.url()).toBe(before);
    });
  });
}
