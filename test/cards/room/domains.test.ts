// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The sheet is H3's: spy on the openers by their fixed signatures (the strip name button, plan 2.9).
vi.mock('../../../src/cards/sheet/open', () => ({
  openLightSheet: vi.fn(),
  openEntitySheet: vi.fn(),
  reconfigureLightSheet: vi.fn(),
  closeLightSheet: vi.fn(),
  lightSheet: vi.fn(),
}));

import { ICONS, PALETTE, TINT, rgba, tone, type HomeAssistant } from '@decibel95/liquid-core';
import { openEntitySheet, openLightSheet } from '../../../src/cards/sheet/open';
import '../../../src/cards/room';
import '../../../src/cards/fan';
import { normalizeConfig, pruneConfig } from '../../../src/cards/room/config';
import { roomMembers } from '../../../src/cards/room/members';
import { CARD_TYPES, TAGS } from '../../../src/const';
import { coverWriters } from '../../../src/covers';
import { fanWriters } from '../../../src/fans';
import { COVER_FIXTURES } from '../../covers/fixtures';
import { FAN_FIXTURES } from '../../fans/fixtures';
import { $, $$, AREA, BLIND, GROUP, makeHass, makeMixedHass, mountRoom, text, tile, tiles, type AnyEl, type Call } from './helpers';

