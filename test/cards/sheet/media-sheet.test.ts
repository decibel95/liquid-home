// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LitElement, html } from 'lit';
import type { HomeAssistant } from '@decibel95/liquid-core';
import '../../../src/cards/sheet';
import { lightSheet, openEntitySheet, reconfigureLightSheet } from '../../../src/cards/sheet/open';
import { sheetCardTag } from '../../../src/cards/sheet/liquid-home-sheet';
import { MEDIA_FEATURE, mediaWriters, NO_PENDING, type MediaWriter } from '../../../src/media';
import { TAGS } from '../../../src/const';
import { settle } from '../tile/helpers';
import { defineStubLightCard, StubLightCard } from './stub-light-card';

defineStubLightCard();
for (const tag of ['liquid-home-cover-card', 'liquid-home-fan-card', TAGS.media]) {
  if (!customElements.get(tag)) customElements.define(tag, class extends StubLightCard {});
}

class TestHost extends LitElement {
  static override properties = { hass: { attribute: false } };
  hass?: HomeAssistant;
  protected override render() {
    return html`<button class="open">open</button>`;
  }
}
customElements.define('test-media-sheet-host', TestHost);

const ID = 'media_player.kitchen';
const BOTH = MEDIA_FEATURE.SHUFFLE_SET | MEDIA_FEATURE.REPEAT_SET | MEDIA_FEATURE.PAUSE;

function mediaHass(state: string, attrs: Record<string, unknown> = {}, features = BOTH): HomeAssistant {
  return {
    states: {
      [ID]: { entity_id: ID, state, attributes: { friendly_name: 'Kitchen', supported_features: features, shuffle: false, repeat: 'off', ...attrs }, last_changed: '', last_updated: '', context: {} },
      'light.kitchen_lights': { entity_id: 'light.kitchen_lights', state: 'on', attributes: { friendly_name: 'Lights' }, last_changed: '', last_updated: '', context: {} },
    },
    entities: {},
    devices: {},
    areas: {},
    config: { unit_system: { temperature: 'C' } },
    language: 'en',
    locale: { language: 'en', number_format: 'language' },
    themes: { darkMode: true },
    callService: async () => undefined,
  } as unknown as HomeAssistant;
}

async function open(hass: HomeAssistant, entity = ID) {
  const h = document.createElement('test-media-sheet-host') as TestHost;
  h.hass = hass;
  document.body.append(h);
  await h.updateComplete;
  (h.renderRoot.querySelector('button.open') as HTMLButtonElement).focus();
  openEntitySheet(h, { type: 'custom:x', entity });
  await settle();
  const sheet = lightSheet()!;
  await sheet.updateComplete;
  await settle();
  return { h, sheet };
}

const btn = (sheet: HTMLElement, cls: string) => sheet.shadowRoot!.querySelector(`button.${cls}`) as HTMLButtonElement | null;
const actions = (sheet: HTMLElement) => [...sheet.shadowRoot!.querySelectorAll('button[slot="header-action"]')].map((b) => b.className);

/** Hold the media writer from outside (as a card would) so the test can spy on it and set what is pending. */
function writer(): MediaWriter {
  return mediaWriters.acquire(ID);
}

