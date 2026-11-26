import { expect, test, type Locator, type Page } from 'playwright/test';
import { beginDrag, callsOf, watchCalls } from './support/domains';
import { stubFavicon, watchErrors } from './support/helpers';

/**
 * Plan 2.4, 2.5 and 2.12 (H9): the cover and fan cards in the dev harness (/dev/), over the harness' simulated HA.
 * - Cover: echo 250 ms, motor 10 % per second, the request rounded to 10 (test/covers/sim.ts).
 * - Fan: HA's demo fan answers after 0.8 s (test/fans/fixtures.ts).
 * Every test opens one fixture on dark glass (`?cover=` / `?fan=`), so the card under test is the only one of its domain.
 */
const COVER = '#slot-cover liquid-home-cover-card';
const FAN = '#slot-fan liquid-home-fan-card';

async function open(page: Page, query: string, card: string): Promise<{ errors: string[]; slider: Locator; readout: Locator }> {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto(`/dev/?${query}&glass=dark`);
  const slider = page.locator(`${card} [role="slider"]`).first(); // the living cover shows twice (Position and Tilt mode): the first card
  await expect(slider).toBeVisible();
  await watchCalls(page);
  return { errors, slider, readout: page.locator(card).first().locator('.ro .big') };
}

const fillHeight = (slider: Locator) => slider.locator('.lc-slider-fill').evaluate((el) => parseFloat((el as HTMLElement).style.height));

test.describe('cover card, drag writes (Q2 a)', () => {
  test('a drag writes nothing while it runs and exactly one set_cover_position at release', async ({ page }) => {
    const { errors, slider } = await open(page, 'cover=hall', COVER);
    const drag = await beginDrag(page, slider);
    await drag.to(80, 800); // longer than the 500 ms step debounce and the 300 ms throttle of a light
    await drag.to(60, 800);
    expect(await callsOf(page)).toEqual([]);
    await drag.up();
    await expect.poll(async () => (await callsOf(page)).length).toBe(1);
    await page.waitForTimeout(900);
    const calls = await callsOf(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ domain: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.hall_window' } });
    const position = calls[0]!.data.position as number;
    expect(Number.isInteger(position)).toBe(true);
    expect(position).toBeGreaterThanOrEqual(59);
    expect(position).toBeLessThanOrEqual(61);
    expect(errors).toEqual([]);
  });

  test('a release at the value the cover already has writes nothing', async ({ page }) => {
    const { slider } = await open(page, 'cover=hall', COVER);
    const drag = await beginDrag(page, slider);
    await drag.to(70, 100);
    await drag.to(10, 100); // back to the start of the gesture
    await drag.up();
    await page.waitForTimeout(1200);
    expect(await callsOf(page)).toEqual([]);
  });

  test('in Tilt mode the release writes set_cover_tilt_position, once', async ({ page }) => {
    const { slider } = await open(page, 'cover=living', COVER);
    await page.locator(COVER).first().locator('button[data-mode="tilt"]').click();
    await expect(slider).toHaveAttribute('aria-label', /^Tilt, /);
    const drag = await beginDrag(page, slider);
    await drag.to(20, 700);
    expect(await callsOf(page)).toEqual([]);
    await drag.up();
    await expect.poll(async () => (await callsOf(page)).length).toBe(1);
    await page.waitForTimeout(800);
    const calls = await callsOf(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ domain: 'cover', service: 'set_cover_tilt_position', data: { entity_id: 'cover.living_room_window' } });
    expect(Math.abs((calls[0]!.data.tilt_position as number) - 20)).toBeLessThanOrEqual(1);
  });
});

test.describe('cover card, readout follows the motor (Q6 a)', () => {
  test('after a write the readout counts up with the motor while the fill holds the sent value', async ({ page }) => {
    const { slider, readout } = await open(page, 'cover=hall', COVER);
    await expect(readout).toHaveText('10');
    const drag = await beginDrag(page, slider);
    await drag.to(80, 100);
    await drag.up();
    // The motor moves 10 % per second after the 250 ms echo: wait until the readout left 10, then compare.
    await expect.poll(async () => Number(await readout.textContent()), { timeout: 8000 }).toBeGreaterThan(10);
    const shown = Number(await readout.textContent());
    expect(shown).toBeLessThan(80);
    const fill = await fillHeight(slider);
    expect(Math.abs(fill - 80)).toBeLessThanOrEqual(1);
    await expect(slider).toHaveAttribute('aria-valuetext', /80\s?%.*now\s+\d+/i);
  });

  test('when the cover has arrived the readout and the fill agree', async ({ page }) => {
    const { slider, readout } = await open(page, 'cover=hall', COVER);
    const drag = await beginDrag(page, slider);
    await drag.to(30, 100);
    await drag.up();
    await expect(readout).toHaveText('30', { timeout: 12_000 });
    await expect.poll(() => fillHeight(slider), { timeout: 5000 }).toBeGreaterThan(29);
    expect(await fillHeight(slider)).toBeLessThan(31);
    await expect(slider).not.toHaveAttribute('aria-valuetext', /now/);
  });
});