const cfg = (raw: Record<string, unknown>) => normalizeConfig({ type: CARD_TYPES.room, ...raw });
const ALL = ['light', 'cover', 'fan'];
/** Inline styles as the DOM serialises them: rgba() with spaces. */
const css = (v: string) => v.replace(/,/g, ', ');
const neutral = (glass: 'dark' | 'light') => tone(PALETTE.neutral, glass);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  vi.mocked(openLightSheet).mockClear();
  vi.mocked(openEntitySheet).mockClear();
});
afterEach(async () => {
  document.body.innerHTML = '';
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const settle = async (c: AnyEl) => {
  await c.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await c.updateComplete;
};

/** A list room over the mixed hass, selecting `entity` (the strip follows the selected tile). */
async function stripFor(entity: string, extra: Record<string, unknown> = {}, calls: Call[] = [], tweak?: Parameters<typeof makeMixedHass>[1]) {
  const { hass, ids } = makeMixedHass(calls, tweak);
  const card = mountRoom({ domains: ALL, entities: [entity], look: { glass: 'dark' }, ...extra }, hass);
  await settle(card);
  return { card, hass, ids };
}
const modes = (c: AnyEl) => $$(c, '.strip .mode') as HTMLButtonElement[];
const labels = (c: AnyEl) => modes(c).map((b) => b.getAttribute('aria-label'));
const steps = (c: AnyEl) => $$(c, '.strip .step') as HTMLButtonElement[];
const stepOff = (c: AnyEl) => steps(c).map((b) => b.getAttribute('aria-disabled'));
const iconPath = (b: Element) => b.querySelector('.ricon path')!.getAttribute('d');

describe('domains option (P2-CHO-17)', () => {
  it('defaults to lights only; a subset is kept in display order, unknown values and repeats dropped', () => {
    expect(cfg({}).domains).toEqual(['light']);
    expect(cfg({ domains: [] }).domains).toEqual(['light']);
    expect(cfg({ domains: 'cover' }).domains).toEqual(['light']);
    expect(cfg({ domains: ['fan', 'switch', 'cover', 'fan'] }).domains).toEqual(['cover', 'fan']);
    expect(cfg({ domains: ['fan', 'light', 'cover'] }).domains).toEqual(['light', 'cover', 'fan']);
  });

  it('an editor writes domains only when it is not the default', () => {
    expect(pruneConfig(cfg({ area: AREA }))).not.toHaveProperty('domains');
    expect(pruneConfig(cfg({ area: AREA, domains: ['light'] }))).not.toHaveProperty('domains');
    expect(pruneConfig(cfg({ area: AREA, domains: ['cover', 'light'] })).domains).toEqual(['light', 'cover']);
  });

  it('area source: every allowed entity of the area, entity or device area, lights then covers then fans, each by name', () => {
    const { hass, ids } = makeMixedHass();
    const names = (domains?: string[]) => roomMembers(hass, cfg({ area: AREA, power_entity: GROUP, ...(domains ? { domains } : {}) })).map((m) => m.entity);
    const lights = ['light.ceiling_lights', 'light.entrance_color_white_lights', ids.dimmed, 'light.living_room_rgbww_lights', ids.unavailable];
    // Hall Window and Living Room Window sit in the area through their device, the blind fixture and the fans directly.
    const covers = [BLIND, 'cover.hall_window', 'cover.living_room_window'];
    const fans = ['fan.lh_fixture_onoff', 'fan.living_room_fan', 'fan.lh_fixture_ten'];
    expect(names(ALL)).toEqual([...lights, ...covers, ...fans]);
    expect(names(['cover'])).toEqual(covers);
    expect(names(['fan', 'cover'])).toEqual([...covers, ...fans]);
    expect(names(['light', 'fan'])).toEqual([...lights, ...fans]);
    // The Hallway garage stays in its area; the hidden Ceiling Fan stays out.
    expect(names(ALL)).not.toContain('cover.garage_door');
    expect(names(ALL)).not.toContain('fan.ceiling_fan');
    expect(roomMembers(hass, cfg({ area: 'hallway', domains: ALL })).map((m) => m.entity)).toEqual([ids.brightnessOnly, 'cover.garage_door']);
  });

  it('a 0.2 room config (no domains) renders exactly the same members as before, covers and fans in the area or not', async () => {
    const plain = makeHass().hass;
    const { hass, ids } = makeMixedHass();
    const configs = [{ area: AREA, power_entity: GROUP }, { area: AREA }, { area: 'hallway' }, { entities: [ids.off, { entity: 'light.ceiling_lights', name: 'Sofa' }, ids.dimmed] }];
    for (const raw of configs) {
      const before = roomMembers(plain, cfg(raw));
      expect(before.length).toBeGreaterThan(0);
      expect(roomMembers(hass, cfg(raw))).toEqual(before);
      const a = mountRoom(raw, plain);
      const b = mountRoom(raw, hass);
      await settle(a);
      await settle(b);
      const shown = (c: AnyEl) => tiles(c).map((t) => [t.getAttribute('aria-label'), iconPath(t)]);
      expect(shown(b)).toEqual(shown(a));
      expect(text($(b, '.sum'))).toBe(text($(a, '.sum')));
      expect(text($(b, '.sum'))).toMatch(/ of \d+ on$/);
    }
  });

  it('list source: each entity must be of an allowed domain, the error names the domain', () => {
    const card = document.createElement(TAGS.room) as AnyEl;
    expect(() => card.setConfig({ type: CARD_TYPES.room, entities: ['cover.hall_window'] })).toThrow('"cover.hall_window" in entities is a cover, and domains does not include cover');
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ['light', 'cover'], entities: ['light.a', 'fan.living_room_fan'] })).toThrow(/is a fan, and domains does not include fan/);
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ['light', 'cover'], entities: ['switch.x'] })).toThrow('"switch.x" in entities is not a light or cover');
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ALL, entities: ['switch.x'] })).toThrow('is not a light, cover or fan');
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ALL, entities: ['light.a', 'cover.b', { entity: 'fan.c', name: 'C' }] })).not.toThrow();
    // power_entity still must be a light.
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ALL, area: AREA, power_entity: 'fan.living_room_fan' })).toThrow(/power_entity "fan.living_room_fan" is not a light/);
  });

  it('list source with covers and fans: the listed order and name overrides', () => {
    const { hass } = makeMixedHass();
    const members = roomMembers(hass, cfg({ domains: ALL, entities: ['fan.lh_fixture_ten', { entity: 'cover.hall_window', name: 'Hall' }, 'light.ceiling_lights'] }));
    expect(members).toEqual([
      { entity: 'fan.lh_fixture_ten', name: 'Ten Speed Fan' },
      { entity: 'cover.hall_window', name: 'Hall' },
      { entity: 'light.ceiling_lights', name: 'Ceiling Lights' },
    ]);
  });
});

