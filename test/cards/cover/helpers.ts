import { CARD_TYPES, TAGS } from '../../../src/const';
import '../../../src/cards/cover';
import type { LiquidHomeCoverCard } from '../../../src/cards/cover/card';
import { createCoverSim, type CoverSim, type CoverSimOptions } from '../../covers/sim';

export { coverIds as ids } from '../../covers/fixtures';

/** The simulated HA plus a mount helper: every mounted card follows the published hass. */
export function coverHarness(opts: CoverSimOptions = {}) {
  const sim = createCoverSim(opts);
  const cards = new Set<LiquidHomeCoverCard>();
  sim.onHass((hass) => {
    for (const c of cards) c.hass = hass;
  });
  return Object.assign(sim, {
    async mount(entity: string, config: Record<string, unknown> = {}) {
      const el = document.createElement(TAGS.cover) as LiquidHomeCoverCard;
      el.setConfig({ type: CARD_TYPES.cover, entity, ...config });
      el.hass = sim.hass;
      cards.add(el);
      document.body.append(el);
      await el.updateComplete;
      return el;
    },
  }) as CoverSim & { mount(entity: string, config?: Record<string, unknown>): Promise<LiquidHomeCoverCard> };
}

export const $ = (el: HTMLElement, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement | null;
export const $$ = (el: HTMLElement, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
export const pill = (el: HTMLElement) => $(el, '.lc-slider')!;
export const fill = (el: HTMLElement) => parseFloat($(el, '.lc-slider-fill')!.style.height);
export const text = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function pointer(el: HTMLElement, type: string, clientY: number, pointerId = 1) {
  pill(el).dispatchEvent(new PointerEvent(type, { pointerId, clientY, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));
}

export function key(el: HTMLElement, type: 'keydown' | 'keyup', k: string, repeat = false) {
  pill(el).dispatchEvent(new KeyboardEvent(type, { key: k, repeat, bubbles: true, cancelable: true }));
}

/** Calls as "service {data without entity_id}" strings, as the prototype's write log. */
export const callList = (sim: CoverSim) => sim.calls.map((c) => {
  const { entity_id: _id, ...rest } = c.data;
  return `${c.domain}.${c.service}${Object.keys(rest).length ? ' ' + JSON.stringify(rest) : ''}`;
});
