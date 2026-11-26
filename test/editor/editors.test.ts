// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@decibel95/liquid-core';
import '../../src/index';
import anchors from '../../docs/anchors.json';
import { CARD_TYPES, DOCS_URL, TAGS } from '../../src/const';
import { AREA, BLIND, GROUP, makeHass, makeMixedHass } from '../cards/room/helpers';

type AnyEl = HTMLElement & Record<string, any>;
type Cfg = Record<string, any>;

const mounted: AnyEl[] = [];
afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
});

/** An editor with a fake hass, its config set, attached; `fired` collects every saved config. */
async function mount(tag: string, config: Cfg, hass: HomeAssistant = makeHass().hass) {
  const el = document.createElement(tag) as AnyEl;
  const fired: Cfg[] = [];
  el.addEventListener('config-changed', (e) => fired.push((e as CustomEvent).detail.config));
  el.hass = hass;
  el.setConfig(config);
  document.body.append(el);
  mounted.push(el);
  await el.updateComplete;
  const last = () => fired[fired.length - 1];
  return { el, fired, last };
}

const $$ = (el: AnyEl, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
const text = (n: Element) => n.textContent!.replace(/\s+/g, ' ').trim();
/** The button with this visible text (first match). */
const button = (el: AnyEl, label: string) => {
  const b = $$(el, 'button').find((x) => text(x) === label);
  if (!b) throw new Error(`no button "${label}": ${$$(el, 'button').map(text).join(' | ')}`);
  return b as HTMLButtonElement;
};
const switchFor = (el: AnyEl, label: string) => $$(el, 'button[role="switch"]').find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement;
async function click(el: AnyEl, b: HTMLElement) {
  b.click();
  await el.updateComplete;
}
async function change(el: AnyEl, input: HTMLInputElement | HTMLSelectElement, value: string, type = 'change') {
  input.value = value;
  input.dispatchEvent(new Event(type));
  await el.updateComplete;
}
const inputByLabel = (el: AnyEl, label: string) => {
  for (const f of $$(el, '.field')) {
    const row = [...f.children].find((c) => c.classList.contains('lblrow'));
    const lbl = [...f.children, ...(row ? [...row.children] : [])].find((c) => c.classList.contains('lbl'));
    if (lbl && text(lbl) === label) return f.querySelector('input, select') as HTMLInputElement;
  }
  throw new Error(`no field "${label}"`);
};
const helpLinks = (el: AnyEl) => $$(el, 'a.help').map((a) => a.getAttribute('href')!);

describe('light card editor', () => {
  // Bed Light: white (color_temp) and colour (hs).
  const base = { type: CARD_TYPES.light, entity: 'light.bed_light' };

  it('Setup, Controls and Look tabs, each with its docs link', async () => {
    const { el } = await mount(TAGS.lightEditor, base);
    expect($$(el, '[role="tab"]').map(text)).toEqual(['Setup', 'Controls', 'Look']);
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/light#light-entity`]);
    await click(el, button(el, 'Controls'));
    expect(helpLinks(el)).toContain(`${DOCS_URL}/cards/light#light-controls`);
    await click(el, button(el, 'Look'));
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/light#light-look`]);
  });

  it('entity: a select over the light entities; type, entity and config_version always kept', async () => {
    const { el, last } = await mount(TAGS.lightEditor, base);
    const select = inputByLabel(el, 'Entity') as unknown as HTMLSelectElement;
    const options = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(options.every((v) => v.startsWith('light.'))).toBe(true);
    expect(options).toContain('light.kitchen_lights');
    await change(el, select, 'light.kitchen_lights');
    expect(last()).toEqual({
      type: CARD_TYPES.light,
      entity: 'light.kitchen_lights',
      config_version: 1,
    });
  });

  it('entity: an empty config shows "Choose a light" first; an unknown id stays shown', async () => {
    const { el } = await mount(TAGS.lightEditor, { type: CARD_TYPES.light });
    expect(text((inputByLabel(el, 'Entity') as unknown as HTMLSelectElement).querySelector('option')!)).toBe('Choose a light');
    const { el: el2 } = await mount(TAGS.lightEditor, {
      ...base,
      entity: 'light.gone',
    });
    expect(text((inputByLabel(el2, 'Entity') as unknown as HTMLSelectElement).querySelector('option')!)).toBe('light.gone');
  });

  it('name: set, then cleared (not written when empty)', async () => {
    const { el, last } = await mount(TAGS.lightEditor, base);
    const input = inputByLabel(el, 'Name');
    expect(input.placeholder).toBe('Bed Light');
    await change(el, input, '  Sofa ');
    expect(last()).toEqual({ ...base, name: 'Sofa', config_version: 1 });
    await change(el, input, '');
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('modes: only what the light supports; all picked is the default and writes nothing', async () => {
    const { el, last } = await mount(TAGS.lightEditor, base);
    await click(el, button(el, 'Controls'));
    const group = $$(el, '.seg[role="group"]')[0];
    expect([...group.querySelectorAll('button')].map(text)).toEqual(['Brightness', 'White', 'Colour']);
    expect([...group.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
    await click(el, button(el, 'White'));
    expect(last()).toEqual({
      ...base,
      controls: { modes: ['brightness', 'colour'] },
      config_version: 1,
    });
    await click(el, button(el, 'Brightness'));
    expect(last().controls).toEqual({ modes: ['colour'] });
    // The last one picked cannot be unpicked.
    expect(button(el, 'Colour').disabled).toBe(true);
    await click(el, button(el, 'White'));
    await click(el, button(el, 'Brightness'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('modes: shows the modes the card would really show (a configured mode the light lacks falls back)', async () => {
    const { hass, ids } = makeHass();
    const { el } = await mount(TAGS.lightEditor, { ...base, entity: ids.brightnessOnly, controls: { modes: ['colour'] } }, hass);
    await click(el, button(el, 'Controls'));
    const b = $$(el, '.seg[role="group"] button');
    expect(b.map(text)).toEqual(['Brightness']);
    expect(b[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('modes: an on/off-only light says so instead; a dimmer offers Brightness only', async () => {
    const { hass, ids } = makeHass();
    const { el } = await mount(TAGS.lightEditor, { ...base, entity: ids.onOffOnly }, hass);
    await click(el, button(el, 'Controls'));
    expect($$(el, '.seg[role="group"]')).toHaveLength(0);
    expect(text(el.shadowRoot!.querySelector('.body')!)).toContain('only switches on and off');
    const { el: el2 } = await mount(TAGS.lightEditor, { ...base, entity: ids.brightnessOnly }, hass);
    await click(el2, button(el2, 'Controls'));
    expect([...$$(el2, '.seg[role="group"]')[0].querySelectorAll('button')].map(text)).toEqual(['Brightness']);
  });

  it('effects: a switch, written only when off; disabled without an effect list', async () => {
    const { hass, ids } = makeHass();
    const { el, last } = await mount(TAGS.lightEditor, { ...base, entity: ids.effectList }, hass);
    await click(el, button(el, 'Controls'));
    const sw = switchFor(el, 'Effects');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.disabled).toBe(false);
    await click(el, sw);
    expect(last()).toEqual({
      ...base,
      entity: ids.effectList,
      controls: { effects: false },
      config_version: 1,
    });
    const { el: el2 } = await mount(TAGS.lightEditor, { ...base, entity: ids.brightnessOnly }, hass);
    await click(el2, button(el2, 'Controls'));
    expect(switchFor(el2, 'Effects').disabled).toBe(true);
  });

  it('write hold: 10, 30 or 60 s with its docs link; 10 is the default', async () => {
    const { el, last } = await mount(TAGS.lightEditor, base);
    await click(el, button(el, 'Controls'));
    expect(helpLinks(el)).toContain(`${DOCS_URL}/cards/light#light-write-hold`);
    await click(el, button(el, '30 s'));
    expect(last().write_hold).toBe(30);
    await click(el, button(el, '10 s'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('look: glass, blur and motion from liquid-core, no tint', async () => {
    const { el, last } = await mount(TAGS.lightEditor, base);
    await click(el, button(el, 'Look'));
    expect(text(el.shadowRoot!.querySelector('.body')!)).not.toContain('tint');
    expect($$(el, 'input[type="range"]')).toHaveLength(1);
    await click(el, button(el, 'Dark'));
    expect(last().look).toEqual({ glass: 'dark' });
    await change(el, $$(el, 'input[type="range"]')[0] as HTMLInputElement, '18', 'input');
    expect(last().look).toEqual({ glass: 'dark', blur: 18 });
    await click(el, button(el, 'Minimal'));
    expect(last().look).toEqual({ glass: 'dark', blur: 18, motion: 'minimal' });
    await click(el, button(el, 'Auto'));
    await change(el, $$(el, 'input[type="range"]')[0] as HTMLInputElement, '30', 'input');
    await click(el, button(el, 'Rich'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('round-trips every option of plan 4.3 and keeps unknown keys', async () => {
    const yaml = {
      type: CARD_TYPES.light,
      entity: 'light.bed_light',
      name: 'Kitchen',
      controls: { modes: ['brightness', 'white'], effects: false },
      write_hold: 30,
      look: { glass: 'light', blur: 24, motion: 'subtle' },
      grid_options: { columns: 6 },
      config_version: 1,
    };
    const { el, last } = await mount(TAGS.lightEditor, yaml);
    // A no-op edit saves the config unchanged.
    await click(el, button(el, 'Look'));
    await click(el, button(el, 'Light'));
    expect(last()).toEqual(yaml);
  });
});

describe('tile editor', () => {
  const base = { type: CARD_TYPES.tile, entity: 'light.ceiling_lights' };

  it('Setup, tap, write hold and Look with docs links, in the Liquid Climate tile order', async () => {
    const { el } = await mount(TAGS.tileEditor, base);
    expect(helpLinks(el)).toEqual([
      `${DOCS_URL}/cards/tile#tile-entity`,
      `${DOCS_URL}/cards/tile#tile-tap-action`,
      `${DOCS_URL}/cards/tile#tile-write-hold`,
      `${DOCS_URL}/cards/tile#tile-look`,
    ]);
    const tap = $$(el, '.seg[role="radiogroup"]')[0];
    expect([...tap.querySelectorAll('button')].map(text)).toEqual(['Open card', 'More info', 'Nothing']);
    expect(tap.querySelector('[aria-checked="true"]')!.textContent!.trim()).toBe('Open card');
  });

  it('tap_action: sheet is the default; more-info and none are written', async () => {
    const { el, last } = await mount(TAGS.tileEditor, base);
    await click(el, button(el, 'More info'));
    expect(last()).toEqual({
      ...base,
      tap_action: 'more-info',
      config_version: 1,
    });
    await click(el, button(el, 'Nothing'));
    expect(last().tap_action).toBe('none');
    await click(el, button(el, 'Open card'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('saves type first, whatever the order of the incoming keys', async () => {
    const { el, last } = await mount(TAGS.tileEditor, { entity: 'light.ceiling_lights', type: CARD_TYPES.tile });
    await click(el, button(el, 'More info'));
    expect(Object.keys(last())[0]).toBe('type');
  });

  it('round-trips its own options and the light card options it passes to the sheet', async () => {
    const yaml = {
      type: CARD_TYPES.tile,
      entity: 'light.ceiling_lights',
      name: 'Ceiling',
      tap_action: 'more-info',
      controls: { modes: ['white'], effects: false },
      write_hold: 60,
      look: { glass: 'dark', blur: 40, motion: 'minimal' },
      config_version: 1,
    };
    const { el, last } = await mount(TAGS.tileEditor, yaml);
    await click(el, button(el, '60 s'));
    expect(last()).toEqual(yaml);
  });
});

describe('badge editor', () => {
  const base = { type: CARD_TYPES.badge, entity: 'light.ceiling_lights' };

  it('Setup, icon only, tap and Look, tap starting with More info (the badge default)', async () => {
    const { el } = await mount(TAGS.badgeEditor, base);
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/badge#badge-entity`, `${DOCS_URL}/cards/badge#badge-tap-action`, `${DOCS_URL}/cards/badge#badge-look`]);
    const tap = $$(el, '.seg[role="radiogroup"]')[0];
    expect([...tap.querySelectorAll('button')].map(text)).toEqual(['More info', 'Open card', 'Nothing']);
    expect(text(tap.querySelector('[aria-checked="true"]')!)).toBe('More info');
  });

  it('icon_only and tap_action are written only when not the default', async () => {
    const { el, last } = await mount(TAGS.badgeEditor, base);
    await click(el, switchFor(el, 'Icon only'));
    expect(last()).toEqual({ ...base, icon_only: true, config_version: 1 });
    await click(el, button(el, 'Open card'));
    expect(last()).toEqual({
      ...base,
      icon_only: true,
      tap_action: 'sheet',
      config_version: 1,
    });
    await click(el, switchFor(el, 'Icon only'));
    await click(el, button(el, 'More info'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('round-trips every badge option', async () => {
    const yaml = {
      type: CARD_TYPES.badge,
      entity: 'light.kitchen_lights',
      name: 'Kitchen',
      tap_action: 'none',
      icon_only: true,
      look: { glass: 'dark' },
      config_version: 1,
    };
    const { el, last } = await mount(TAGS.badgeEditor, yaml);
    await click(el, button(el, 'Dark'));
    expect(last()).toEqual(yaml);
  });
});

describe('room editor', () => {
  const area = { type: CARD_TYPES.room, source: 'area', area: AREA };

  it('title placeholder is the area name; source is always written', async () => {
    const { el, last } = await mount(TAGS.roomEditor, {
      type: CARD_TYPES.room,
      area: AREA,
    });
    const title = inputByLabel(el, 'Title');
    expect(title.placeholder).toBe('Living Room');
    await change(el, title, 'Lounge');
    expect(last()).toEqual({ ...area, title: 'Lounge', config_version: 1 });
    await change(el, title, '');
    expect(last()).toEqual({ ...area, config_version: 1 });
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/room#room-source`, `${DOCS_URL}/cards/room#room-power-entity`, `${DOCS_URL}/cards/room#room-look`]);
  });

  it('area: a select over the areas; each light of the area has a switch that writes exclude', async () => {
    const { el, last } = await mount(TAGS.roomEditor, area);
    const select = inputByLabel(el, 'Area') as unknown as HTMLSelectElement;
    expect([...select.querySelectorAll('option')].map(text)).toEqual(['Choose an area', 'Attic', 'Hallway', 'Living Room']);
    const switches = $$(el, 'button[role="switch"]').map((b) => b.getAttribute('aria-label'));
    expect(switches).toContain('Show Ceiling Lights');
    // The group is a light of the area until it is the power entity (as the card counts it).
    expect(switches).toContain('Show Living Room Lights');
    const { el: el2 } = await mount(TAGS.roomEditor, { ...area, power_entity: GROUP });
    expect($$(el2, 'button[role="switch"]').map((b) => b.getAttribute('aria-label'))).not.toContain('Show Living Room Lights');
    await click(el, switchFor(el, 'Show Ceiling Lights'));
    expect(last()).toEqual({
      ...area,
      exclude: ['light.ceiling_lights'],
      config_version: 1,
    });
    expect(switchFor(el, 'Show Ceiling Lights').getAttribute('aria-checked')).toBe('false');
    await click(el, switchFor(el, 'Show Ceiling Lights'));
    expect(last()).toEqual({ ...area, config_version: 1 });
    await change(el, select, 'hallway');
    expect(last()).toEqual({ ...area, area: 'hallway', config_version: 1 });
  });

  it('switching to Choose lists the lights the area showed; back to One area returns to that area', async () => {
    const { el, last } = await mount(TAGS.roomEditor, {
      ...area,
      exclude: ['light.ceiling_lights'],
    });
    await click(el, button(el, 'Choose'));
    const cfg = last();
    expect(cfg.source).toBe('list');
    expect(cfg.area).toBeUndefined();
    expect(cfg.exclude).toBeUndefined();
    expect(cfg.entities.length).toBeGreaterThan(1);
    expect(cfg.entities).not.toContain('light.ceiling_lights');
    expect(cfg.entities.every((e: unknown) => typeof e === 'string')).toBe(true);
    await click(el, button(el, 'One area'));
    expect(last()).toEqual({ ...area, exclude: ['light.ceiling_lights'], config_version: 1 });
  });

  it('changing the area clears the lights left out', async () => {
    const { el, last } = await mount(TAGS.roomEditor, { ...area, exclude: ['light.ceiling_lights'] });
    await change(el, inputByLabel(el, 'Area') as unknown as HTMLSelectElement, 'hallway');
    expect(last()).toEqual({ ...area, area: 'hallway', config_version: 1 });
  });

  it('list: up, down, remove, a name per light and an input that adds one', async () => {
    const list = {
      type: CARD_TYPES.room,
      source: 'list',
      entities: ['light.ceiling_lights', 'light.kitchen_lights'],
    };
    const { el, last } = await mount(TAGS.roomEditor, list);
    // The first light has no Up and the last no Down, instead of disabled buttons.
    const labels = $$(el, 'button').map((b) => b.getAttribute('aria-label'));
    expect(labels).not.toContain('Move Ceiling Lights up');
    expect(labels).not.toContain('Move Kitchen Lights down');
    expect(labels).toContain('Move Ceiling Lights down');
    expect(labels).toContain('Move Kitchen Lights up');
    await click(
      el,
      $$(el, 'button').find((b) => b.getAttribute('aria-label') === 'Move Kitchen Lights up')!,
    );
    expect(last().entities).toEqual(['light.kitchen_lights', 'light.ceiling_lights']);
    const name = $$(el, 'input').find((i) => i.getAttribute('aria-label') === 'Name of Ceiling Lights') as HTMLInputElement;
    await change(el, name, 'Ceiling');
    expect(last().entities).toEqual(['light.kitchen_lights', { entity: 'light.ceiling_lights', name: 'Ceiling' }]);
    const add = inputByLabel(el, 'Add a light');
    expect(add.getAttribute('list')).toBe('lh-room-ids');
    await change(el, add, 'light.bed_light');
    expect(last().entities).toEqual(['light.kitchen_lights', { entity: 'light.ceiling_lights', name: 'Ceiling' }, 'light.bed_light']);
    expect(add.value).toBe('');
    // Not a light, or already listed: nothing is saved.
    const n = last();
    await change(el, add, 'switch.x');
    await change(el, add, 'light.bed_light');
    expect(last()).toBe(n);
    await click(
      el,
      $$(el, 'button').find((b) => b.getAttribute('aria-label') === 'Remove Kitchen Lights')!,
    );
    expect(last()).toEqual({
      ...list,
      entities: [{ entity: 'light.ceiling_lights', name: 'Ceiling' }, 'light.bed_light'],
      config_version: 1,
    });
  });

  it('list edits keep unknown keys and entries they cannot show', async () => {
    const list = {
      type: CARD_TYPES.room,
      source: 'list',
      entities: [{ entity: 'light.ceiling_lights', name: 'Ceiling', icon: 'mdi:x' }, 42, { entity: 'light.kitchen_lights', future: 1 }, { nope: true }],
    };
    const { el, last } = await mount(TAGS.roomEditor, list);
    const aria = (l: string) => $$(el, 'button').find((b) => b.getAttribute('aria-label') === l)!;
    await click(el, aria('Move Kitchen Lights up'));
    expect(last().entities).toEqual([{ entity: 'light.kitchen_lights', future: 1 }, 42, { entity: 'light.ceiling_lights', name: 'Ceiling', icon: 'mdi:x' }, { nope: true }]);
    const name = (n: string) => $$(el, 'input').find((i) => i.getAttribute('aria-label') === `Name of ${n}`) as HTMLInputElement;
    await change(el, name('Kitchen Lights'), 'Kitchen');
    expect(last().entities[0]).toEqual({ entity: 'light.kitchen_lights', future: 1, name: 'Kitchen' });
    await change(el, name('Ceiling Lights'), '');
    expect(last().entities[2]).toEqual({ entity: 'light.ceiling_lights', icon: 'mdi:x' });
    await click(el, aria('Remove Kitchen Lights'));
    expect(last().entities).toEqual([42, { entity: 'light.ceiling_lights', icon: 'mdi:x' }, { nope: true }]);
  });

  it('add a light: only ids that exist in Home Assistant', async () => {
    const { el, fired } = await mount(TAGS.roomEditor, { type: CARD_TYPES.room, source: 'list', entities: ['light.ceiling_lights'] });
    await change(el, inputByLabel(el, 'Add a light'), 'light.not_there');
    expect(fired).toEqual([]);
  });

  it('power entity: only an existing light id; anything else warns and is not saved', async () => {
    const { el, fired, last } = await mount(TAGS.roomEditor, { ...area, power_entity: GROUP });
    const input = inputByLabel(el, 'Power entity');
    await change(el, input, 'light.not_there');
    expect(fired).toEqual([]);
    expect(text(el.shadowRoot!.querySelector('.hint[role="alert"]')!)).toContain('not saved');
    expect(input.value).toBe(GROUP);
    await change(el, input, 'switch.x');
    expect(fired).toEqual([]);
    await change(el, input, '');
    expect(last()).toEqual({ ...area, config_version: 1 });
    expect(el.shadowRoot!.querySelector('.hint[role="alert"]')).toBeNull();
  });

  it('power entity: the invalid hint resets on setConfig, on a source switch and on an area change', async () => {
    const trigger = async (el: AnyEl) => {
      await change(el, inputByLabel(el, 'Power entity'), 'light.not_there');
      expect(el.shadowRoot!.querySelector('.hint[role="alert"]')).not.toBeNull();
    };
    const gone = (el: AnyEl) => expect(el.shadowRoot!.querySelector('.hint[role="alert"]')).toBeNull();
    const { el } = await mount(TAGS.roomEditor, area);
    await trigger(el);
    el.setConfig(area);
    await el.updateComplete;
    gone(el);
    await trigger(el);
    await click(el, button(el, 'Choose'));
    gone(el);
    await click(el, button(el, 'One area'));
    await trigger(el);
    const select = el.shadowRoot!.querySelector('select') as HTMLSelectElement;
    select.dispatchEvent(new Event('change'));
    await el.updateComplete;
    gone(el);
  });

  it('power entity: a light id input with the groups first in its suggestions', async () => {
    const { el, last } = await mount(TAGS.roomEditor, area);
    const input = inputByLabel(el, 'Power entity');
    expect(input.getAttribute('list')).toBe('lh-power-ids');
    expect(el.shadowRoot!.querySelector('#lh-power-ids option')!.getAttribute('value')).toBe(makeHass().ids.group);
    await change(el, input, GROUP);
    expect(last()).toEqual({ ...area, power_entity: GROUP, config_version: 1 });
  });

  it('round-trips every room option (area and list)', async () => {
    const a = {
      type: CARD_TYPES.room,
      title: 'Lounge',
      source: 'area',
      area: AREA,
      power_entity: GROUP,
      exclude: ['light.ceiling_lights'],
      look: { motion: 'subtle' },
      config_version: 1,
    };
    const { el, last } = await mount(TAGS.roomEditor, a);
    await click(el, button(el, 'Subtle'));
    expect(last()).toEqual(a);
    const l = {
      type: CARD_TYPES.room,
      source: 'list',
      entities: ['light.ceiling_lights', { entity: 'light.kitchen_lights', name: 'Kitchen' }],
      look: { blur: 12 },
      config_version: 1,
    };
    const { el: el2, last: last2 } = await mount(TAGS.roomEditor, l);
    await click(el2, button(el2, 'Choose'));
    await click(el2, button(el2, 'Auto'));
    expect(last2()).toEqual(l);
  });
});

describe('tile and badge editors: lights, covers and fans (plan 2.6)', () => {
  it.each([TAGS.tileEditor, TAGS.badgeEditor])('%s lists light, cover and fan entities, lights first, with a neutral placeholder', async (tag) => {
    const { el } = await mount(tag, { type: tag === TAGS.tileEditor ? CARD_TYPES.tile : CARD_TYPES.badge }, makeMixedHass().hass);
    const select = inputByLabel(el, 'Entity') as unknown as HTMLSelectElement;
    const options = [...select.querySelectorAll('option')];
    expect(text(options[0])).toBe('Choose an entity');
    const values = options.slice(1).map((o) => o.value);
    expect(values).toContain('light.ceiling_lights');
    expect(values).toContain('cover.hall_window');
    expect(values).toContain('fan.lh_fixture_ten');
    expect(values.every((v) => /^(light|cover|fan)\./.test(v))).toBe(true);
    const domains = values.map((v) => v.split('.')[0]);
    expect(domains.indexOf('cover')).toBeGreaterThan(domains.lastIndexOf('light'));
    expect(domains.indexOf('fan')).toBeGreaterThan(domains.lastIndexOf('cover'));
  });

  it('a light tile switched to a fan writes no light defaults; the fan presets switch off is passed on', async () => {
    const { el, last } = await mount(TAGS.tileEditor, { type: CARD_TYPES.tile, entity: 'light.ceiling_lights', write_hold: 30 }, makeMixedHass().hass);
    await change(el, inputByLabel(el, 'Entity') as unknown as HTMLSelectElement, 'fan.lh_fixture_ten');
    expect(last()).toEqual({ type: CARD_TYPES.tile, entity: 'fan.lh_fixture_ten', write_hold: 30, config_version: 1 });
    await change(el, inputByLabel(el, 'Entity') as unknown as HTMLSelectElement, 'cover.hall_window');
    expect(last()).toEqual({ type: CARD_TYPES.tile, entity: 'cover.hall_window', write_hold: 30, config_version: 1 });
    await change(el, inputByLabel(el, 'Entity') as unknown as HTMLSelectElement, 'light.kitchen_lights');
    expect(last()).toEqual({ type: CARD_TYPES.tile, entity: 'light.kitchen_lights', write_hold: 30, config_version: 1 });
  });

  it('the tile hint says which card options pass on', async () => {
    const { el } = await mount(TAGS.tileEditor, { type: CARD_TYPES.tile, entity: 'fan.lh_fixture_ten' }, makeMixedHass().hass);
    const hint = text(el.shadowRoot!.querySelector('.body > .hint:last-child')!);
    expect(hint).toContain('presets for a fan');
    expect(hint).toContain('write hold for a light, cover or fan');
  });

  it.each([
    [CARD_TYPES.tile, 'cover.hall_window', { controls: { modes: ['white'] }, write_hold: 60 }],
    [CARD_TYPES.tile, 'fan.lh_fixture_ten', { controls: { presets: false }, write_hold: 30 }],
    [CARD_TYPES.badge, 'cover.hall_window', { tap_action: 'sheet', icon_only: true }],
    [CARD_TYPES.badge, 'fan.lh_fixture_onoff', { tap_action: 'sheet' }],
  ])('%s round-trips a %s config', async (type, entity, extra) => {
    const yaml = { type, entity, name: 'X', ...extra, look: { glass: 'dark' }, config_version: 1 };
    const { el, last } = await mount(type === CARD_TYPES.tile ? TAGS.tileEditor : TAGS.badgeEditor, yaml, makeMixedHass().hass);
    await click(el, button(el, 'Dark'));
    expect(last()).toEqual(yaml);
  });
});

describe('cover card editor', () => {
  const base = { type: CARD_TYPES.cover, entity: 'cover.hall_window' };
  const hass = () => makeMixedHass().hass;

  it('Setup, Controls and Look tabs, as the light card editor', async () => {
    const { el } = await mount(TAGS.coverEditor, base, hass());
    expect($$(el, '[role="tab"]').map(text)).toEqual(['Setup', 'Controls', 'Look']);
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/cover#cover-entity`]);
    await click(el, button(el, 'Controls'));
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/cover#cover-controls`, `${DOCS_URL}/cards/cover#cover-write-hold`]);
    await click(el, button(el, 'Look'));
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/cover#cover-look`]);
  });

  it('entity: a select over the covers only; an empty config asks for an entity', async () => {
    const { el, last } = await mount(TAGS.coverEditor, { type: CARD_TYPES.cover }, hass());
    const select = inputByLabel(el, 'Entity') as unknown as HTMLSelectElement;
    const options = [...select.querySelectorAll('option')];
    expect(text(options[0])).toBe('Choose an entity');
    expect(options.slice(1).every((o) => o.value.startsWith('cover.'))).toBe(true);
    expect(options.map((o) => o.value)).toContain(BLIND);
    await change(el, select, 'cover.living_room_window');
    expect(last()).toEqual({ type: CARD_TYPES.cover, entity: 'cover.living_room_window', config_version: 1 });
  });

  it('name and write hold: written only when not the default', async () => {
    const { el, last } = await mount(TAGS.coverEditor, base, hass());
    const name = inputByLabel(el, 'Name');
    expect(name.placeholder).toBe('Hall Window');
    await change(el, name, 'Hall');
    expect(last()).toEqual({ ...base, name: 'Hall', config_version: 1 });
    await click(el, button(el, 'Controls'));
    await click(el, button(el, '60 s'));
    expect(last()).toEqual({ ...base, name: 'Hall', write_hold: 60, config_version: 1 });
    await click(el, button(el, '10 s'));
    expect(last()).toEqual({ ...base, name: 'Hall', config_version: 1 });
  });

  it('round-trips every option of plan section 4 and keeps unknown keys', async () => {
    const yaml = {
      type: CARD_TYPES.cover,
      entity: 'cover.living_room_window',
      name: 'Window',
      write_hold: 30,
      look: { glass: 'light', blur: 24, motion: 'subtle' },
      grid_options: { columns: 6 },
      config_version: 1,
    };
    const { el, last } = await mount(TAGS.coverEditor, yaml, hass());
    await click(el, button(el, 'Look'));
    await click(el, button(el, 'Light'));
    expect(last()).toEqual(yaml);
  });
});

describe('fan card editor', () => {
  const base = { type: CARD_TYPES.fan, entity: 'fan.lh_fixture_ten' };
  const hass = () => makeMixedHass().hass;

  it('Setup, Controls and Look tabs, as the light card editor', async () => {
    const { el } = await mount(TAGS.fanEditor, base, hass());
    expect($$(el, '[role="tab"]').map(text)).toEqual(['Setup', 'Controls', 'Look']);
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/fan#fan-entity`]);
    await click(el, button(el, 'Controls'));
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/fan#fan-controls`, `${DOCS_URL}/cards/fan#fan-write-hold`]);
    await click(el, button(el, 'Look'));
    expect(helpLinks(el)).toEqual([`${DOCS_URL}/cards/fan#fan-look`]);
  });

  it('entity: a select over the fans only', async () => {
    const { el } = await mount(TAGS.fanEditor, base, hass());
    const options = [...(inputByLabel(el, 'Entity') as unknown as HTMLSelectElement).querySelectorAll('option')].map((o) => o.value);
    expect(options).toContain('fan.lh_fixture_onoff');
    expect(options.every((v) => v.startsWith('fan.'))).toBe(true);
  });

  it('controls.presets: a switch with the preset count, written only when off', async () => {
    const { el, last } = await mount(TAGS.fanEditor, base, hass());
    await click(el, button(el, 'Controls'));
    const sw = switchFor(el, 'Presets');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.disabled).toBe(false);
    expect(text(sw.parentElement!)).toContain('2 presets');
    await click(el, sw);
    expect(last()).toEqual({ ...base, controls: { presets: false }, config_version: 1 });
    await click(el, switchFor(el, 'Presets'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('controls.presets: off and disabled on a fan without presets, whatever the config says', async () => {
    const { el } = await mount(TAGS.fanEditor, { ...base, entity: 'fan.lh_fixture_onoff' }, hass());
    await click(el, button(el, 'Controls'));
    const sw = switchFor(el, 'Presets');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.disabled).toBe(true);
    expect(text(sw.parentElement!)).toContain('Not supported by this fan');
  });

  it('write hold: 10, 30 or 60 s; 10 is the default', async () => {
    const { el, last } = await mount(TAGS.fanEditor, base, hass());
    await click(el, button(el, 'Controls'));
    await click(el, button(el, '30 s'));
    expect(last()).toEqual({ ...base, write_hold: 30, config_version: 1 });
    await click(el, button(el, '10 s'));
    expect(last()).toEqual({ ...base, config_version: 1 });
  });

  it('round-trips every option of plan section 4 and keeps unknown keys', async () => {
    const yaml = {
      type: CARD_TYPES.fan,
      entity: 'fan.living_room_fan',
      name: 'Fan',
      controls: { presets: false },
      write_hold: 60,
      look: { glass: 'dark', blur: 12, motion: 'minimal' },
      grid_options: { columns: 6 },
      config_version: 1,
    };
    const { el, last } = await mount(TAGS.fanEditor, yaml, hass());
    await click(el, button(el, 'Look'));
    await click(el, button(el, 'Dark'));
    expect(last()).toEqual(yaml);
  });
});

describe('room editor: domains (plan 2.7)', () => {
  const area = { type: CARD_TYPES.room, source: 'area', area: AREA };
  const hass = () => makeMixedHass().hass;
  const domainButtons = (el: AnyEl) => [...$$(el, '.seg[role="group"]')[0].querySelectorAll('button')] as HTMLButtonElement[];

  it('a multi-select of Lights, Covers and Fans; lights only is the default and is never written', async () => {
    const { el, last } = await mount(TAGS.roomEditor, area, hass());
    const group = $$(el, '.seg[role="group"]')[0];
    expect(group.getAttribute('aria-label')).toBe('Domains');
    expect(domainButtons(el).map(text)).toEqual(['Lights', 'Covers', 'Fans']);
    expect(domainButtons(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    // The last one picked cannot be unpicked.
    expect(domainButtons(el)[0].disabled).toBe(true);
    await click(el, button(el, 'Fans'));
    expect(last()).toEqual({ ...area, domains: ['light', 'fan'], config_version: 1 });
    await click(el, button(el, 'Covers'));
    // Display order, whatever the click order.
    expect(last().domains).toEqual(['light', 'cover', 'fan']);
    await click(el, button(el, 'Covers'));
    await click(el, button(el, 'Fans'));
    expect(last()).toEqual({ ...area, config_version: 1 });
  });

  it('area: the switches follow the domains (covers and fans of the area, the neutral wording)', async () => {
    const { el } = await mount(TAGS.roomEditor, area, hass());
    const shown = () => $$(el, 'button[role="switch"]').map((b) => b.getAttribute('aria-label'));
    expect(shown()).toContain('Show Ceiling Lights');
    expect(shown()).not.toContain('Show Hall Window');
    expect($$(el, '.field[role="group"]')[0].getAttribute('aria-label')).toBe('Lights');
    await click(el, button(el, 'Covers'));
    await click(el, button(el, 'Fans'));
    expect(shown()).toEqual(expect.arrayContaining(['Show Ceiling Lights', 'Show Hall Window', 'Show Blind', 'Show Ten Speed Fan']));
    // Not in the area, or hidden: not offered.
    expect(shown()).not.toContain('Show Garage Door');
    expect(shown()).not.toContain('Show Ceiling Fan');
    expect($$(el, '.field[role="group"]')[0].getAttribute('aria-label')).toBe('Entities');
    await click(el, button(el, 'Lights'));
    expect(shown()).not.toContain('Show Ceiling Lights');
    expect(shown()).toContain('Show Hall Window');
  });

  it('power entity: shown only while lights are picked; the saved value stays (the card ignores it)', async () => {
    const { el, last } = await mount(TAGS.roomEditor, { ...area, power_entity: GROUP, domains: ['light', 'cover'] }, hass());
    expect(() => inputByLabel(el, 'Power entity')).not.toThrow();
    await click(el, button(el, 'Lights'));
    expect(() => inputByLabel(el, 'Power entity')).toThrow();
    expect(last()).toEqual({ ...area, power_entity: GROUP, domains: ['cover'], config_version: 1 });
    expect(helpLinks(el)).not.toContain(`${DOCS_URL}/cards/room#room-power-entity`);
    await click(el, button(el, 'Lights'));
    expect(inputByLabel(el, 'Power entity').value).toBe(GROUP);
  });

  it('list: the add input takes the picked domains only and suggests them; unpicking a domain drops its entries', async () => {
    const list = { type: CARD_TYPES.room, source: 'list', domains: ['light', 'cover'], entities: ['light.ceiling_lights'] };
    const { el, last } = await mount(TAGS.roomEditor, list, hass());
    const add = inputByLabel(el, 'Add an entity');
    const suggested = [...el.shadowRoot!.querySelectorAll('#lh-room-ids option')].map((o) => o.getAttribute('value'));
    expect(suggested).toContain('cover.hall_window');
    expect(suggested).not.toContain('fan.lh_fixture_ten');
    expect(suggested).not.toContain('light.ceiling_lights');
    await change(el, add, 'fan.lh_fixture_ten');
    await change(el, add, 'cover.not_there');
    await change(el, add, 'cover.hall_window');
    expect(last()).toEqual({ ...list, entities: ['light.ceiling_lights', 'cover.hall_window'], config_version: 1 });
    await click(el, button(el, 'Covers'));
    expect(last()).toEqual({ type: CARD_TYPES.room, source: 'list', entities: ['light.ceiling_lights'], config_version: 1 });
    // The saved config is one the card accepts.
    const card = document.createElement(TAGS.room) as AnyEl;
    expect(() => card.setConfig(last())).not.toThrow();
  });

  it('switching an area room with covers to Choose lists its covers and fans too', async () => {
    const { el, last } = await mount(TAGS.roomEditor, { ...area, domains: ['cover', 'fan'] }, hass());
    await click(el, button(el, 'Choose'));
    expect(last().entities).toEqual(expect.arrayContaining(['cover.hall_window', BLIND, 'fan.lh_fixture_ten']));
    expect(last().entities.some((e: string) => e.startsWith('light.'))).toBe(false);
    expect(last().domains).toEqual(['cover', 'fan']);
  });

  it('round-trips a room with every domain (area and list)', async () => {
    const a = { type: CARD_TYPES.room, source: 'area', domains: ['light', 'cover', 'fan'], area: AREA, power_entity: GROUP, exclude: [BLIND], look: { motion: 'subtle' }, config_version: 1 };
    const { el, last } = await mount(TAGS.roomEditor, a, hass());
    await click(el, button(el, 'Subtle'));
    expect(last()).toEqual(a);
    const l = { type: CARD_TYPES.room, source: 'list', domains: ['cover', 'fan'], entities: [{ entity: 'cover.hall_window', name: 'Hall' }, 'fan.lh_fixture_ten'], config_version: 1, look: { glass: 'dark' } };
    const { el: el2, last: last2 } = await mount(TAGS.roomEditor, l, hass());
    await click(el2, button(el2, 'Dark'));
    expect(last2()).toEqual(l);
  });
});

describe('every editor', () => {
  const editors: [string, Cfg][] = [
    [TAGS.lightEditor, { type: CARD_TYPES.light, entity: 'light.ceiling_lights' }],
    [TAGS.tileEditor, { type: CARD_TYPES.tile, entity: 'light.ceiling_lights' }],
    [TAGS.badgeEditor, { type: CARD_TYPES.badge, entity: 'light.ceiling_lights' }],
    [TAGS.roomEditor, { type: CARD_TYPES.room, area: AREA }],
    [TAGS.coverEditor, { type: CARD_TYPES.cover, entity: 'cover.hall_window' }],
    [TAGS.fanEditor, { type: CARD_TYPES.fan, entity: 'fan.lh_fixture_ten' }],
  ];
  it.each(editors)('%s does not save anything on setConfig', async (tag, cfg) => {
    const { fired } = await mount(tag, cfg);
    expect(fired).toEqual([]);
  });

  it.each(editors)('%s keeps a newer config_version and unknown look keys when saving', async (tag, cfg) => {
    const { el, last } = await mount(tag, { ...cfg, config_version: 6, look: { glass: 'dark', future: 'x' } });
    const look = $$(el, '[role="tab"]').find((t) => text(t) === 'Look');
    if (look) await click(el, look);
    await click(el, button(el, 'Light'));
    expect(last().config_version).toBe(6);
    expect(last().look).toEqual({ glass: 'light', future: 'x' });
  });

  it.each(editors)('%s links only to documented anchors', async (tag, cfg) => {
    const { el } = await mount(tag, cfg);
    const tabs = $$(el, '[role="tab"]');
    const hrefs = new Set(helpLinks(el));
    for (const t of tabs) {
      await click(el, t);
      for (const h of helpLinks(el)) hrefs.add(h);
    }
    const known = new Set(Object.values(anchors.anchors));
    for (const h of hrefs) {
      expect(h.startsWith(`${DOCS_URL}/cards/`)).toBe(true);
      expect(known, h).toContain(h.slice(DOCS_URL.length));
    }
  });

  it.each(editors)('%s names every control (switches, radios, help links)', async (tag, cfg) => {
    const { el } = await mount(tag, cfg);
    for (const t of $$(el, '[role="tab"]').length ? $$(el, '[role="tab"]') : [null]) {
      if (t) await click(el, t);
      for (const b of $$(el, 'button')) expect(b.getAttribute('aria-label') || text(b), b.outerHTML).not.toBe('');
      for (const a of $$(el, 'a.help')) expect(a.getAttribute('aria-label')).toMatch(/^Help: .+/);
      for (const i of $$(el, 'input[type="text"]')) {
        const named = i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.closest('label');
        expect(named, i.outerHTML).toBeTruthy();
      }
    }
  });

  it.each(editors)('%s renders nothing without hass and config', async (tag) => {
    const el = document.createElement(tag) as AnyEl;
    document.body.append(el);
    mounted.push(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.body')).toBeNull();
  });

  it.each(editors)('%s uses only the liquid-core editor styles', async (tag) => {
    const Cls = customElements.get(tag) as unknown as { styles: unknown };
    const { editorStyles } = await import('@decibel95/liquid-core');
    expect(Cls.styles).toBe(editorStyles);
  });
});