describe('header power and summary (P2-CHO-17, D-9)', () => {
  it('power switches lights only, in one call, and is hidden in a room without lights', async () => {
    const calls: Call[] = [];
    const { hass } = makeMixedHass(calls);
    const mixed = mountRoom({ area: AREA, domains: ALL }, hass);
    const coversFans = mountRoom({ area: AREA, domains: ['cover', 'fan'] }, hass);
    const noLights = mountRoom({ domains: ALL, entities: ['cover.hall_window', 'fan.living_room_fan'] }, hass);
    await settle(mixed);
    await settle(coversFans);
    await settle(noLights);
    expect($(coversFans, '.power')).toBeNull();
    expect($(noLights, '.power')).toBeNull();
    const power = $(mixed, '.power') as HTMLButtonElement;
    expect(power.getAttribute('aria-pressed')).toBe('true');
    power.click();
    expect(calls).toHaveLength(1);
    expect(calls[0].domain).toBe('light');
    expect(calls[0].service).toBe('turn_off');
    expect((calls[0].data.entity_id as string[]).every((id) => id.startsWith('light.'))).toBe(true);
  });

  it('a power entity keeps the button in a light room; a room without the light domain never shows it', async () => {
    const { hass } = makeMixedHass();
    const withPower = mountRoom({ area: AREA, domains: ALL, power_entity: GROUP }, hass);
    const noLightDomain = mountRoom({ area: AREA, domains: ['cover'], power_entity: GROUP }, hass);
    await settle(withPower);
    await settle(noLightDomain);
    expect($(withPower, '.power')).not.toBeNull();
    expect($(noLightDomain, '.power')).toBeNull();
  });

  it('lights only: "N of M on"; with a cover or a fan: "N of M active", counting lights on, covers open or moving, fans on', async () => {
    const { hass, ids } = makeMixedHass();
    const lights = mountRoom({ domains: ALL, entities: [ids.colourTemp, ids.off, ids.unavailable] }, hass);
    // On: Ceiling Lights; open: Hall Window; moving: the closing Hall Window; on: Bedroom Fan. Closed garage, fan off.
    hass.states['cover.hall_window_closing'] = COVER_FIXTURES.hallClosing() as never;
    hass.states['cover.garage_door'] = COVER_FIXTURES.garage() as never;
    const mixed = mountRoom(
      { domains: ALL, entities: [ids.colourTemp, ids.off, 'cover.hall_window', 'cover.hall_window_closing', 'cover.garage_door', 'fan.lh_fixture_onoff', 'fan.living_room_fan'] },
      hass,
    );
    await settle(lights);
    await settle(mixed);
    expect(text($(lights, '.sum'))).toBe('1 of 3 on');
    expect(text($(mixed, '.sum'))).toBe('4 of 7 active');
    // A cover-only room reads "active" too.
    const covers = mountRoom({ domains: ['cover'], entities: ['cover.hall_window', 'cover.garage_door'] }, hass);
    await settle(covers);
    expect(text($(covers, '.sum'))).toBe('1 of 2 active');
  });

  it('an area with nothing of the room domains says so', async () => {
    const { hass } = makeMixedHass();
    const card = mountRoom({ area: 'attic', domains: ALL }, hass);
    const lightsOnly = mountRoom({ area: 'attic' }, hass);
    await settle(card);
    await settle(lightsOnly);
    expect(text($(card, '.empty'))).toBe('No devices in this area.');
    expect(text($(lightsOnly, '.empty'))).toBe('No lights in this area.');
  });
});

