// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LitElement, html } from 'lit';
import type { HomeAssistant } from '@decibel95/liquid-core';
import '../../../src/cards/sheet';
import { LiquidHomeSheet } from '../../../src/cards/sheet/liquid-home-sheet';
import { closeLightSheet, lightSheet, openEntitySheet, openLightSheet, reconfigureLightSheet } from '../../../src/cards/sheet/open';
import { normalizeConfig } from '../../../src/cards/light/config';
import { fakeHass, settle, type AnyEl } from '../tile/helpers';
import { defineStubLightCard, StubLightCard } from './stub-light-card';
import { cssRules } from '../tile/helpers';

defineStubLightCard();

/** A host like a tile or a room card: a hass property and a focusable control inside its shadow root. */
class TestHost extends LitElement {
  static override properties = { hass: { attribute: false } };
  hass?: HomeAssistant;
  protected override render() {
    return html`<button class="open">open</button>`;
  }
}
customElements.define('test-sheet-host', TestHost);

async function host(fh = fakeHass()) {
  const h = document.createElement('test-sheet-host') as TestHost;
  h.hass = fh.hass;
  document.body.append(h);
  await h.updateComplete;
  return { h, fh };
}

const config = (entity = 'light.kitchen_lights', extra: Record<string, unknown> = {}) => normalizeConfig({ entity, ...extra });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

async function opened() {
  await settle();
  const sheet = lightSheet()!;
  await sheet.updateComplete;
  await settle();
  const dialog = sheet.shadowRoot!.querySelector('dialog') as HTMLDialogElement;
  const card = sheet.shadowRoot!.querySelector('liquid-home-light-card') as StubLightCard | null;
  return { sheet, dialog, card };
}

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
});

