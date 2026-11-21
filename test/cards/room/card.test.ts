// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The sheet is P12's: in this worktree openLightSheet() is the stub. Spy on it by its fixed signature.
vi.mock('../../../src/cards/sheet/open', () => ({ openLightSheet: vi.fn(), reconfigureLightSheet: vi.fn(), closeLightSheet: vi.fn(), lightSheet: vi.fn() }));

import { PALETTE, TINT, rgba, tone } from '@decibel95/liquid-core';
import { closeLightSheet, lightSheet, openLightSheet, reconfigureLightSheet } from '../../../src/cards/sheet/open';
import { LiquidHomeRoom } from '../../../src/cards/room';
import { CARD_TYPES, TAGS } from '../../../src/const';
import { lightWriters } from '../../../src/lights';
import { $, $$, AREA, GROUP, makeHass, mountRoom, text, tile, tiles, type AnyEl, type Call } from './helpers';

const sheet = vi.mocked(openLightSheet);
/** Inline styles as the DOM serialises them: rgba() with spaces. */
const css = (v: string) => v.replace(/,/g, ', ');
const WIDTHS = [780, 560, 360];
const GLASSES = ['dark', 'light'] as const;

beforeEach(() => {
  vi.useFakeTimers();
  sheet.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const settle = async (c: AnyEl) => {
  await c.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await c.updateComplete;
};

/** CHO-12: one member on, one off, one unavailable. */
function cho12(calls: Call[] = [], extra: Record<string, unknown> = {}, width?: number, glass: 'dark' | 'light' = 'dark') {
  const { hass, ids } = makeHass(calls);
  const card = mountRoom({ title: 'Living Room', entities: [ids.colourTemp, ids.off, ids.unavailable], look: { glass }, ...extra }, hass, width);
  return { card, hass, ids };
}

describe('room card rendering: one on, one off, one unavailable', () => {
  for (const glass of GLASSES) {
    for (const width of WIDTHS) {
      it(`${glass} glass at ${width}px`, async () => {
        const { card } = cho12([], {}, width, glass);
        await settle(card);
        const section = $(card, 'section.cluster')!;
        expect(section.classList.contains(`g-${glass}`)).toBe(true);
        expect(text($(card, 'h2'))).toBe('Living Room');
        expect(text($(card, '.sum'))).toBe('1 of 3 on');
        const [on, off, un] = tiles(card);
        expect([text(on.querySelector('.rname')), text(on.querySelector('.rv')), text(on.querySelector('.foot'))]).toEqual(['Ceiling Lights', '71%', 'On, 2631 K']);
        expect([text(off.querySelector('.rv')), text(off.querySelector('.foot'))]).toEqual(['Off', 'Off']);
        expect([text(un.querySelector('.rv')), text(un.querySelector('.foot'))]).toEqual(['--', 'Unavailable']);
        // CHO-11: the unavailable tile dims; the selected tile is the first one (as the cluster).
        expect(un.classList.contains('unavail')).toBe(true);
        expect(on.classList.contains('sel') && on.getAttribute('aria-pressed') === 'true').toBe(true);
        // Icons: the lamp colour while on (here the neutral, colour temperature, CHO-1 B), fg3 while off or unavailable.
        expect((on.querySelector('.ricon') as HTMLElement).style.color).toBe(tone(PALETTE.neutral, glass));
        expect((off.querySelector('.ricon') as HTMLElement).style.color).toBe('var(--lc-fg3)');
        expect((un.querySelector('.ricon') as HTMLElement).style.color).toBe('var(--lc-fg3)');
        // The strip for the selected light.
        expect(text($(card, '.strip .sname'))).toBe('Ceiling Lights');
        expect(text($(card, '.strip .sverb'))).toBe('On, 2631 K');
        expect(text($(card, '.strip .target'))).toBe('Brightness 71%');
        // Exactly one glass surface: one backdrop-filter in the whole shadow DOM, on the section (computed styles).
        const blurred = $$(card, '*').filter((el) => {
          const v = getComputedStyle(el).backdropFilter;
          return !!v && v !== 'none';
        });
        expect(blurred).toEqual([section]);
      });
    }
  }

  it('the stylesheet carries the cluster layouts: narrow scroller, 2 columns from 440px, 3 columns and padding 24 from 720px', () => {
    const sheetCss = LiquidHomeRoom.elementStyles.map((s) => (s as { cssText?: string }).cssText ?? '').join('\n');
    expect(sheetCss).toMatch(/\.rooms\s*{[^}]*overflow-x: auto[^}]*scroll-snap-type: x mandatory/);
    expect(sheetCss).toMatch(/flex: 0 0 min\(158px, 42cqw\)/);
    expect(sheetCss).toMatch(/@container \(min-width: 440px\)\s*{[^@]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(sheetCss).toMatch(/@container \(min-width: 720px\)\s*{\s*\.cluster\s*{\s*padding: 24px;[^@]*repeat\(3, minmax\(0, 1fr\)\)[^@]*\.big\s*{\s*font-size: 44px;/);
    // One backdrop-filter declaration (plus its -webkit- twin) in the whole card.
    expect(sheetCss.match(/(?<!-webkit-)backdrop-filter:/g)?.length).toBe(1);
  });
});

describe('room card sources', () => {
  it('area: the lights of the area, title from the area name, the group as power entity left out', async () => {
    const { hass, ids } = makeHass();
    const card = mountRoom({ area: AREA, power_entity: GROUP }, hass);
    await settle(card);
    expect(text($(card, 'h2'))).toBe('Living Room');
    expect(tiles(card).map((b) => text(b.querySelector('.rname')))).toEqual([
      'Ceiling Lights',
      'Entrance Color + White Lights',
      'Kitchen Lights',
      'Living Room RGBWW Lights',
      'Office RGBW Lights',
    ]);
    expect(card._config.source).toBe('area');
    // On/off-only: "On" and no steps (CHO-10).
    tile(card, 'Entrance Color + White Lights').click();
    await settle(card);
    expect($$(card, '.strip button.step')).toHaveLength(0);
    expect(text($(card, '.strip .target'))).toBe('On');
    expect(ids.onOffOnly).toBe('light.entrance_color_white_lights');
  });

  it('area with exclude', async () => {
    const { hass, ids } = makeHass();
    const card = mountRoom({ area: AREA, power_entity: GROUP, exclude: [ids.unavailable, ids.dimmed] }, hass);
    await settle(card);
    expect(tiles(card)).toHaveLength(3);
    expect(text($(card, '.sum'))).toBe('3 of 3 on');
  });

  it('list: in order, with a name override; source inferred from entities', async () => {
    const { hass, ids } = makeHass();
    const card = mountRoom({ entities: [ids.off, { entity: ids.colourHs, name: 'Sofa' }], look: { glass: 'dark' } }, hass);
    await settle(card);
    expect(card._config.source).toBe('list');
    expect(tiles(card).map((b) => text(b.querySelector('.rname')))).toEqual(['Living Room RGBWW Lights', 'Sofa']);
    expect(text($(card, 'h2'))).toBe('Lights');
    // A colour light draws its entity colour on the icon (COL-1).
    expect((tile(card, 'Sofa').querySelector('.ricon') as HTMLElement).style.color).toBe('#ff4070');
  });

  it('neither an area nor entities: the "choose an area" placeholder, no tiles, no power, no strip', async () => {
    const { hass } = makeHass();
    for (const raw of [{}, { entities: [] }]) {
      const card = mountRoom(raw, hass);
      await settle(card);
      expect(text($(card, '.empty'))).toBe('Choose an area in the card editor.');
      expect(tiles(card)).toHaveLength(0);
      expect($(card, '.power')).toBeNull();
      expect($(card, '.strip')).toBeNull();
      card.remove();
    }
  });

  it('an area without lights says so', async () => {
    const { hass } = makeHass();
    const card = mountRoom({ area: 'attic' }, hass);
    await settle(card);
    expect(text($(card, '.empty'))).toBe('No lights in this area.');
    expect(text($(card, 'h2'))).toBe('Attic');
  });

  it('setConfig rejects a non-light in entities or as power_entity', () => {
    const card = document.createElement('liquid-home-room') as AnyEl;
    expect(() => card.setConfig({ type: CARD_TYPES.room, entities: ['switch.x'] })).toThrow(/not a light/);
    expect(() => card.setConfig({ type: CARD_TYPES.room, area: AREA, power_entity: 'switch.x' })).toThrow(/not a light/);
    expect(() => card.setConfig(null as never)).toThrow(/invalid/);
  });
});

describe('header power: exactly one call', () => {
  it('without power_entity: one light.turn_off with every available member while any is on', async () => {
    const calls: Call[] = [];
    const { card, ids } = cho12(calls);
    await settle(card);
    const btn = $(card, 'header .power') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Switch Living Room');
    expect(btn.style.background).toBe(css(rgba(tone(PALETTE.neutral, 'dark'), 0.28)));
    btn.click();
    await settle(card);
    expect(calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: [ids.colourTemp, ids.off] } }]);
  });

  it('without power_entity: one light.turn_on with every available member while all are off', async () => {
    const calls: Call[] = [];
    const { hass, ids } = makeHass(calls);
    const card = mountRoom({ entities: [ids.off, ids.unavailable] }, hass);
    await settle(card);
    const btn = $(card, 'header .power') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    await settle(card);
    expect(calls).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: [ids.off] } }]);
  });

  it('with power_entity: one call to the group only, named after it', async () => {
    const calls: Call[] = [];
    const { card } = cho12(calls, { power_entity: GROUP });
    await settle(card);
    const btn = $(card, 'header .power') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Switch Living Room Lights');
    btn.click();
    await settle(card);
    expect(calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: GROUP } }]);
  });

  it('a failed call is spoken through the alert span (room.commandFailed), and cleared by the next press', async () => {
    const { hass, ids } = makeHass();
    let fail = true;
    hass.callService = (async () => {
      if (fail) throw new Error('rejected');
    }) as typeof hass.callService;
    const card = mountRoom({ title: 'Living Room', entities: [ids.colourTemp] }, hass);
    await settle(card);
    const alert = $(card, '.sr[role=alert]')!;
    expect(text(alert)).toBe('');
    ($(card, 'header .power') as HTMLButtonElement).click();
    await settle(card);
    expect(text(alert)).toBe('Living Room: Command failed');
    fail = false;
    ($(card, 'header .power') as HTMLButtonElement).click();
    await settle(card);
    expect(text(alert)).toBe('');
  });

  it('a trailing step never undoes the power call: every member writer is discarded first (core EntityWriter.discard)', async () => {
    const calls: Call[] = [];
    const { card, ids } = cho12(calls);
    await settle(card);
    const up = $$(card, '.strip .step')[1] as HTMLButtonElement;
    up.click(); // leading write at once: 81 %
    await settle(card);
    up.click(); // inside the 300 ms window: pending (91 %)
    await settle(card);
    ($(card, 'header .power') as HTMLButtonElement).click();
    await settle(card);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([
      { domain: 'light', service: 'turn_on', data: { entity_id: ids.colourTemp, brightness_pct: 81 } },
      { domain: 'light', service: 'turn_off', data: { entity_id: [ids.colourTemp, ids.off] } },
    ]);
  });

  it('the power entity writer is discarded too while another card holds it (a tile on the group)', async () => {
    const calls: Call[] = [];
    const { card } = cho12(calls, { power_entity: GROUP });
    await settle(card);
    const w = lightWriters.acquire(GROUP);
    w.hass = card.hass;
    w.set({ on: true, brightness_pct: 10 });
    w.set({ on: true, brightness_pct: 20 }); // pending behind the leading write
    await settle(card);
    calls.length = 0;
    ($(card, 'header .power') as HTMLButtonElement).click();
    await settle(card);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: GROUP } }]);
    lightWriters.release(w);
  });

  it("the power entity group's own members are discarded too when another card holds their writers", async () => {
    const calls: Call[] = [];
    // The room lists other lights; the group's member Living Room RGBWW sits on a tile elsewhere.
    const { hass, ids } = makeHass(calls);
    const card = mountRoom({ entities: [ids.dimmed], power_entity: GROUP }, hass);
    await settle(card);
    const member = 'light.living_room_rgbww_lights';
    const w = lightWriters.acquire(member);
    w.hass = hass;
    w.set({ on: true, brightness_pct: 10 });
    w.set({ on: true, brightness_pct: 20 }); // pending behind the leading write
    await settle(card);
    calls.length = 0;
    ($(card, 'header .power') as HTMLButtonElement).click();
    await settle(card);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: GROUP } }]);
    lightWriters.release(w);
  });

  it('nothing available: the button is disabled and sends nothing', async () => {
    const calls: Call[] = [];
    const { hass, ids } = makeHass(calls);
    const card = mountRoom({ entities: [ids.unavailable] }, hass);
    await settle(card);
    const btn = $(card, 'header .power') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    await settle(card);
    expect(calls).toEqual([]);
  });
});

