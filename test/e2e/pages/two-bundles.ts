import { createPageHass, loadBundle } from './fake-hass';

/**
 * Loads liquid-climate.js and liquid-home.js on one page in the order given by ?order=:
 * lc-first, lh-first (one after the other), or parallel (both at once, the order Home Assistant may use).
 * Then mounts one card of each product (and one badge of each) with a fake hass. window.__twoBundles reports the outcome.
 */
type El = HTMLElement & { hass?: unknown; setConfig(c: unknown): void };
const w = window as unknown as { __twoBundles: { done: boolean; error?: string } };
w.__twoBundles = { done: false };

const order = new URLSearchParams(location.search).get('order') ?? 'lc-first';
const hassBox = createPageHass();

function mount(tag: string, config: Record<string, unknown>, parent: HTMLElement, id: string): El {
  const el = document.createElement(tag) as El;
  el.id = id;
  el.setConfig({ type: `custom:${tag}`, ...config });
  el.hass = hassBox.current();
  parent.append(el);
  return el;
}

try {
  if (order === 'lh-first') {
    await loadBundle('liquid-home');
    await loadBundle('liquid-climate');
  } else if (order === 'parallel') {
    await Promise.all([loadBundle('liquid-climate'), loadBundle('liquid-home')]);
  } else {
    await loadBundle('liquid-climate');
    await loadBundle('liquid-home');
  }

  const root = document.getElementById('root')!;
  const els: El[] = [
    mount('liquid-home-light-card', { entity: hassBox.ids.dimmed }, root, 'lh-card'),
    mount('liquid-climate-card', { entity: hassBox.climateIds[0] }, root, 'lc-card'),
  ];
  els.push(mount('liquid-home-cover-card', { entity: hassBox.coverId }, root, 'lh-cover'));
  els.push(mount('liquid-home-fan-card', { entity: hassBox.fanId }, root, 'lh-fan'));
  els.push(mount('liquid-home-media-card', { entity: hassBox.mediaId }, root, 'lh-media'));
  const badges = document.createElement('div');
  badges.id = 'badges';
  root.append(badges);
  els.push(mount('liquid-home-badge', { entity: hassBox.ids.dimmed }, badges, 'lh-badge'));
  els.push(mount('liquid-climate-badge', { entity: hassBox.climateIds[0] }, badges, 'lc-badge'));
  hassBox.subscribe((h) => els.forEach((e) => (e.hass = h)));
  await Promise.all(els.map((e) => (e as unknown as { updateComplete?: Promise<unknown> }).updateComplete));
  w.__twoBundles.done = true;
} catch (err) {
  w.__twoBundles.error = String((err as Error)?.stack ?? err);
  w.__twoBundles.done = true;
  throw err;
}