describe('liquid-home-sheet', () => {
  it('is a core LiquidSheetBase registered as liquid-home-sheet', () => {
    expect(customElements.get('liquid-home-sheet')).toBe(LiquidHomeSheet);
    expect(Object.getPrototypeOf(LiquidHomeSheet).name).toBe('LiquidSheetBase');
  });

  it('openLightSheet opens the light card by tag in one shared sheet, with hass, config and Close', async () => {
    const { h, fh } = await host();
    (h.renderRoot.querySelector('button.open') as HTMLButtonElement).focus();
    openLightSheet(h, config('light.kitchen_lights', { name: 'Keuken' }));
    const { sheet, dialog, card } = await opened();
    expect(sheet.parentElement).toBe(document.body);
    expect(dialog.open).toBe(true);
    expect(card).not.toBeNull();
    expect(card!.config).toMatchObject({ type: 'custom:liquid-home-light-card', entity: 'light.kitchen_lights', name: 'Keuken' });
    expect(card!.config!.look).toEqual({ glass: 'theme', blur: 30, motion: 'rich' });
    expect(card!.hass).toBe(fh.hass);
    expect(dialog.getAttribute('aria-label')).toBe('Keuken');
    const close = card!.querySelector('button.close') as HTMLButtonElement;
    expect(close.getAttribute('slot')).toBe('header-action');
    expect(close.getAttribute('aria-label')).toBe('Close');

    // A second open while open does nothing; there is still one sheet in the document.
    openLightSheet(h, config('light.ceiling_lights'));
    await settle();
    expect(card!.configs).toHaveLength(1);
    expect(document.querySelectorAll('liquid-home-sheet')).toHaveLength(1);

    // Close removes the card and returns focus to the control that opened it.
    close.click();
    await sheet.updateComplete;
    expect(dialog.open).toBe(false);
    expect(sheet.isOpen).toBe(false);
    expect(sheet.shadowRoot!.querySelector('liquid-home-light-card')).toBeNull();
    expect(h.shadowRoot!.activeElement?.className).toBe('open');

    // The next open reuses the same sheet.
    openLightSheet(h, config('light.ceiling_lights'));
    const again = await opened();
    expect(again.sheet).toBe(sheet);
    expect(again.card!.config!.entity).toBe('light.ceiling_lights');
  });

  it('opens the light card in the pill mode asked for, once (not stored)', async () => {
    const { h } = await host();
    openLightSheet(h, config(), { mode: 'white' });
    let o = await opened();
    expect(o.card!.mode).toBe('white');
    o.sheet.close();
    openLightSheet(h, config());
    o = await opened();
    expect(o.card!.mode).toBeUndefined();
  });

  it('a synchronous move of the owner (an HA relayout) keeps it open; removal closes it (core openFor)', async () => {
    const { h } = await host();
    openLightSheet(h, config());
    const { sheet } = await opened();
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    elsewhere.append(h); // remove and re-insert in one task
    await settle();
    await nextFrame();
    expect(sheet.isOpen).toBe(true);
    expect(sheet.owner).toBe(h);
    h.remove();
    await settle();
    await nextFrame();
    expect(sheet.isOpen).toBe(false);
    expect(sheet.owner).toBeUndefined();
  });

  it('Escape and a backdrop click close it', async () => {
    const { h } = await host();
    openLightSheet(h, config());
    const { sheet, dialog } = await opened();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.isOpen).toBe(false);
    openLightSheet(h, config());
    const o = await opened();
    o.dialog.click();
    expect(o.sheet.isOpen).toBe(false);
  });

  it('follows the hass of the element it was opened from, and closes when that element leaves', async () => {
    const { h, fh } = await host();
    openLightSheet(h, config());
    const { sheet, card } = await opened();
    const next = fh.update('light.kitchen_lights', { state: 'off' });
    h.hass = next;
    await nextFrame();
    await sheet.updateComplete;
    expect(sheet.hass).toBe(next);
    expect(card!.hass).toBe(next);
    h.remove();
    await nextFrame();
    expect(sheet.isOpen).toBe(false);
  });

  it('shows a history button for the light, which closes the sheet and then navigates to its history', async () => {
    const { h } = await host();
    openLightSheet(h, config('light.kitchen_lights'));
    const { sheet } = await opened();
    const btn = sheet.shadowRoot!.querySelector('button.history') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toBeTruthy();
    const log: string[] = [];
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((_d, _t, u) => void log.push(`push ${u}:open=${sheet.isOpen}`));
    const onLoc = () => log.push('location-changed');
    window.addEventListener('location-changed', onLoc);
    btn!.click();
    await settle();
    window.removeEventListener('location-changed', onLoc);
    push.mockRestore();
    expect(sheet.isOpen).toBe(false);
    expect(log).toEqual(['push /history?entity_id=light.kitchen_lights:open=false', 'location-changed']);
  });

  it('a member light opened from the card gets its own history, and reconfigure follows the entity', async () => {
    const { h } = await host();
    openLightSheet(h, config('light.kitchen_lights'));
    const { sheet } = await opened();
    reconfigureLightSheet(h, config('light.ceiling_lights'));
    await sheet.updateComplete;
    const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    (sheet.shadowRoot!.querySelector('button.history') as HTMLButtonElement).click();
    await settle();
    expect(push).toHaveBeenCalledWith(expect.anything(), '', '/history?entity_id=light.ceiling_lights');
    push.mockRestore();
  });

  it('reconfigure and close act only for the element that opened it', async () => {
    const a = await host();
    const b = await host();
    openLightSheet(a.h, config('light.kitchen_lights'));
    const { sheet, card } = await opened();
    reconfigureLightSheet(b.h, config('light.ceiling_lights'));
    expect(card!.config!.entity).toBe('light.kitchen_lights');
    reconfigureLightSheet(a.h, config('light.kitchen_lights', { name: 'Keuken' }));
    expect(card!.config!.name).toBe('Keuken');
    closeLightSheet(b.h);
    expect(sheet.isOpen).toBe(true);
    closeLightSheet(a.h);
    expect(sheet.isOpen).toBe(false);
  });

  it('a host without hass follows HA page hass, never a hass kept from an earlier host', async () => {
    // An earlier host leaves its hass on the shared sheet.
    const first = await host();
    openLightSheet(first.h, config());
    (await opened()).sheet.close();

    const fh = fakeHass();
    const ha = document.createElement('home-assistant') as AnyEl;
    ha.hass = fh.hass;
    document.body.append(ha);
    const bare = document.createElement('div');
    document.body.append(bare);
    openLightSheet(bare, config());
    const { sheet, card } = await opened();
    expect(sheet.isOpen).toBe(true);
    expect(card!.hass).toBe(fh.hass);
    expect(card!.hass).not.toBe(first.fh.hass);

    // HA pushes a new hass to its root element: the card follows it.
    const next = fh.update('light.kitchen_lights', { state: 'off' });
    ha.hass = next;
    await nextFrame();
    await sheet.updateComplete;
    expect(card!.hass).toBe(next);
  });

  it("takes the host's --lc-radius and --lc-blur while open and drops them on close (D-3)", async () => {
    const { h } = await host();
    h.style.setProperty('--lc-radius', '14px');
    h.style.setProperty('--lc-blur', '8px');
    openLightSheet(h, config());
    const { sheet, card } = await opened();
    expect(sheet.style.getPropertyValue('--lc-radius')).toBe('14px');
    expect(sheet.style.getPropertyValue('--lc-blur')).toBe('8px');
    // They reach the card by inheritance through the host's display: contents (checked in Chromium in the P12 evidence run).
    expect(card!.isConnected).toBe(true);
    sheet.close();
    expect(sheet.style.getPropertyValue('--lc-radius')).toBe('');
    expect(sheet.style.getPropertyValue('--lc-blur')).toBe('');

    // A host without them leaves none behind; Escape (the dialog's own close path) also drops them.
    const other = await host();
    openLightSheet(other.h, config());
    const o = await opened();
    expect(o.sheet.style.getPropertyValue('--lc-radius')).toBe('');
    o.sheet.close();
    openLightSheet(h, config());
    const again = await opened();
    expect(again.sheet.style.getPropertyValue('--lc-radius')).toBe('14px');
    again.dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(again.sheet.style.getPropertyValue('--lc-radius')).toBe('');
  });
});