describe('writer leases', () => {
  it('one lease per member while connected, all released on disconnect', async () => {
    const { card, ids } = cho12();
    await settle(card);
    expect([ids.colourTemp, ids.off, ids.unavailable].map((id) => lightWriters.refs(id))).toEqual([1, 1, 1]);
    card.remove();
    expect([ids.colourTemp, ids.off, ids.unavailable].map((id) => lightWriters.refs(id))).toEqual([0, 0, 0]);
  });

  it('a member that leaves the area has its lease released', async () => {
    const { hass, ids } = makeHass();
    const card = mountRoom({ area: AREA, power_entity: GROUP }, hass);
    await settle(card);
    expect(lightWriters.refs(ids.dimmed)).toBe(1);
    // The dimmed Kitchen Lights get their own area: a registry change, so a new hass object.
    card.hass = { ...hass, entities: { ...hass.entities, [ids.dimmed]: { ...hass.entities[ids.dimmed], area_id: 'hallway' } } };
    await settle(card);
    expect(tiles(card).map((b) => text(b.querySelector('.rname')))).not.toContain('Kitchen Lights');
    expect(lightWriters.refs(ids.dimmed)).toBe(0);
    expect(lightWriters.refs('light.ceiling_lights')).toBe(1);
  });
});

describe('selection, strip and sheet', () => {
  it('tapping a tile selects it for the strip', async () => {
    const { card } = cho12();
    await settle(card);
    tile(card, 'Living Room RGBWW Lights').click();
    await settle(card);
    expect(tile(card, 'Living Room RGBWW Lights').classList.contains('sel')).toBe(true);
    expect(tile(card, 'Ceiling Lights').classList.contains('sel')).toBe(false);
    expect(text($(card, '.strip .sname'))).toBe('Living Room RGBWW Lights');
    expect(text($(card, '.strip .target'))).toBe('Brightness Off');
    // Off: both steps aria-disabled, as the cluster.
    expect($$(card, '.strip .step').map((b) => b.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
  });

  it("tapping the light's name calls openLightSheet(this, config) with the light card config", async () => {
    const { card, ids } = cho12([], { entities: [{ entity: 'light.ceiling_lights', name: 'Sofa' }], look: { glass: 'light', blur: 12 } });
    await settle(card);
    ($(card, '.strip .who') as HTMLButtonElement).click();
    expect(sheet).toHaveBeenCalledTimes(1);
    const [host, config] = sheet.mock.calls[0];
    expect(host).toBe(card);
    expect(config).toMatchObject({ type: CARD_TYPES.light, entity: ids.colourTemp, name: 'Sofa', look: { glass: 'light', blur: 12, motion: 'rich' }, config_version: 1 });
  });

  it('the White and Colour mode buttons open the sheet too; the active one carries the tile tint of the lamp colour', async () => {
    const { hass, ids } = makeHass();
    const card = mountRoom({ entities: [ids.colourHs], look: { glass: 'dark' } }, hass);
    await settle(card);
    const [white, colour] = $$(card, '.strip .mode') as HTMLButtonElement[];
    expect([white.hidden, colour.hidden]).toEqual([false, false]);
    expect([white.getAttribute('aria-pressed'), colour.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect(colour.style.background).toBe(css(rgba('#ff4070', TINT.tile)));
    expect(colour.style.borderColor).toBe(css(rgba('#ff4070', TINT.tileEdge)));
    white.click();
    colour.click();
    expect(sheet).toHaveBeenCalledTimes(2);
    // As the prototype sets pillMode before opening: the sheet opens the light card in White or Colour mode.
    expect(sheet.mock.calls.map((c) => [c[0], (c[1] as { entity: string }).entity, c[2]])).toEqual([
      [card, ids.colourHs, { mode: 'white' }],
      [card, ids.colourHs, { mode: 'colour' }],
    ]);
    ($(card, '.strip .who') as HTMLButtonElement).click();
    expect(sheet.mock.calls[2][2]).toBeUndefined();
  });

  it('a new config while its sheet is open reconfigures the light card in it (name override and look)', async () => {
    const reconfigure = vi.mocked(reconfigureLightSheet);
    const current = vi.mocked(lightSheet);
    reconfigure.mockClear();
    const { hass, ids } = makeHass();
    const card = mountRoom({ entities: [ids.colourHs, ids.off] }, hass);
    await settle(card);
    // No sheet of this card open: nothing to follow.
    card.setConfig({ type: CARD_TYPES.room, entities: [ids.colourHs, ids.off] });
    expect(reconfigure).not.toHaveBeenCalled();
    current.mockReturnValue({ owner: card, entity: ids.off } as never);
    card.setConfig({ type: CARD_TYPES.room, entities: [ids.colourHs, { entity: ids.off, name: 'Sofa' }], look: { glass: 'light' } });
    expect(reconfigure).toHaveBeenCalledTimes(1);
    expect(reconfigure.mock.calls[0][0]).toBe(card);
    expect(reconfigure.mock.calls[0][1]).toMatchObject({ entity: ids.off, name: 'Sofa', look: { glass: 'light' } });
    // Another card's sheet is left alone.
    current.mockReturnValue({ owner: document.body, entity: ids.off } as never);
    card.setConfig({ type: CARD_TYPES.room, entities: [ids.colourHs, ids.off] });
    expect(reconfigure).toHaveBeenCalledTimes(1);
    current.mockReset();
  });

  it('a new config without the light of its open sheet closes that sheet', async () => {
    const reconfigure = vi.mocked(reconfigureLightSheet);
    const close = vi.mocked(closeLightSheet);
    const current = vi.mocked(lightSheet);
    reconfigure.mockClear();
    close.mockClear();
    const { hass, ids } = makeHass();
    const card = mountRoom({ entities: [ids.colourHs, ids.off] }, hass);
    await settle(card);
    current.mockReturnValue({ owner: card, entity: ids.off } as never);
    card.setConfig({ type: CARD_TYPES.room, entities: [ids.colourHs] });
    expect(close).toHaveBeenCalledWith(card);
    expect(reconfigure).not.toHaveBeenCalled();
    // An area room that now excludes the light closes it too.
    close.mockClear();
    current.mockReturnValue({ owner: card, entity: ids.dimmed } as never);
    card.setConfig({ type: CARD_TYPES.room, area: AREA, exclude: [ids.dimmed] });
    expect(close).toHaveBeenCalledWith(card);
    current.mockReset();
  });

  it('a brightness-only light has no mode buttons (strip without modes)', async () => {
    const { hass, ids } = makeHass();
    const card = mountRoom({ entities: [ids.brightnessOnly] }, hass);
    await settle(card);
    expect($(card, '.strip')!.classList.contains('nomodes')).toBe(true);
    expect($(card, '.strip .modes')).toBeNull();
  });

  it('step buttons write brightness_pct through the 300 ms throttle and show the sent level at once', async () => {
    const calls: Call[] = [];
    const { hass, ids } = makeHass(calls);
    const card = mountRoom({ entities: [ids.dimmed] }, hass);
    await settle(card);
    const [down, up] = $$(card, '.strip .step') as HTMLButtonElement[];
    up.click();
    await settle(card);
    expect(text($(card, '.strip .target'))).toBe('Brightness 20%');
    expect(calls).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: ids.dimmed, brightness_pct: 20 } }]);
    up.click();
    up.click();
    await settle(card);
    // Within the throttle window: shown at once, sent once the window passes.
    expect(text($(card, '.strip .target'))).toBe('Brightness 40%');
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.slice(1)).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: ids.dimmed, brightness_pct: 40 } }]);
    down.click();
    await settle(card);
    expect(text($(card, '.strip .target'))).toBe('Brightness 30%');
  });

  it('getStubConfig picks the first area with lights; grid options as the cluster', () => {
    const { hass } = makeHass();
    expect(LiquidHomeRoom.getStubConfig(hass)).toEqual({ type: CARD_TYPES.room, source: 'area', area: 'hallway', config_version: 1 });
    expect(LiquidHomeRoom.getStubConfig()).toEqual({ type: CARD_TYPES.room, source: 'area', config_version: 1 });
    const card = document.createElement(TAGS.room) as LiquidHomeRoom;
    expect(card.getGridOptions()).toEqual({ columns: 'full', rows: 'auto', min_columns: 12 });
    expect(card.getCardSize()).toBeGreaterThan(0);
  });

  // The picker entry (D-16) is made in src/register.ts: test/register.test.ts.

  it('honours --lc-radius and --lc-blur over the look values (D-3)', () => {
    const sheetText = LiquidHomeRoom.elementStyles.map((s) => (s as { cssText?: string }).cssText ?? '').join('\n');
    expect(sheetText).toContain('border-radius: var(--lc-radius, 36px)');
    expect(sheetText).toContain('backdrop-filter: blur(var(--lc-blur, var(--_blur, 30px))) saturate(170%)');
  });
});
