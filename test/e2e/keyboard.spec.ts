import { expect, test, type Locator, type Page } from 'playwright/test';
import { focusedElement, focusedOutline, stubFavicon, watchErrors, type FocusInfo } from './support/helpers';
import { mediaCalls, mediaUrl } from './support/media';

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

/**
 * H9 (plan 2.12): a keyboard-only run over the cover and the fan card. The start point is a click on the figure caption
 * (not focusable), so every control is reached with Tab and no focus is set by script.
 */
async function openDomain(page: Page, query: string, caption: string): Promise<string[]> {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto(`/dev/?${query}&glass=dark`);
  const cap = page.locator(`figcaption:text-is("${caption}")`).first();
  await expect(cap).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __calls: string[] };
    w.__calls = [];
    const log = document.getElementById('log')!;
    new MutationObserver(() => (w.__calls = (log.textContent ?? '').split('\n'))).observe(log, { childList: true, characterData: true, subtree: true });
  });
  await cap.click();
  return errors;
}

const logged = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls.join('\n'));
const stopName = (f: FocusInfo) => (f.role === 'slider' ? 'slider' : (f.mode ?? f.action ?? f.label ?? f.tag));

/** Tab stops from the caption on, `count` of them. */
async function tabStops(page: Page, count: number): Promise<FocusInfo[]> {
  const stops: FocusInfo[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    stops.push((await focusedElement(page))!);
  }
  return stops;
}

function expectVisualOrder(stops: FocusInfo[]): void {
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const cur = stops[i]!;
    expect(cur.top > prev.top || (cur.top === prev.top && cur.left > prev.left), `${i}: ${JSON.stringify(prev)} then ${JSON.stringify(cur)}`).toBe(true);
  }
}