describe('sheet motion (TOK-10, section 2.9)', () => {
  const rules = () => {
    const text = LiquidHomeSheet.elementStyles.map((s) => ('cssText' in s ? (s as { cssText: string }).cssText : '')).join('\n');
    return { text, top: cssRules(text) };
  };

  it('opens with the core animation, removed by prefers-reduced-motion and by look.motion minimal', () => {
    const { text, top } = rules();
    expect(top['dialog[open]'].animation).toMatch(/^lcSheetIn /);
    expect(top['dialog.m-minimal[open]'].animation).toBe('none');
    expect(text.replace(/\s+/g, ' ')).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ dialog\[open\] \{ animation: none; \} \}/);
  });

  it('look.motion minimal puts m-minimal on the dialog', async () => {
    const { h } = await host();
    openLightSheet(h, config('light.kitchen_lights', { look: { motion: 'minimal' } }));
    const { dialog } = await opened();
    expect(dialog.className).toContain('m-minimal');
  });

  it('glass follows the config (dark, light) and the theme', async () => {
    const { h } = await host(fakeHass({ darkMode: false }));
    openLightSheet(h, config('light.kitchen_lights'));
    let o = await opened();
    expect(o.dialog.className).toContain('g-light');
    o.sheet.close();
    openLightSheet(h, config('light.kitchen_lights', { look: { glass: 'dark' } }));
    o = await opened();
    expect(o.dialog.className).toContain('g-dark');
  });
});

describe('module boundaries', () => {
  it('the sheet creates the light card by tag and never imports the light card module', async () => {
    const names = { fs: 'node:fs' };
    const fs = (await import(/* @vite-ignore */ names.fs)) as { readFileSync: (f: string, e: 'utf8') => string; readdirSync: (d: string) => string[] };
    for (const f of fs.readdirSync('src/cards/sheet')) {
      const src = fs.readFileSync(`src/cards/sheet/${f}`, 'utf8');
      for (const line of src.split('\n').filter((l) => l.includes("from '../light"))) expect(line).toMatch(/^import type /);
    }
  });

  it('openLightSheet keeps its (host, config) signature; the options are an optional third parameter', () => {
    expect(openLightSheet.length).toBe(2);
  });
});

/** Test stand-ins for the cover and fan cards (the real ones are other pieces): the sheet's Lovelace surface. */
for (const tag of ['liquid-home-cover-card', 'liquid-home-fan-card']) {
  if (!customElements.get(tag)) customElements.define(tag, class extends StubLightCard {});
}

describe('openEntitySheet (plan 2.9)', () => {
  it.each([
    ['cover.hall_window', 'liquid-home-cover-card'],
    ['fan.living_room_fan', 'liquid-home-fan-card'],
    ['light.kitchen_lights', 'liquid-home-light-card'],
  ])('%s opens %s with the config, Close and History', async (entity, tag) => {
    const { h } = await host();
    openEntitySheet(h, { type: 'custom:x', entity });
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    await settle();
    const card = sheet.shadowRoot!.querySelector(tag) as StubLightCard | null;
    expect(card).not.toBeNull();
    expect(sheet.shadowRoot!.querySelectorAll('liquid-home-light-card, liquid-home-cover-card, liquid-home-fan-card').length).toBe(1);
    expect(card!.config!.entity).toBe(entity);
    expect(card!.config!.historyEntityId).toBe(entity);
    expect(sheet.shadowRoot!.querySelector('button.close, [slot="header-action"]')).not.toBeNull();
  });

  it.each(['cover.hall_window', 'fan.living_room_fan'])('History in the %s sheet closes it, then pushes /history and location-changed', async (entity) => {
    const { h } = await host();
    openEntitySheet(h, { type: 'custom:x', entity });
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    await settle();
    const btn = sheet.shadowRoot!.querySelector('button.history') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    const log: string[] = [];
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((_d, _t, u) => void log.push(`push ${u}:open=${sheet.isOpen}`));
    let evt: CustomEvent | undefined;
    const onLoc = (e: Event) => {
      evt = e as CustomEvent;
      log.push('location-changed');
    };
    window.addEventListener('location-changed', onLoc);
    btn!.click();
    await settle();
    window.removeEventListener('location-changed', onLoc);
    push.mockRestore();
    expect(sheet.isOpen).toBe(false);
    expect(evt!.bubbles).toBe(true);
    expect(evt!.composed).toBe(true);
    expect(log).toEqual([`push /history?entity_id=${entity}:open=false`, 'location-changed']);
  });

  it('Close closes a fan sheet', async () => {
    const { h } = await host();
    openEntitySheet(h, { type: 'custom:x', entity: 'fan.living_room_fan' });
    await settle();
    const sheet = lightSheet()!;
    await sheet.updateComplete;
    await settle();
    const close = sheet.shadowRoot!.querySelector('button.close') as HTMLButtonElement | null;
    expect(close).not.toBeNull();
    close!.click();
    expect(sheet.isOpen).toBe(false);
  });
});
