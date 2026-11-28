// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, calls, fakeHass, keyOn, text, type MediaCardEl } from './helpers';
import type { MediaFixtureName } from './fixtures';
import '../../../src/cards/media';

vi.mock('../../../src/media/model', async (orig) => {
  const mod = await orig<typeof import('../../../src/media/model')>();
  const { completeView } = await import('./helpers');
  return {
    ...mod,
    mediaView: (e: Parameters<typeof mod.mediaView>[0], o: Parameters<typeof mod.mediaView>[1]) => completeView(mod.mediaView(e, o), e, o),
  };
});
vi.mock('../../../src/media/writer', async () => {
  const { fakeRegistry, fakeWriter } = await import('./helpers');
  return { mediaWriters: fakeRegistry(), createMediaWriter: fakeWriter };
});

/**
 * The chip menu (GD6 list A, D-14, plan 2.11): the chip is a menu button; the inline list is role="menu" with
 * menuitemradio rows; arrows and Home/End move focus and never call; Enter, Space or click selects once, closes and
 * returns focus to the chip; Escape closes and returns focus; Tab and a press outside close. So a TV never switches
 * input per arrow press (the prototype's radiogroup sent one call per arrow, D-14 replaces it).
 */

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  document.body.innerHTML = '';
});

const active = (el: MediaCardEl) => el.shadowRoot!.activeElement as HTMLElement | null;
const rows = (el: MediaCardEl) => $$(el, '.mitem');
const chip = (el: MediaCardEl, key = 'source') => $(el, `.chip[data-chip='${key}']`)!;

async function open(fixture: MediaFixtureName = 'tv_sources', key = 'source') {
  const el = await fakeHass().mount(fixture);
  chip(el, key).click();
  await el.updateComplete;
  return el;
}

describe('opening', () => {
  it('a tap opens the inline menu with the current value checked and focused', async () => {
    const el = await open();
    const c = chip(el);
    expect(c.getAttribute('aria-expanded')).toBe('true');
    expect(c.getAttribute('aria-controls')).toBe('menu-source');
    const menu = $(el, '[role="menu"]')!;
    expect(menu.id).toBe('menu-source');
    expect(menu.getAttribute('aria-label')).toBe('Source list, TV');
    expect(text($(el, '.mhead'))).toBe('Source');
    expect(rows(el).map((r) => r.getAttribute('role'))).toEqual(Array(5).fill('menuitemradio'));
    expect(rows(el).map(text)).toEqual(['HDMI 1', 'HDMI 2', 'Netflix', 'YouTube', 'Plex']);
    expect(rows(el).map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(active(el)).toBe(rows(el)[0]);
    // Inside the card's single glass: no popup layer, no second backdrop-filter (the panel is a plain element).
    expect($(el, '.mpanel')!.parentElement).toBe($(el, 'section.lc'));
    expect(calls).toEqual([]);
  });

  it('a second tap on the chip closes it; the other chip opens its own list', async () => {
    const el = await open('lounge_room');
    chip(el).click();
    await el.updateComplete;
    expect($(el, '.mpanel')).toBeNull();
    chip(el, 'soundMode').click();
    await el.updateComplete;
    expect(rows(el).map(text)).toEqual(['Music', 'Movie']);
    expect(chip(el, 'soundMode').getAttribute('aria-expanded')).toBe('true');
    expect(chip(el).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('keyboard', () => {
  it('arrows (wrapping) and Home/End move focus with zero calls', async () => {
    const el = await open();
    const menu = $(el, '[role="menu"]')!;
    const at = () => rows(el).indexOf(active(el)!);
    keyOn(active(el)!, 'keydown', 'ArrowDown');
    expect(at()).toBe(1);
    keyOn(active(el)!, 'keydown', 'ArrowDown');
    expect(at()).toBe(2);
    keyOn(active(el)!, 'keydown', 'End');
    expect(at()).toBe(4);
    keyOn(active(el)!, 'keydown', 'ArrowDown');
    expect(at()).toBe(0);
    keyOn(active(el)!, 'keydown', 'ArrowUp');
    expect(at()).toBe(4);
    keyOn(active(el)!, 'keydown', 'Home');
    expect(at()).toBe(0);
    expect(menu.isConnected).toBe(true);
    expect(calls).toEqual([]);
  });

  it('Enter selects once, closes and returns focus to the chip', async () => {
    const el = await open();
    keyOn(active(el)!, 'keydown', 'ArrowDown');
    keyOn(active(el)!, 'keydown', 'Enter');
    await el.updateComplete;
    expect(calls).toEqual(['selectSource(HDMI 2)']);
    expect($(el, '.mpanel')).toBeNull();
    expect(active(el)).toBe(chip(el));
    expect(chip(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('Space selects once, closes and returns focus to the chip', async () => {
    const el = await open('speaker_modes', 'soundMode');
    keyOn(active(el)!, 'keydown', 'ArrowUp');
    keyOn(active(el)!, 'keydown', ' ');
    await el.updateComplete;
    expect(calls).toEqual(['selectSoundMode(Movie)']);
    expect($(el, '.mpanel')).toBeNull();
    expect(active(el)).toBe(chip(el, 'soundMode'));
  });

  it('a click selects once and closes', async () => {
    const el = await open();
    rows(el)[3].click();
    await el.updateComplete;
    expect(calls).toEqual(['selectSource(YouTube)']);
    expect($(el, '.mpanel')).toBeNull();
    expect(active(el)).toBe(chip(el));
  });

  it('selecting the value already shown sends nothing and closes', async () => {
    const el = await open();
    keyOn(active(el)!, 'keydown', 'Enter');
    await el.updateComplete;
    expect(calls).toEqual([]);
    expect($(el, '.mpanel')).toBeNull();
  });

  it('Escape closes and returns focus to the chip, with no call', async () => {
    const el = await open();
    keyOn(active(el)!, 'keydown', 'ArrowDown');
    keyOn(active(el)!, 'keydown', 'Escape');
    await el.updateComplete;
    expect($(el, '.mpanel')).toBeNull();
    expect(active(el)).toBe(chip(el));
    expect(calls).toEqual([]);
  });

  it('Tab closes, with no call', async () => {
    const el = await open();
    keyOn(active(el)!, 'keydown', 'ArrowDown');
    keyOn(active(el)!, 'keydown', 'Tab');
    await el.updateComplete;
    expect($(el, '.mpanel')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('pointer outside', () => {
  it('a press outside the menu and its chip closes it; a press inside keeps it', async () => {
    const el = await open();
    rows(el)[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect($(el, '.mpanel')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect($(el, '.mpanel')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('state', () => {
  it('the chip is disabled while unavailable and the menu closes when the chip goes away', async () => {
    const h = fakeHass();
    const el = await h.mount('tv_sources');
    chip(el).click();
    await el.updateComplete;
    expect($(el, '.mpanel')).not.toBeNull();
    const id = 'media_player.lh_fixture_tv_sources';
    el.hass = {
      ...h.hass,
      states: { ...h.states, [id]: { ...h.states[id], state: 'off' } },
    };
    await el.updateComplete;
    expect($(el, '.chip')).toBeNull();
    expect($(el, '.mpanel')).toBeNull();
    el.hass = {
      ...h.hass,
      states: { ...h.states, [id]: { ...h.states[id], state: 'unavailable' } },
    };
    await el.updateComplete;
    expect((chip(el) as HTMLButtonElement).disabled).toBe(true);
  });
});