test.describe('cover card, keyboard only', () => {
  const caption = 'position + tilt, Position (dark glass)';

  test('Tab visits the pill, Position and Tilt, then Open, Stop and Close, in visual order', async ({ page }) => {
    const errors = await openDomain(page, 'cover=living', caption);
    const stops = await tabStops(page, 6);
    expect(stops.map(stopName)).toEqual(['slider', 'position', 'tilt', 'open', 'stop', 'close']);
    expectVisualOrder(stops);
    expect(errors).toEqual([]);
  });

  test('Enter on Tilt selects it and the pill becomes the tilt pill', async ({ page }) => {
    await openDomain(page, 'cover=living', caption);
    await tabStops(page, 3); // the pill, Position, Tilt
    expect((await focusedElement(page))?.mode).toBe('tilt');
    await page.keyboard.press('Enter');
    const card = page.locator('#slot-cover liquid-home-cover-card').first();
    await expect(card.locator('button[data-mode="tilt"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('button[data-mode="position"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(card.locator('[role="slider"]')).toHaveAttribute('aria-label', /^Tilt, /);
  });

  test('Space on Open sends cover.open_cover and Enter on Close sends cover.close_cover', async ({ page }) => {
    await openDomain(page, 'cover=living', caption);
    await tabStops(page, 4);
    expect((await focusedElement(page))?.action).toBe('open');
    await page.keyboard.press('Space');
    await expect.poll(() => logged(page)).toContain('cover.open_cover');
    await tabStops(page, 2); // Stop, then Close
    expect((await focusedElement(page))?.action).toBe('close');
    await page.keyboard.press('Enter');
    await expect.poll(() => logged(page)).toContain('cover.close_cover');
  });

  test('the focus ring is a 2px outline on the pill (offset 3px) and on a row button (offset 2px)', async ({ page }) => {
    await openDomain(page, 'cover=living', caption);
    await tabStops(page, 1);
    const pill = await focusedOutline(page);
    expect([pill.style === 'none', pill.width, pill.offset]).toEqual([false, '2px', '3px']);
    await tabStops(page, 3);
    const button = await focusedOutline(page);
    expect([button.style === 'none', button.width, button.offset]).toEqual([false, '2px', '2px']);
  });

  test('a closed toggle cover offers its switch, then Open and Stop; Close is disabled and skipped', async ({ page }) => {
    await openDomain(page, 'cover=kitchen', 'toggle closed (dark glass)');
    const stops = await tabStops(page, 3);
    expect(stops.map((f) => f.role ?? f.tag)).toEqual(['switch', 'button', 'button']);
    expect(stops.slice(1).map((f) => f.action)).toEqual(['open', 'stop']);
    expectVisualOrder(stops);
    await expect(page.locator('#slot-cover liquid-home-cover-card').first().locator('button[data-action="close"]')).toBeDisabled();
  });
});

test.describe('fan card, keyboard only', () => {
  const caption = 'oscillating (dark glass)';

  test('Tab visits power, the pill, Oscillate and Reverse, in visual order', async ({ page }) => {
    const errors = await openDomain(page, 'fan=oscillating', caption);
    const stops = await tabStops(page, 4);
    expect(stops.map(stopName)).toEqual([expect.stringMatching(/switch/i), 'slider', 'oscillate', 'reverse']);
    expectVisualOrder(stops);
    expect(stops[0]!.pressed).toBe('true');
    expect(errors).toEqual([]);
  });

  test('Space on power turns the fan off, and again on', async ({ page }) => {
    await openDomain(page, 'fan=oscillating', caption);
    await tabStops(page, 1);
    const power = page.locator('#slot-fan liquid-home-fan-card header button[aria-pressed]');
    await page.keyboard.press('Space');
    await expect.poll(() => logged(page)).toContain('fan.turn_off');
    await expect(power).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
    await page.keyboard.press('Space');
    await expect.poll(() => logged(page)).toContain('fan.turn_on');
  });

  test('the pill steps with the arrow keys and the label names the speed', async ({ page }) => {
    await openDomain(page, 'fan=oscillating', caption);
    await tabStops(page, 2);
    const slider = page.locator('#slot-fan liquid-home-fan-card [role="slider"]');
    await expect(slider).toHaveAttribute('aria-label', /^Speed, /);
    await expect(slider).toHaveAttribute('aria-valuenow', '33');
    await page.keyboard.press('ArrowUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '66');
    await page.keyboard.press('ArrowUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await expect(slider).toHaveAttribute('aria-valuetext', /100\s?%/);
  });

  test('Enter on Oscillate and Space on Reverse send their service and flip aria-pressed', async ({ page }) => {
    await openDomain(page, 'fan=oscillating', caption);
    await tabStops(page, 3);
    const osc = page.locator('#slot-fan liquid-home-fan-card button[data-action="oscillate"]');
    const rev = page.locator('#slot-fan liquid-home-fan-card button[data-action="reverse"]');
    await expect(osc).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect.poll(() => logged(page)).toContain('fan.oscillate {"entity_id":"fan.living_room_fan_osc","oscillating":false}');
    await expect(osc).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
    await page.keyboard.press('Tab');
    await expect(rev).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect.poll(() => logged(page)).toContain('fan.set_direction');
    await expect(rev).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
  });

  test('the focus ring is a 2px outline on the power button, the pill and a row button', async ({ page }) => {
    await openDomain(page, 'fan=oscillating', caption);
    const seen: [string, string, string][] = [];
    for (const i of [1, 1, 1]) {
      await tabStops(page, i);
      const o = await focusedOutline(page);
      seen.push([o.style === 'none' ? 'none' : 'solid', o.width, o.offset]);
    }
    expect(seen).toEqual([
      ['solid', '2px', '2px'],
      ['solid', '2px', '3px'],
      ['solid', '2px', '2px'],
    ]);
  });
});

/**
 * H9 (plan 2.11): a keyboard-only run over the media card, the media tile, the chips and the sheet header actions, on the
 * built bundle (pages/media.ts, a player with every feature). Every focus is reached with Tab.
 */
async function mediaPage(page: Page, q: Record<string, string | number> = {}): Promise<string[]> {
  const errors = watchErrors(page);
  await stubFavicon(page);
  await page.goto(mediaUrl({ echo: 'none', ...q }));
  await page.waitForFunction(() => (window as unknown as { __media: { ready: boolean } }).__media.ready);
  await expect(page.locator('#card, #tile').first()).toBeVisible();
  await page.waitForTimeout(300);
  return errors;
}

/** The focused control as `kind:name`: sliders by label, buttons by data-action, data-chip, data-step or aria-label. */
const stopId = (page: Page) =>
  page.evaluate(() => {
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
    if (!el || el === document.body) return null;
    if (el.getAttribute('role') === 'slider') return `slider:${el.getAttribute('aria-label')}`;
    const named = el.dataset.action ?? (el.dataset.chip && `chip:${el.dataset.chip}`) ?? (el.dataset.step && `step:${el.dataset.step}`);
    return `${el.tagName.toLowerCase()}:${named ?? el.getAttribute('aria-label') ?? el.className}`;
  });

async function tabIds(page: Page, count: number, key = 'Tab'): Promise<(string | null)[]> {
  const ids: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    ids.push(await stopId(page));
  }
  return ids;
}

test.describe('media card, keyboard only', () => {
  test('Tab visits History, Position, Volume, the playback row and the Source and Sound mode chips', async ({ page }) => {
    const errors = await mediaPage(page, { show: 'card' });
    expect(await tabIds(page, 10)).toEqual([
      'button:History',
      'slider:Position, Kitchen speaker',
      'slider:Volume, Kitchen speaker',
      'button:previous',
      'button:play',
      'button:next',
      'button:mute',
      'button:power',
      'button:chip:source',
      'button:chip:soundMode',
    ]);
    expect(errors).toEqual([]);
  });

  test('the playback row and the chips follow the visual order, left to right', async ({ page }) => {
    await mediaPage(page, { show: 'card' });
    await tabIds(page, 3);
    const stops: FocusInfo[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      stops.push((await focusedElement(page))!);
    }
    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1]!;
      const cur = stops[i]!;
      expect(cur.top > prev.top || (cur.top === prev.top && cur.left > prev.left), `${i}: ${JSON.stringify(prev)} then ${JSON.stringify(cur)}`).toBe(true);
    }
  });

  test('Space on Pause sends media_pause and Enter on Mute sends volume_mute with the flag', async ({ page }) => {
    await mediaPage(page, { show: 'card' });
    await tabIds(page, 5);
    expect(await stopId(page)).toBe('button:play');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mediaCalls(page, 'media_pause')).length).toBe(1);
    await tabIds(page, 2);
    expect(await stopId(page)).toBe('button:mute');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await mediaCalls(page, 'volume_mute')).length).toBe(1);
    expect((await mediaCalls(page, 'volume_mute'))[0]!.data).toMatchObject({ is_volume_muted: true });
    await expect(page.locator('#card button[data-action="mute"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the focus ring is a 2px outline: offset 3px on the sliders, 2px on a button and on a chip', async ({ page }) => {
    await mediaPage(page, { show: 'card' });
    const seen: [string, string][] = [];
    for (const n of [2, 1, 1, 5]) {
      await tabIds(page, n);
      const o = await focusedOutline(page);
      seen.push([o.width, o.offset]);
      expect(o.style).not.toBe('none');
    }
    // The stops: Position, Volume, Previous, then the Source chip.
    expect(seen.map((s) => s[0])).toEqual(['2px', '2px', '2px', '2px']);
    expect(seen.map((s) => s[1])).toEqual(['3px', '3px', '2px', '2px']);
  });

  test('Tab from an open Source menu closes it and moves on to the Sound mode chip', async ({ page }) => {
    await mediaPage(page, { show: 'card' });
    await tabIds(page, 9);
    expect(await stopId(page)).toBe('button:chip:source');
    await page.keyboard.press('Enter');
    await expect(page.locator('#card .mitem')).toHaveCount(4);
    await page.keyboard.press('Tab');
    expect(await stopId(page)).toBe('button:chip:soundMode');
    await expect(page.locator('#card .mitem')).toHaveCount(0);
    expect(await mediaCalls(page)).toEqual([]);
  });

  test('the Pause label follows the action: Play, <name> while paused', async ({ page }) => {
    await mediaPage(page, { show: 'card', state: 'paused' });
    await expect(page.locator('#card button[data-action="play"]')).toHaveAttribute('aria-label', 'Play, Kitchen speaker');
  });
});

test.describe('media tile, keyboard only', () => {
  test('Tab visits the play button, the name, Volume down and Volume up', async ({ page }) => {
    const errors = await mediaPage(page, { show: 'tile' });
    expect(await tabIds(page, 4)).toEqual(['button:Pause, Kitchen speaker', 'button:body', 'button:Volume down, Kitchen speaker', 'button:Volume up, Kitchen speaker']);
    expect(errors).toEqual([]);
  });

  test('Space on the play button pauses, Enter on Volume up sends one volume_set', async ({ page }) => {
    await mediaPage(page, { show: 'tile' });
    await tabIds(page, 1);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mediaCalls(page, 'media_pause')).length).toBe(1);
    await tabIds(page, 3);
    expect(await stopId(page)).toBe('button:Volume up, Kitchen speaker');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await mediaCalls(page, 'volume_set')).length).toBe(1);
    expect((await mediaCalls(page, 'volume_set'))[0]!.data.volume_level).toBeGreaterThan(0.6);
  });

  test('Enter on the name opens the sheet, Escape closes it and focus returns to the name', async ({ page }) => {
    await mediaPage(page, { show: 'tile' });
    await tabIds(page, 2);
    await page.keyboard.press('Enter');
    await expect(page.locator('liquid-home-sheet liquid-home-media-card')).toBeVisible();
    expect(await stopId(page)).toBe('button:Close');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('liquid-home-sheet').evaluate((el) => (el as HTMLElement & { isOpen: boolean }).isOpen)).toBe(false);
    expect(await stopId(page)).toBe('button:body');
  });
});

