import { expect, test, type Locator, type Page } from 'playwright/test';
import { focusedElement, focusedOutline, stubFavicon, watchErrors, type FocusInfo } from './support/helpers';

/**
 * Plan 2.9 / CHO-8: a keyboard-only run over the dev harness (/dev/). The dimmed Kitchen Lights fixture (brightness 26,
 * 10 %, modes Brightness / White / Colour) on dark glass. Every focus is reached with Tab; no programmatic focus.
 */
const URL = '/dev/?light=dimmed&glass=dark';
const CARD = '#slot-light liquid-home-light-card';

async function open(page: Page): Promise<string[]> {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto(URL);
  await expect(page.locator(`${CARD} [role="slider"]`)).toHaveAttribute('aria-valuenow', '10');
  return errors;
}

/** Presses Tab until the focused element satisfies `match` (at most `max` presses). Fails when it never does. */
async function tabTo(page: Page, match: (f: FocusInfo) => boolean, max = 12): Promise<FocusInfo> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await focusedElement(page);
    if (f && match(f)) return f;
  }
  throw new Error(`Tab did not reach the wanted control in ${max} presses`);
}

const isSlider = (f: FocusInfo) => f.role === 'slider';
const isPower = (f: FocusInfo) => f.tag === 'button' && f.pressed !== null && f.mode === null && /turn|switch/i.test(f.label ?? '');
const isMode = (mode: string) => (f: FocusInfo) => f.mode === mode;

function slider(page: Page): Locator {
  return page.locator(`${CARD} [role="slider"]`);
}

