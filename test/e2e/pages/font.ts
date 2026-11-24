import { createPageHass } from './fake-hass';

/**
 * Loads the built liquid-home.js as HACS serves it (with a ?hacstag= query) and mounts one light card with a fake
 * hass, so the card's text needs the Inter font the bundle registers. window.__font reports the outcome.
 */
const HACSTAG = 'e2e-font-1';

type El = HTMLElement & { hass?: unknown; setConfig(c: unknown): void; updateComplete?: Promise<unknown> };
const w = window as unknown as { __font: { done: boolean; error?: string } };
w.__font = { done: false };

try {
  const hassBox = createPageHass();
  await import(/* @vite-ignore */ `/__bundles/liquid-home.js?hacstag=${HACSTAG}`);
  const el = document.createElement('liquid-home-light-card') as El;
  el.id = 'card';
  el.setConfig({ type: 'custom:liquid-home-light-card', entity: hassBox.ids.dimmed });
  el.hass = hassBox.current();
  document.getElementById('root')!.append(el);
  await el.updateComplete;
  w.__font.done = true;
} catch (err) {
  w.__font.error = String((err as Error)?.stack ?? err);
  w.__font.done = true;
  throw err;
}