describe('room tiles per domain (P2-CHO-19)', () => {
  for (const glass of ['dark', 'light'] as const) {
    it(`icons, values and the neutral or fg3 icon colour on ${glass} glass`, async () => {
      const { hass } = makeMixedHass([], (h) => {
        h.states['cover.garage_door'] = COVER_FIXTURES.garageOpen() as never;
        h.states['cover.garage_door'].entity_id = 'cover.garage_door';
        h.states['cover.hall_window_unavailable'] = COVER_FIXTURES.unavailable() as never;
        h.states['cover.pergola_roof'] = COVER_FIXTURES.pergola() as never;
        h.states['fan.living_room_fan_unavailable'] = FAN_FIXTURES.unavailable() as never;
      });
      const card = mountRoom(
        {
          domains: ALL,
          look: { glass },
          entities: [
            'cover.hall_window',
            { entity: 'cover.garage_door', name: 'Garage' },
            { entity: 'cover.pergola_roof', name: 'Pergola' },
            { entity: 'cover.hall_window_unavailable', name: 'Gone' },
            'fan.lh_fixture_ten',
            'fan.living_room_fan',
            'fan.lh_fixture_onoff',
            { entity: 'fan.living_room_fan_unavailable', name: 'Gone Fan' },
          ],
        },
        hass,
      );
      await settle(card);
      const row = (name: string) => {
        const b = tile(card, name);
        return [text(b.querySelector('.rv')), text(b.querySelector('.foot')), iconPath(b), (b.querySelector('.ricon') as HTMLElement).style.color, b.classList.contains('unavail')];
      };
      const on = neutral(glass);
      const off = 'var(--lc-fg3)';
      expect(row('Hall Window')).toEqual(['10%', 'Open', ICONS.blinds, on, false]);
      expect(row('Garage')).toEqual(['Open', 'Open', ICONS.door, on, false]);
      expect(row('Pergola')).toEqual(['Closed', 'Closed, tilt 60%', ICONS.blinds, off, false]);
      expect(row('Gone')).toEqual(['--', 'Unavailable', ICONS.blinds, off, true]);
      expect(row('Ten Speed Fan')).toEqual(['40%', 'On', ICONS.fan, on, false]);
      expect(row('Living Room Fan')).toEqual(['Off', 'Off', ICONS.fan, off, false]);
      expect(row('Bedroom Fan')).toEqual(['On', 'On', ICONS.fan, on, false]);
      expect(row('Gone Fan')).toEqual(['--', 'Unavailable', ICONS.fan, off, true]);
      // The tile name holds every word the tile shows (WCAG 2.5.3).
      expect(tile(card, 'Hall Window').getAttribute('aria-label')).toBe('Hall Window, 10%, Open');
    });
  }

  it('a word as the tile value never grows the tile: the cluster value size, then an ellipsis (P2-CHO-6)', () => {
    const sheetCss = (customElements.get(TAGS.room) as unknown as { elementStyles: { cssText?: string }[] }).elementStyles.map((x) => x.cssText ?? '').join('\n');
    const rule = sheetCss.match(/\.room \.big\s*{([^}]*)}/)![1];
    expect(rule).toMatch(/min-width: 0;[^}]*overflow-x: clip;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    // Only the x axis clips: the value has line-height 1, so a y clip (overflow or overflow-y) would cut descenders.
    expect(rule).not.toMatch(/(^|[\s;])overflow(-y)?\s*:/);
  });

  it('exactly one backdrop-filter in the whole card, with every domain and the strip of each', async () => {
    const { hass } = makeMixedHass();
    const card = mountRoom({ area: AREA, domains: ALL, look: { glass: 'light' } }, hass);
    await settle(card);
    const section = $(card, 'section.cluster')!;
    for (const name of ['Ceiling Lights', 'Hall Window', 'Living Room Fan']) {
      tile(card, name).click();
      await settle(card);
      const blurred = $$(card, '*').filter((el) => {
        const v = getComputedStyle(el).backdropFilter;
        return !!v && v !== 'none';
      });
      expect(blurred).toEqual([section]);
    }
  });
});