test.describe('light card, keyboard only', () => {
  test('Tab visits power, slider, then the Brightness, White and Colour buttons, top to bottom and left to right', async ({ page }) => {
    await open(page);
    const visited: FocusInfo[] = [];
    // Skip the controls before the card (the language select), then record the card's tab stops.
    await tabTo(page, isPower);
    visited.push((await focusedElement(page))!);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      visited.push((await focusedElement(page))!);
    }
    expect(visited.map((f) => (f.role === 'slider' ? 'slider' : (f.mode ?? 'power')))).toEqual(['power', 'slider', 'brightness', 'white', 'colour']);
    // Visual order: each stop is below the previous one, or on the same row and further right.
    for (let i = 1; i < visited.length; i++) {
      const prev = visited[i - 1]!;
      const cur = visited[i]!;
      const belowOrSameRow = cur.top > prev.top || (cur.top === prev.top && cur.left > prev.left);
      expect(belowOrSameRow, `${i}: ${JSON.stringify(prev)} then ${JSON.stringify(cur)}`).toBe(true);
    }
  });

  test('the slider announces its value: role, range, label and a localized value text', async ({ page }) => {
    await open(page);
    const s = slider(page);
    await expect(s).toHaveAttribute('aria-valuemin', '0');
    await expect(s).toHaveAttribute('aria-valuemax', '100');
    await expect(s).toHaveAttribute('aria-valuenow', '10');
    await expect(s).toHaveAttribute('aria-valuetext', /10\s?%/);
    await expect(s).toHaveAttribute('aria-label', /Kitchen Lights.*brightness/i);
  });

  const keys: [string, string[], string][] = [
    ['ArrowUp raises the value by 1 %', ['ArrowUp'], '11'],
    ['ArrowRight raises the value by 1 %', ['ArrowRight'], '11'],
    ['ArrowDown lowers the value by 1 %', ['ArrowDown'], '9'],
    ['ArrowLeft lowers the value by 1 %', ['ArrowLeft'], '9'],
    ['PageUp raises the value by 10 %', ['PageUp'], '20'],
    ['PageDown lowers the value by 10 %', ['PageDown'], '1'],
    ['Home goes to 1 %, the lowest on level', ['Home'], '1'],
    ['End goes to 100 %', ['End'], '100'],
    ['ArrowDown from 1 % turns the light off', ['Home', 'ArrowDown'], '0'],
  ];
  for (const [name, presses, expected] of keys) {
    test(`slider: ${name}`, async ({ page }) => {
      await open(page);
      await tabTo(page, isSlider);
      for (const key of presses) await page.keyboard.press(key);
      await expect(slider(page)).toHaveAttribute('aria-valuenow', expected);
    });
  }

  test('slider: off reads as 0 with the value text Off', async ({ page }) => {
    await open(page);
    await tabTo(page, isSlider);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect(slider(page)).toHaveAttribute('aria-valuenow', '0');
    await expect(slider(page)).toHaveAttribute('aria-valuetext', /off/i);
  });

  test('slider: a key press writes the new brightness to the light', async ({ page }) => {
    await open(page);
    await tabTo(page, isSlider);
    await page.keyboard.press('PageUp');
    await expect(page.locator('#log')).toContainText(/light\.turn_on .*"brightness_pct":20|light\.turn_on .*"brightness":51/);
  });

  for (const key of ['Space', 'Enter'] as const) {
    test(`power button: ${key} turns the light off, and again on`, async ({ page }) => {
      await open(page);
      const power = page.locator(`${CARD} header button[aria-pressed]`);
      await tabTo(page, isPower);
      await expect(power).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press(key);
      await expect(page.locator('#log')).toContainText('light.turn_off');
      await expect(power).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
      await page.keyboard.press(key);
      await expect(page.locator('#log')).toContainText('light.turn_on');
      await expect(power).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
    });
  }

  for (const [key, mode] of [
    ['Enter', 'white'],
    ['Space', 'colour'],
  ] as const) {
    test(`mode buttons: ${key} selects ${mode} and the slider label follows`, async ({ page }) => {
      await open(page);
      await tabTo(page, isMode(mode));
      await page.keyboard.press(key);
      await expect(page.locator(`${CARD} button[data-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`${CARD} button[data-mode="brightness"]`)).toHaveAttribute('aria-pressed', 'false');
      await expect(slider(page)).toHaveAttribute('aria-label', mode === 'white' ? /warmth/i : /colour/i);
    });
  }

  test('mode buttons form a labelled group', async ({ page }) => {
    await open(page);
    await expect(page.locator(`${CARD} [role="group"]`)).toHaveAttribute('aria-label', /.+/);
  });
});

test.describe('focus ring (TOK-19)', () => {
  for (const [name, match, offset] of [
    ['power button', isPower, '2px'],
    ['mode button', isMode('white'), '2px'],
    ['slider', isSlider, '3px'],
  ] as const) {
    test(`${name}: a 2px outline at offset ${offset} shows on keyboard focus`, async ({ page }) => {
      await open(page);
      await tabTo(page, match);
      const outline = await focusedOutline(page);
      expect(outline.style).not.toBe('none');
      expect(outline.width).toBe('2px');
      expect(outline.offset).toBe(offset);
    });
  }

  test('the ring is not shown after a mouse click on a button (:focus-visible only)', async ({ page }) => {
    await open(page);
    await page.locator(`${CARD} button[data-mode="white"]`).click();
    const outline = await focusedOutline(page);
    expect(outline.style === 'none' || outline.width === '0px').toBe(true);
  });

  test('the selected mode button has no ring until it has keyboard focus', async ({ page }) => {
    await open(page);
    const selected = page.locator(`${CARD} button[data-mode="brightness"][aria-pressed="true"]`);
    await expect(selected).toBeVisible();
    const outlineStyle = await selected.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outlineStyle).toBe('none');
  });

  test(`the ring colour differs from the edge colour of the selected mode button`, async ({ page }) => {
    await open(page);
    await tabTo(page, isMode('white'));
    const ring = await focusedOutline(page);
    const selectedEdge = await page.locator(`${CARD} button[data-mode="brightness"]`).evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(ring.color).not.toBe(selectedEdge);
  });
});