test.describe('cover card, keyboard on the position pill: one call per key gesture', () => {
  const keys: [string, string, number][] = [
    ['ArrowUp', 'raises the position by 1 %', 11],
    ['PageUp', 'raises the position by 10 %', 20],
    ['Home', 'goes to 0 %', 0],
    ['End', 'goes to 100 %', 100],
  ];
  for (const [key, what, expected] of keys) {
    test(`${key} ${what} and sends one set_cover_position`, async ({ page }) => {
      const { slider } = await open(page, 'cover=hall', COVER);
      await slider.focus();
      await page.keyboard.press(key);
      await expect.poll(async () => (await callsOf(page)).length).toBe(1);
      await page.waitForTimeout(900);
      const calls = await callsOf(page);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ service: 'set_cover_position', data: { entity_id: 'cover.hall_window', position: expected } });
    });
  }

  test('a held ArrowUp with repeats writes once, at the key release', async ({ page }) => {
    const { slider } = await open(page, 'cover=hall', COVER);
    await slider.focus();
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 5; i++) await page.keyboard.down('ArrowUp'); // auto-repeat keydowns
    await page.waitForTimeout(700);
    expect(await callsOf(page)).toEqual([]);
    await page.keyboard.up('ArrowUp');
    await expect.poll(async () => (await callsOf(page)).length).toBe(1);
    const call = (await callsOf(page))[0]!;
    expect(call.data.position).toBe(16);
  });
});

test.describe('fan card, drag writes (throttle 300 ms, snapped values)', () => {
  test('a slow drag from 33 to 100 sends snapped values, at most one per 300 ms, and ends on 100', async ({ page }) => {
    const { errors, slider } = await open(page, 'fan=pct33', FAN);
    const drag = await beginDrag(page, slider);
    for (let v = 40; v <= 100; v += 10) await drag.to(v, 150); // about 1 s of dragging
    await drag.up();
    await page.waitForTimeout(700);
    const calls = await callsOf(page, 'fan.set_percentage');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const values = calls.map((c) => c.data.percentage as number);
    for (const v of values) expect([33, 66, 100], `value ${v}`).toContain(v);
    expect(values[values.length - 1]).toBe(100);
    for (let i = 1; i < values.length; i++) expect(values[i], `call ${i} repeats call ${i - 1}`).not.toBe(values[i - 1]);
    // The leading write and one per 300 ms: with about 1 s of dragging, at most 1 + 3 + the final one.
    expect(calls.length).toBeLessThanOrEqual(5);
    // Throttle: calls before the release are at least ~300 ms apart (small tolerance for timer skew).
    for (let i = 1; i < calls.length - 1; i++) expect(calls[i]!.t - calls[i - 1]!.t, `gap before call ${i}`).toBeGreaterThanOrEqual(270);
    expect(errors).toEqual([]);
  });

  test('a drag down to the off position waits for the release and then sends set_percentage 0', async ({ page }) => {
    const { slider } = await open(page, 'fan=pct67', FAN);
    const drag = await beginDrag(page, slider);
    await drag.to(5, 700); // below half a step: snaps to 0
    // Before the release no 0 goes out (deferZero); the leading write may carry the first step it passed.
    expect((await callsOf(page)).filter((c) => c.service === 'turn_off' || c.data.percentage === 0)).toEqual([]);
    await drag.up();
    await expect.poll(async () => (await callsOf(page, 'fan.set_percentage')).filter((c) => c.data.percentage === 0).length).toBe(1);
  });

  test('a drag that snaps to the step HA already has writes nothing', async ({ page }) => {
    const { slider } = await open(page, 'fan=pct100', FAN);
    const drag = await beginDrag(page, slider);
    await drag.to(90, 400); // 90 % snaps to the top step, 100
    await drag.up();
    await page.waitForTimeout(1000);
    expect(await callsOf(page)).toEqual([]);
  });
});