describe('cover strip (P2-CHO-18)', () => {
  it('Open, Stop, Close and the 10 % steps; nothing disabled on a cover at 10 %', async () => {
    const { card } = await stripFor('cover.hall_window');
    expect(labels(card)).toEqual(['Open', 'Stop', 'Close']);
    expect(modes(card).map((b) => b.disabled)).toEqual([false, false, false]);
    expect(modes(card).some((b) => b.hasAttribute('aria-pressed'))).toBe(false);
    expect($(card, '.strip .modes')!.getAttribute('aria-label')).toBe('Cover actions');
    expect(steps(card).map((b) => b.getAttribute('aria-label'))).toEqual(['Close 10%', 'Open 10%']);
    expect(stepOff(card)).toEqual(['false', 'false']);
    expect(text($(card, '.strip .target'))).toBe('Position 10%');
    expect(text($(card, '.strip .sverb'))).toBe('Open');
  });

  it('disabled states: closed, fully open, moving (Stop tinted), unavailable', async () => {
    const st = async (fixture: keyof typeof COVER_FIXTURES) => {
      const s = COVER_FIXTURES[fixture]();
      const { card } = await stripFor(s.entity_id, {}, [], (h) => (h.states[s.entity_id] = s as never));
      return { card, open: modes(card).map((b) => b.disabled), steps: stepOff(card), stop: modes(card)[1]?.style.background };
    };
    expect(await st('hallClosed')).toMatchObject({ open: [false, false, true], steps: ['true', 'false'] });
    expect(await st('hallOpen')).toMatchObject({ open: [true, false, false], steps: ['false', 'true'] });
    const closing = await st('hallClosing');
    expect(closing).toMatchObject({ open: [false, false, true], stop: css(rgba(neutral('dark'), TINT.tile)) });
    expect(modes(closing.card)[0].style.background).toBe('');
    const un = await st('unavailable');
    expect(un).toMatchObject({ open: [true, true, true], steps: ['true', 'true'] });
    expect(text($(un.card, '.strip .target'))).toBe('Position --');
  });

  it('a garage (toggle cover without Stop) has no row and no steps; a tilt-only cover uses the tilt forms', async () => {
    const garage = await stripFor('cover.garage_door');
    expect(modes(garage.card)).toEqual([]);
    expect(steps(garage.card)).toEqual([]);
    expect($(garage.card, '.strip')!.classList.contains('nomodes')).toBe(true);
    const s = COVER_FIXTURES.pergola();
    const tilt = await stripFor(s.entity_id, {}, [], (h) => (h.states[s.entity_id] = s as never));
    expect(labels(tilt.card)).toEqual(['Open tilt', 'Stop tilt', 'Close tilt']);
    expect(steps(tilt.card).map((b) => b.getAttribute('aria-label'))).toEqual(['Close tilt 10%', 'Open tilt 10%']);
    expect(text($(tilt.card, '.strip .target'))).toBe('Tilt 60%');
  });

  it('Open, Stop and Close go out at once and cancel a pending step', async () => {
    const calls: Call[] = [];
    const { card } = await stripFor('cover.hall_window', {}, calls);
    steps(card)[1].click();
    await settle(card);
    expect(text($(card, '.strip .target'))).toBe('Position 20%');
    modes(card)[0].click();
    expect(calls).toEqual([{ domain: 'cover', service: 'open_cover', data: { entity_id: 'cover.hall_window' } }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    modes(card)[1].click();
    modes(card)[2].click();
    expect(calls.map((c) => c.service)).toEqual(['open_cover', 'stop_cover', 'close_cover']);
  });

  it('three Plus taps give one set_cover_position 500 ms after the last tap', async () => {
    const calls: Call[] = [];
    const { card } = await stripFor('cover.hall_window', {}, calls);
    for (let i = 0; i < 3; i++) {
      steps(card)[1].click();
      await settle(card);
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(text($(card, '.strip .target'))).toBe('Position 40%');
    // The last tap was at 400 ms and the clock is at 600 ms: at 899 ms nothing has gone out yet, at 900 ms one call.
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([{ domain: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.hall_window', position: 40 } }]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
  });
});

describe('fan strip (P2-CHO-18)', () => {
  it('power and Oscillate with aria-pressed, the speed steps; no direction or preset on the strip', async () => {
    const calls: Call[] = [];
    const { card } = await stripFor('fan.living_room_fan', {}, calls);
    expect(labels(card)).toEqual(['Switch Living Room Fan', 'Oscillate']);
    expect(modes(card).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect($(card, '.strip .modes')!.getAttribute('aria-label')).toBe('Fan controls');
    expect(steps(card).map((b) => b.getAttribute('aria-label'))).toEqual(['Slower', 'Faster']);
    // Off: both steps disabled, the value "--".
    expect(stepOff(card)).toEqual(['true', 'true']);
    expect(text($(card, '.strip .target'))).toBe('Speed --');
    modes(card)[0].click();
    await settle(card);
    modes(card)[1].click();
    await settle(card);
    expect(calls).toEqual([
      { domain: 'fan', service: 'turn_on', data: { entity_id: 'fan.living_room_fan' } },
      { domain: 'fan', service: 'oscillate', data: { entity_id: 'fan.living_room_fan', oscillating: true } },
    ]);
  });

  it('on at the lowest step: Slower disabled, Faster enabled, power and Oscillate tinted when on', async () => {
    const s = FAN_FIXTURES.oscillating();
    const { card } = await stripFor(s.entity_id, {}, [], (h) => (h.states[s.entity_id] = s as never));
    expect(stepOff(card)).toEqual(['true', 'false']);
    expect(text($(card, '.strip .target'))).toBe('Speed 33%');
    expect(modes(card).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    expect(modes(card).map((b) => b.style.background)).toEqual([css(rgba(neutral('dark'), TINT.tile)), css(rgba(neutral('dark'), TINT.tile))]);
  });

  it('an on/off-only fan: power only, no steps; unavailable: everything disabled', async () => {
    const onoff = await stripFor('fan.lh_fixture_onoff');
    expect(labels(onoff.card)).toEqual(['Switch Bedroom Fan']);
    expect(steps(onoff.card)).toEqual([]);
    const s = FAN_FIXTURES.unavailable();
    const un = await stripFor(s.entity_id, {}, [], (h) => (h.states[s.entity_id] = s as never));
    expect(modes(un.card).map((b) => b.disabled)).toEqual([true, true]);
    expect(stepOff(un.card)).toEqual(['true', 'true']);
  });

  it('power is gated by the feature bits: off without TURN_ON is disabled', async () => {
    const s = FAN_FIXTURES.off();
    s.attributes.supported_features = 55 - 32;
    const { card } = await stripFor(s.entity_id, {}, [], (h) => (h.states[s.entity_id] = s as never));
    expect(modes(card)[0].disabled).toBe(true);
  });

  it('Faster taps: a leading set_percentage, at most one per 300 ms, and one final call', async () => {
    const calls: Call[] = [];
    const { card } = await stripFor('fan.lh_fixture_ten', {}, calls);
    for (let i = 0; i < 3; i++) {
      steps(card)[1].click();
      await settle(card);
      await vi.advanceTimersByTimeAsync(50);
    }
    // 10 speeds at 40 %: the first tap goes out at once (50), the next two coalesce into the final call (70).
    expect(calls.map((c) => c.data.percentage)).toEqual([50]);
    expect(text($(card, '.strip .target'))).toBe('Speed 70%');
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toEqual([
      { domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.lh_fixture_ten', percentage: 50 } },
      { domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.lh_fixture_ten', percentage: 70 } },
    ]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
  });
});

describe('the strip name button opens the sheet with History (plan 2.9)', () => {
  it('for the right entity of each domain, with the name override and the look', async () => {
    const { hass, ids } = makeMixedHass();
    const card = mountRoom({ domains: ALL, look: { glass: 'light' }, entities: [ids.colourTemp, { entity: 'cover.hall_window', name: 'Hall' }, 'fan.living_room_fan'] }, hass);
    await settle(card);
    const open = async (name: string) => {
      tile(card, name).click();
      await settle(card);
      ($(card, '.strip .who') as HTMLButtonElement).click();
    };
    await open('Hall');
    await open('Living Room Fan');
    await open('Ceiling Lights');
    const entity = vi.mocked(openEntitySheet).mock.calls;
    expect(entity.map((c) => c[0])).toEqual([card, card]);
    expect(entity[0][1]).toMatchObject({ type: CARD_TYPES.cover, entity: 'cover.hall_window', name: 'Hall', look: { glass: 'light' } });
    expect(entity[1][1]).toMatchObject({ type: CARD_TYPES.fan, entity: 'fan.living_room_fan', look: { glass: 'light' } });
    expect(entity[1][1]).not.toHaveProperty('name');
    // Lights keep the light sheet opener (White and Colour open it in a pill mode).
    expect(vi.mocked(openLightSheet).mock.calls.map((c) => [c[0], (c[1] as { entity: string }).entity])).toEqual([[card, ids.colourTemp]]);
    expect(($(card, '.strip .who') as HTMLElement).getAttribute('aria-haspopup')).toBe('dialog');
  });
});

describe('writers: one per entity, shared with tiles and the sheet', () => {
  it('the room holds a lease on each cover and fan, released on disconnect', async () => {
    const { hass } = makeMixedHass();
    const card = mountRoom({ area: AREA, domains: ALL }, hass);
    await settle(card);
    expect(['cover.hall_window', BLIND].map((id) => coverWriters.refs(id))).toEqual([1, 1]);
    expect(fanWriters.refs('fan.lh_fixture_ten')).toBe(1);
    card.remove();
    expect(coverWriters.refs('cover.hall_window')).toBe(0);
    expect(fanWriters.refs('fan.lh_fixture_ten')).toBe(0);
  });

  it('a member whose domain leaves domains has its lease released', async () => {
    const { hass } = makeMixedHass();
    const card = mountRoom({ area: AREA, domains: ALL }, hass);
    await settle(card);
    card.setConfig({ type: CARD_TYPES.room, area: AREA, domains: ['light', 'fan'] });
    await settle(card);
    expect(coverWriters.refs('cover.hall_window')).toBe(0);
    expect(fanWriters.refs('fan.living_room_fan')).toBe(1);
  });

  it('a strip step and a pill drag in the sheet card coalesce into one call (one CoverWriter)', async () => {
    const { coverHarness, pointer } = await import('../cover/helpers');
    const h = coverHarness({ echoMs: null });
    const room = document.createElement(TAGS.room) as AnyEl;
    room.setConfig({ type: CARD_TYPES.room, domains: ['cover'], entities: ['cover.hall_window'] });
    room.hass = h.hass;
    h.onHass((hass: HomeAssistant) => (room.hass = hass));
    document.body.append(room);
    await settle(room);
    // The sheet copy of the cover card: the same entity, so the same writer.
    const sheetCard = await h.mount('cover.hall_window');
    expect(coverWriters.refs('cover.hall_window')).toBe(2);
    steps(room)[1].click();
    await vi.advanceTimersByTimeAsync(100);
    // A pill drag in the sheet within the 500 ms of the step: no call while dragging, one at release.
    pointer(sheetCard, 'pointerdown', 500);
    for (let i = 1; i <= 6; i++) {
      pointer(sheetCard, 'pointermove', 500 - i * 20);
      await vi.advanceTimersByTimeAsync(60);
      await sheetCard.updateComplete;
    }
    expect(h.calls).toEqual([]);
    pointer(sheetCard, 'pointerup', 380);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].service).toBe('set_cover_position');
    const sent = h.calls[0].data.position as number;
    expect(sent).toBeGreaterThan(20);
    await vi.advanceTimersByTimeAsync(5000);
    // The step never went out on its own: the queue coalesced it with the drag.
    expect(h.calls).toHaveLength(1);
    h.stopAll();
  });

  it('a strip Faster and a pill drag in the fan card within 300 ms: the leading call and exactly one final call (one FanWriter)', async () => {
    const calls: Call[] = [];
    const { hass } = makeMixedHass(calls);
    const room = mountRoom({ domains: ['fan'], entities: ['fan.lh_fixture_ten'] }, hass);
    // The sheet copy of the fan card: the same entity, so the same writer.
    const fanCard = document.createElement(TAGS.fan) as AnyEl;
    fanCard.setConfig({ type: CARD_TYPES.fan, entity: 'fan.lh_fixture_ten' });
    fanCard.hass = hass;
    document.body.append(fanCard);
    await settle(room);
    await settle(fanCard);
    expect(fanWriters.refs('fan.lh_fixture_ten')).toBe(2);
    const { pointer } = await import('../fan/helpers');
    // 10 speeds at 40 %: Faster goes out at once (the throttle's leading write).
    steps(room)[1].click();
    expect(calls.map((c) => c.data.percentage)).toEqual([50]);
    await vi.advanceTimersByTimeAsync(50);
    await fanCard.updateComplete;
    // A drag in the card inside the same 300 ms window: up 30 % of the pill (2.8 px per percent in happy-dom).
    pointer(fanCard, 'pointerdown', 500);
    pointer(fanCard, 'pointermove', 500 - 30 * 2.8);
    await vi.advanceTimersByTimeAsync(50);
    await fanCard.updateComplete;
    // Nothing more while the window is open: the strip step and the drag value coalesce in the one queue.
    expect(calls).toHaveLength(1);
    // The release sends the final value (the fan pill's final write on release): 80, the drag from the strip's 50.
    pointer(fanCard, 'pointerup', 500 - 30 * 2.8);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.lh_fixture_ten', percentage: 80 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
  });
});