test.describe('media sheet header actions, keyboard only', () => {
  async function openSheet(page: Page): Promise<string[]> {
    const errors = await mediaPage(page, { show: 'tile' });
    await tabIds(page, 2);
    await page.keyboard.press('Enter');
    await expect(page.locator('liquid-home-sheet liquid-home-media-card')).toBeVisible();
    return errors;
  }

  test('focus starts on Close; Shift+Tab walks back over History, Repeat and Shuffle, the card follows Close', async ({ page }) => {
    const errors = await openSheet(page);
    expect(await stopId(page)).toBe('button:Close');
    expect(await tabIds(page, 3, 'Shift+Tab')).toEqual(['button:History', 'button:Repeat off', 'button:Shuffle']);
    expect(await tabIds(page, 4)).toEqual(['button:Repeat off', 'button:History', 'button:Close', 'slider:Position, Kitchen speaker']);
    expect(errors).toEqual([]);
  });

  test('Space on Shuffle sends shuffle_set true and the button reads pressed; Enter on Repeat sends repeat_set all', async ({ page }) => {
    await openSheet(page);
    await tabIds(page, 3, 'Shift+Tab');
    expect(await stopId(page)).toBe('button:Shuffle');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mediaCalls(page, 'shuffle_set')).length).toBe(1);
    expect((await mediaCalls(page, 'shuffle_set'))[0]!.data).toMatchObject({ shuffle: true });
    await expect(page.locator('liquid-home-sheet button.shuffle')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await mediaCalls(page, 'repeat_set')).length).toBe(1);
    expect((await mediaCalls(page, 'repeat_set'))[0]!.data).toMatchObject({ repeat: 'all' });
  });

  test('the header actions are 44 px targets with the 2px focus ring', async ({ page }) => {
    await openSheet(page);
    // The sheet scales in (open animation): measure once it has settled.
    await page.waitForTimeout(900);
    const sizes = await page.locator('liquid-home-sheet button.act, liquid-home-sheet button.history, liquid-home-sheet button.close').evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
    expect(sizes).toHaveLength(4);
    for (const [w, h] of sizes) expect([w! >= 44, h! >= 44]).toEqual([true, true]);
    await tabIds(page, 3, 'Shift+Tab');
    const o = await focusedOutline(page);
    expect([o.style === 'none', o.width]).toEqual([false, '2px']);
  });
});
