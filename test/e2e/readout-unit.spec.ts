import { expect, test } from 'playwright/test';
import { stubFavicon, watchErrors } from './support/helpers';

/** P20 D1: the readout unit must not inherit the host page line-height (HA uses 1.6), as the dial's "°" does not. */
test('light card readout unit has line-height equal to its font-size under a 1.6 host line-height', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto('/dev/?light=dimmed&glass=dark');
  const slider = page.locator('#slot-light liquid-home-light-card [role="slider"]');
  await expect(slider).toHaveAttribute('aria-valuenow', '10');
  await page.evaluate(() => {
    document.body.style.lineHeight = '1.6';
  });
  const m = await page.evaluate(() => {
    const unit = document.querySelector('#slot-light liquid-home-light-card')!.shadowRoot!.querySelector('.ro-v .unit')!;
    const cs = getComputedStyle(unit);
    return { lineHeight: cs.lineHeight, fontSize: cs.fontSize, bodyLineHeight: getComputedStyle(document.body).lineHeight };
  });
  expect(m.bodyLineHeight).not.toBe('normal');
  expect(parseFloat(m.fontSize)).toBeGreaterThan(0);
  expect(parseFloat(m.lineHeight)).toBeCloseTo(parseFloat(m.fontSize), 1);
  expect(errors).toEqual([]);
});