test.describe('fan card, readout snapped while dragging (Q8 a)', () => {
  test('on 3 speeds a drag to about 40 % reads 33 in the readout and the aria values, the fill follows the finger', async ({ page }) => {
    const { slider, readout } = await open(page, 'fan=off', FAN);
    const drag = await beginDrag(page, slider);
    await drag.to(40, 200);
    await expect(readout).toHaveText('33');
    await expect(slider).toHaveAttribute('aria-valuenow', '33');
    await expect(slider).toHaveAttribute('aria-valuetext', /33\s?%/);
    const fill = await fillHeight(slider);
    expect(fill).toBeGreaterThan(37);
    expect(fill).toBeLessThan(43);
    await drag.up();
  });

  test('on 3 speeds a drag to about 10 % reads Off: aria-valuenow 0 and the value text Off', async ({ page }) => {
    const { slider, readout } = await open(page, 'fan=pct67', FAN);
    const drag = await beginDrag(page, slider);
    await drag.to(10, 200);
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(slider).toHaveAttribute('aria-valuetext', /off/i);
    await expect(readout).toHaveText(/off/i);
    await drag.up();
  });

  test('on 3 speeds a drag to about 50 % shows the nearest step, 66', async ({ page }) => {
    const { slider, readout } = await open(page, 'fan=off', FAN);
    const drag = await beginDrag(page, slider);
    await drag.to(52, 200);
    await expect(readout).toHaveText('66');
    await drag.up();
  });
});

test.describe('fan card, keyboard (Q4)', () => {
  // [fixture, key presses, expected aria-valuenow after the last, label]
  const cases: [string, string[], string, string][] = [
    ['pct67', ['ArrowUp'], '100', '3 speeds: ArrowUp from 67 goes to the top step'],
    ['pct67', ['ArrowDown'], '33', '3 speeds: ArrowDown from 67 goes one step down'],
    ['pct67', ['PageDown'], '33', '3 speeds: PageDown is one step'],
    ['pct67', ['Home'], '33', '3 speeds: Home goes to the lowest step'],
    ['pct33', ['End'], '100', '3 speeds: End goes to 100'],
    ['pct33', ['ArrowDown'], '0', '3 speeds: ArrowDown from the lowest step turns the fan off'],
    ['ten', ['ArrowUp'], '50', '10 speeds: ArrowUp from 40 goes to 50'],
    ['ten', ['ArrowLeft'], '30', '10 speeds: ArrowLeft from 40 goes to 30'],
    ['ten', ['Home'], '10', '10 speeds: Home goes to 10'],
    ['ten', ['Home', 'ArrowDown'], '0', '10 speeds: ArrowDown from the lowest step turns the fan off'],
    ['full', ['ArrowUp'], '41', '100 speeds: ArrowUp is 1 %'],
    ['full', ['PageUp'], '50', '100 speeds: PageUp is 10 %'],
    ['full', ['PageDown'], '30', '100 speeds: PageDown is 10 %'],
    ['full', ['Home'], '1', '100 speeds: Home goes to 1 %'],
    ['full', ['End'], '100', '100 speeds: End goes to 100'],
  ];
  for (const [fixture, presses, expected, label] of cases) {
    test(`${label} (${fixture})`, async ({ page }) => {
      const { slider } = await open(page, `fan=${fixture}`, FAN);
      await slider.focus();
      for (const key of presses) await page.keyboard.press(key);
      await expect(slider).toHaveAttribute('aria-valuenow', expected);
    });
  }

  test('a key press writes the snapped step to the fan', async ({ page }) => {
    const { slider } = await open(page, 'fan=ten', FAN);
    await slider.focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await callsOf(page, 'fan.set_percentage')).length).toBeGreaterThanOrEqual(1);
    const calls = await callsOf(page, 'fan.set_percentage');
    expect(calls[calls.length - 1]!.data).toMatchObject({ entity_id: 'fan.lh_fixture_ten', percentage: 50 });
  });

  test('ArrowDown from the lowest step sends set_percentage 0 (off)', async ({ page }) => {
    const { slider } = await open(page, 'fan=pct33', FAN);
    await slider.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await callsOf(page, 'fan.set_percentage')).map((c) => c.data.percentage)).toEqual([0]);
  });
});