afterEach(() => {
  lightSheet()?.close();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('media in the sheet (plan 2.8)', () => {
  it('maps media_player to the media card', () => {
    expect(sheetCardTag(ID)).toBe(TAGS.media);
  });

  it('hosts the media card with inSheet, History and Close, in the order Shuffle, Repeat, History, Close', async () => {
    const { sheet } = await open(mediaHass('playing'));
    const card = sheet.shadowRoot!.querySelector(TAGS.media) as StubLightCard & { inSheet?: boolean };
    expect(card).not.toBeNull();
    expect(card.inSheet).toBe(true);
    expect(card.config!.historyEntityId).toBe(ID);
    expect(actions(sheet)).toEqual(['act shuffle', 'act repeat', 'history', 'close']);
  });

  it('sets inSheet on every hosted card', async () => {
    const { sheet } = await open(mediaHass('playing'), 'light.kitchen_lights');
    expect((sheet.shadowRoot!.querySelector(TAGS.light) as StubLightCard & { inSheet?: boolean }).inSheet).toBe(true);
    expect(actions(sheet)).toEqual(['history', 'close']);
  });

  it('History closes the sheet, then pushes /history and fires location-changed, in that order', async () => {
    const { sheet } = await open(mediaHass('playing'));
    const log: string[] = [];
    vi.spyOn(window.history, 'pushState').mockImplementation((_d, _t, u) => void log.push(`push ${u}:open=${sheet.isOpen}`));
    const onLoc = () => log.push('location-changed');
    window.addEventListener('location-changed', onLoc);
    btn(sheet, 'history')!.click();
    await settle();
    window.removeEventListener('location-changed', onLoc);
    expect(log).toEqual(['push /history?entity_id=media_player.kitchen:open=false', 'location-changed']);
  });

  it('Shuffle and Repeat have labels, icons and pressed states', async () => {
    const { sheet } = await open(mediaHass('playing', { shuffle: true, repeat: 'all' }));
    const s = btn(sheet, 'shuffle')!;
    const r = btn(sheet, 'repeat')!;
    expect(s.getAttribute('aria-label')).toBe('Shuffle');
    expect(s.getAttribute('aria-pressed')).toBe('true');
    expect(r.getAttribute('aria-label')).toBe('Repeat all');
    expect(r.getAttribute('aria-pressed')).toBe('true');
  });

  it('Repeat is not pressed while off and draws repeat1 for one', async () => {
    const { sheet, h } = await open(mediaHass('playing'));
    const r = btn(sheet, 'repeat')!;
    expect(r.getAttribute('aria-label')).toBe('Repeat off');
    expect(r.getAttribute('aria-pressed')).toBe('false');
    const allPath = r.querySelector('path')!.getAttribute('d');
    h.hass = mediaHass('playing', { repeat: 'one' });
    sheet.pushHass(h.hass);
    await sheet.updateComplete;
    await settle();
    expect(btn(sheet, 'repeat')).toBe(r);
    expect(r.getAttribute('aria-label')).toBe('Repeat one');
    expect(r.getAttribute('aria-pressed')).toBe('true');
    const onePath = r.querySelector('path')!.getAttribute('d')!;
    expect(onePath).not.toBe(allPath);
    expect(onePath.endsWith('M11 10h1v4')).toBe(true);
  });

  it('follows hass changes in the same elements, so focus stays', async () => {
    const { sheet } = await open(mediaHass('playing'));
    const s = btn(sheet, 'shuffle')!;
    s.focus();
    expect(sheet.shadowRoot!.activeElement ?? document.activeElement).toBeTruthy();
    sheet.pushHass(mediaHass('playing', { shuffle: true }));
    await sheet.updateComplete;
    await settle();
    expect(btn(sheet, 'shuffle')).toBe(s);
    expect(s.getAttribute('aria-pressed')).toBe('true');
    expect(sheet.shadowRoot!.activeElement).toBe(s);
  });

  it('writes through the shared writer: toggleShuffle and cycleRepeat', async () => {
    const w = writer();
    const shuffle = vi.spyOn(w, 'toggleShuffle');
    const repeat = vi.spyOn(w, 'cycleRepeat');
    const { sheet } = await open(mediaHass('playing'));
    btn(sheet, 'shuffle')!.click();
    btn(sheet, 'repeat')!.click();
    expect(shuffle).toHaveBeenCalledTimes(1);
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mediaWriters.refs(ID)).toBeGreaterThan(1);
    sheet.close();
    await settle();
    expect(mediaWriters.refs(ID)).toBe(1);
    mediaWriters.release(w);
  });

  it('shows the writer pending value while held', async () => {
    const w = writer();
    const { sheet } = await open(mediaHass('playing'));
    expect(btn(sheet, 'shuffle')!.getAttribute('aria-pressed')).toBe('false');
    vi.spyOn(w, 'pending', 'get').mockReturnValue({ ...NO_PENDING, shuffle: true, repeat: 'one' });
    (sheet as unknown as { requestActions(): void }).requestActions();
    expect(btn(sheet, 'shuffle')!.getAttribute('aria-pressed')).toBe('true');
    expect(btn(sheet, 'repeat')!.getAttribute('aria-label')).toBe('Repeat one');
    sheet.close();
    mediaWriters.release(w);
  });

  it('releases the writer on disconnect', async () => {
    const { sheet } = await open(mediaHass('playing'));
    expect(mediaWriters.refs(ID)).toBeGreaterThanOrEqual(1);
    sheet.remove();
    await settle();
    expect(mediaWriters.refs(ID)).toBe(0);
  });

  it('releases the writer on a native-only dialog close', async () => {
    const { sheet } = await open(mediaHass('playing'));
    expect(mediaWriters.refs(ID)).toBeGreaterThanOrEqual(1);
    sheet.shadowRoot!.querySelector('dialog')!.close();
    await settle();
    expect(mediaWriters.refs(ID)).toBe(0);
  });

  it('a pending change redraws the same nodes and keeps focus', async () => {
    const w = writer();
    const { sheet } = await open(mediaHass('playing'));
    const s = btn(sheet, 'shuffle')!;
    s.focus();
    vi.spyOn(w, 'pending', 'get').mockReturnValue({ ...NO_PENDING, shuffle: true });
    w.subscribe(() => undefined);
    (sheet as unknown as { requestActions(): void }).requestActions();
    expect(btn(sheet, 'shuffle')).toBe(s);
    expect(s.getAttribute('aria-pressed')).toBe('true');
    expect(sheet.shadowRoot!.activeElement).toBe(s);
    sheet.close();
    mediaWriters.release(w);
  });

  it('hides Shuffle and Repeat without their feature bits', async () => {
    const a = await open(mediaHass('playing', {}, MEDIA_FEATURE.PAUSE | MEDIA_FEATURE.REPEAT_SET));
    expect(actions(a.sheet)).toEqual(['act repeat', 'history', 'close']);
    a.sheet.close();
    document.body.innerHTML = '';
    const b = await open(mediaHass('playing', {}, MEDIA_FEATURE.SHUFFLE_SET));
    expect(actions(b.sheet)).toEqual(['act shuffle', 'history', 'close']);
    b.sheet.close();
    document.body.innerHTML = '';
    const c = await open(mediaHass('playing', {}, MEDIA_FEATURE.PAUSE));
    expect(actions(c.sheet)).toEqual(['history', 'close']);
  });

  it.each(['off', 'unavailable', 'unknown'])('hides Shuffle and Repeat while %s', async (state) => {
    const { sheet } = await open(mediaHass(state));
    expect(actions(sheet)).toEqual(['history', 'close']);
  });

  it('draws them again when the player comes back', async () => {
    const { sheet } = await open(mediaHass('off'));
    expect(actions(sheet)).toEqual(['history', 'close']);
    sheet.pushHass(mediaHass('playing'));
    await sheet.updateComplete;
    await settle();
    expect(actions(sheet)).toEqual(['act shuffle', 'act repeat', 'history', 'close']);
  });
});

describe('cross-domain reconfigure (D-15)', () => {
  it('reopens with the new card for the same owner and keeps the focus return', async () => {
    const { h, sheet } = await open(mediaHass('playing'));
    const control = h.renderRoot.querySelector('button.open') as HTMLButtonElement;
    reconfigureLightSheet(h, { type: 'custom:x', entity: 'light.kitchen_lights' } as never);
    await settle();
    await sheet.updateComplete;
    await settle();
    expect(sheet.isOpen).toBe(true);
    expect(sheet.owner).toBe(h);
    expect(sheet.shadowRoot!.querySelector(TAGS.media)).toBeNull();
    const card = sheet.shadowRoot!.querySelector(TAGS.light) as StubLightCard;
    expect(card.config!.entity).toBe('light.kitchen_lights');
    expect(actions(sheet)).toEqual(['history', 'close']);
    expect(mediaWriters.refs(ID)).toBe(0);
    btn(sheet, 'close')!.click();
    await settle();
    expect((h.renderRoot as ShadowRoot).activeElement).toBe(control);
    expect(sheet.isOpen).toBe(false);
  });

  it('a late native close event between the close and the reopen leaves the reopened card', async () => {
    const { h, sheet } = await open(mediaHass('playing'));
    const dialog = sheet.shadowRoot!.querySelector('dialog')!;
    reconfigureLightSheet(h, { type: 'custom:x', entity: 'light.kitchen_lights' } as never);
    // A native close event is a queued task: it arrives after the reopen's microtasks have shown the dialog again.
    await sheet.updateComplete;
    await Promise.resolve();
    dialog.dispatchEvent(new Event('close'));
    await settle();
    await sheet.updateComplete;
    await settle();
    expect(sheet.isOpen).toBe(true);
    expect(sheet.shadowRoot!.querySelector(TAGS.light)).not.toBeNull();
  });

  it('light to media reopens with the media card and its actions', async () => {
    const { h, sheet } = await open(mediaHass('playing'), 'light.kitchen_lights');
    reconfigureLightSheet(h, { type: 'custom:x', entity: ID } as never);
    await settle();
    await sheet.updateComplete;
    await settle();
    expect(sheet.shadowRoot!.querySelector(TAGS.media)).not.toBeNull();
    expect(actions(sheet)).toEqual(['act shuffle', 'act repeat', 'history', 'close']);
  });

  it('the same domain reconfigures in place', async () => {
    const { h, sheet } = await open(mediaHass('playing'));
    const card = sheet.shadowRoot!.querySelector(TAGS.media) as StubLightCard;
    reconfigureLightSheet(h, { type: 'custom:x', entity: 'media_player.other' } as never);
    await settle();
    expect(sheet.shadowRoot!.querySelector(TAGS.media)).toBe(card);
    expect(card.configs).toHaveLength(2);
  });
});
