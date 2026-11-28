import { expect, test, type Page } from 'playwright/test';
import { stubFavicon, watchErrors } from './support/helpers';

/**
 * Plan 2.9: the sheet of a cover and of a fan has History, like the light's. A click closes the sheet first, then
 * pushes `/history?entity_id=<entity>` (history.pushState, no reload) and dispatches `location-changed` on window.
 * Built bundle on a fake hass with cover.hall_window (opened from a tile) and fan.living_room_fan (opened from a badge).
 */
async function open(page: Page, show = 'history'): Promise<string[]> {
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
  await page.goto(`/test/e2e/pages/domains.html?show=${show}&glass=dark`);
  await page.waitForFunction(() => (window as unknown as { __domains: { ready: boolean } }).__domains.ready);
  return errors;
}

const order = (page: Page) => page.evaluate(() => (window as unknown as { __order: string[] }).__order.slice());
const sheet = (page: Page) => page.locator('liquid-home-sheet');

const SURFACES = [
  { what: 'a cover tile', opener: '#hist-tile button.body', entity: 'cover.hall_window', label: 'Position, Hall Window', card: 'liquid-home-cover-card' },
  { what: 'a fan badge', opener: '#hist-badge button.pill', entity: 'fan.living_room_fan', label: 'Speed, Living Room Fan', card: 'liquid-home-fan-card' },
] as const;

/** 0.4: the media sheet (a media tile and a media badge); the media card hosted by the sheet has History in the sheet header. */
const MEDIA_SURFACES = [
  { what: 'a media tile', opener: '#hist-media-tile button.body' },
  { what: 'a media badge', opener: '#hist-media-badge button.pill' },
] as const;
const MEDIA_ENTITY = 'media_player.lh_fixture_playing';

for (const s of MEDIA_SURFACES) {
  test.describe(`media sheet opened from ${s.what}`, () => {
    const openMedia = async (page: Page) => {
      const errors = await open(page, 'media-history');
      await page.locator(s.opener).click();
      await expect(sheet(page).locator('liquid-home-media-card')).toBeVisible();
      return errors;
    };

    test('shows the media card with the sheet History and Close buttons (the card has none of its own)', async ({ page }) => {
      const errors = await openMedia(page);
      await expect(sheet(page).locator('liquid-home-media-card [role="slider"]').first()).toBeVisible();
      await expect(sheet(page).locator('button.history')).toHaveCount(1);
      await expect(sheet(page).getByRole('button', { name: /close/i }).first()).toBeVisible();
      expect(await sheet(page).locator('liquid-home-media-card').evaluate((el) => el.shadowRoot!.querySelectorAll('button.history').length), 'the hosted card hides its own History').toBe(0);
      expect(errors).toEqual([]);
    });

    test(`History closes the sheet, then pushes /history?entity_id=${MEDIA_ENTITY} and fires location-changed`, async ({ page }) => {
      const errors = await openMedia(page);
      const before = page.url();
      await sheet(page).locator('button.history').click();
      await expect.poll(() => order(page)).toEqual([`pushState /history?entity_id=${MEDIA_ENTITY} (sheet open: false)`, 'location-changed']);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/history?entity_id=${MEDIA_ENTITY}`);
      expect(page.url()).not.toBe(before);
      expect(await sheet(page).evaluate((el) => (el as HTMLElement & { isOpen: boolean }).isOpen)).toBe(false);
      expect(errors).toEqual([]);
    });

    test('Close closes the sheet and does not navigate', async ({ page }) => {
      await openMedia(page);
      const before = page.url();
      await sheet(page).getByRole('button', { name: /close/i }).first().click();
      await expect.poll(() => sheet(page).evaluate((el) => (el as HTMLElement & { isOpen: boolean }).isOpen)).toBe(false);
      expect(await order(page)).toEqual([]);
      expect(page.url()).toBe(before);
    });
  });
}

test('the History button of the media card on a dashboard (outside a sheet) pushes the same URL', async ({ page }) => {
  const errors = await open(page, 'media-history');
  // The tile hosts no card; the card on its own page (media.html) is checked here through the same pushState hook.
  expect(errors).toEqual([]);
  await page.goto('/test/e2e/pages/media.html?show=card&echo=none');
  await page.waitForFunction(() => (window as unknown as { __media: { ready: boolean } }).__media.ready);
  await page.locator('#card button.history').click();
  await expect.poll(() => order(page)).toEqual([`pushState /history?entity_id=media_player.e2e_player (sheet open: undefined)`, 'location-changed']);
});

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
