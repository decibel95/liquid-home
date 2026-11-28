import { createPageHass, loadBundle } from './fake-hass';

/**
 * A dashboard-like page for the frame-time measurement (plan 2.10), on the built bundles. Two products, same layout and
 * quantities, so one can be the baseline of the other:
 * - ?product=lh (default): 1 light card, 12 tiles, 1 room card and 6 badges from Liquid Home, plus (see ?lc=) 2 Liquid
 *   Climate cards.
 * - ?product=lc: 1 Liquid Climate dial, 12 tiles, 1 cluster (5 rooms) and 6 badges, climate entities idle (cool,
 *   hvac_action idle, look.motion minimal so that no particle animation runs), no Liquid Home cards.
 * - ?page=media (0.4): a media page instead of the dashboard: ?cards=4|12 media cards, each with a tile of the same player,
 *   playing with a seek line so the 1 s tickers run (product=lh), or the same number of Liquid Climate cards, each with a
 *   tile (product=lc), the baseline of the same glass count. ?art=off removes the cover from every player (plain glass,
 *   the backdrop toggle). The dragged control is the volume pill of the first media card (the dial ring on the baseline).
 * window.__perfReady is true once every card has rendered. window.__dragPath(phase) gives the pointer position on the
 * main control (the light card slider, or the dial's temperature ring) for phase 0..2pi, and window.__dragTarget
 * names what is dragged.
 */
type El = HTMLElement & { hass?: unknown; setConfig(c: unknown): void; updateComplete?: Promise<unknown> };
const w = window as unknown as {
  __perfReady: boolean;
  __perfError?: string;
  __dragPath: (phase: number) => { x: number; y: number };
  __dragTarget: string;
};
w.__perfReady = false;

const params = new URLSearchParams(location.search);
const pageKind = params.get('page') === 'media' ? 'media' : 'dashboard';
const mediaCount = Math.min(12, Number(params.get('cards') ?? 4));
const product = params.get('product') === 'lc' ? 'lc' : 'lh';
/**
 * ?lc=idle (default): the Liquid Climate entities are off, so its cards are static glass.
 * ?lc=heating: they are heating, which runs Liquid Climate's endless flame animation (lcFlick) on both cards.
 * ?lc=none: no Liquid Climate cards, to show what Liquid Home costs on its own.
 * (Only for product=lh.)
 */
const lc = params.get('lc') ?? 'idle';
/**
 * ?groups=light,tiles,room,badges (default: all four) mounts only those Liquid Home groups, to attribute cost.
 * ?blur=0 sets look.blur to 0 on every card of the measured product (the documented way to switch the blur off).
 */
const groups = new Set((params.get('groups') ?? 'light,tiles,room,badges').split(','));
/**
 * Liquid Climate's dial is only draggable in cooling or heating modes, and there its rich motion runs about twenty endless
 * particle animations that repaint every frame. The baseline therefore uses look.motion minimal (?lcmotion=rich keeps it).
 */
const lcMotion = product === 'lc' && params.get('lcmotion') !== 'rich' ? { motion: 'minimal' } : {};
const look = params.has('blur') || product === 'lc' ? { look: { ...lcMotion, ...(params.has('blur') ? { blur: Number(params.get('blur')) } : {}) } } : {};

try {
  const hassBox = createPageHass({
    extraLights: 12,
    extraClimates: 12,
    extraMedia: pageKind === 'media' ? 12 : 0,
    mediaArt: params.get('art') !== 'off',
    delay: Number(params.get('delay') ?? 800),
    climateState: product === 'lc' ? (params.get('lcstate') ?? 'cool') : lc === 'heating' ? 'heat' : 'off',
  });
  const bundles: ('liquid-home' | 'liquid-climate')[] = product === 'lc' ? ['liquid-climate'] : lc === 'none' ? ['liquid-home'] : ['liquid-home', 'liquid-climate'];
  await Promise.all(bundles.map(loadBundle));

  const all: El[] = [];
  const mount = (tag: string, config: Record<string, unknown>, parent: string | Element): El => {
    const el = document.createElement(tag) as El;
    el.setConfig({ type: `custom:${tag}`, ...config });
    el.hass = hassBox.current();
    (typeof parent === 'string' ? document.querySelector(parent)! : parent).append(el);
    all.push(el);
    return el;
  };

  const mediaGrid = (): HTMLElement => {
    document.querySelector<HTMLElement>('main')!.style.gridTemplateColumns = '1fr';
    const grid = document.createElement('div');
    grid.id = 'mediagrid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(444px,1fr));gap:16px;align-items:start';
    document.querySelector('#right')!.append(grid);
    return grid;
  };
  const cell = (grid: HTMLElement): HTMLElement => {
    const c = document.createElement('div');
    c.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:0';
    grid.append(c);
    return c;
  };

  if (pageKind === 'media' && product === 'lc') {
    const grid = mediaGrid();
    for (let i = 0; i < mediaCount; i++) {
      const c = cell(grid);
      mount('liquid-climate-card', { entity: hassBox.extraClimates[i], ...look }, c);
      mount('liquid-climate-tile', { entity: hassBox.extraClimates[i], ...look }, c);
    }
    w.__dragTarget = 'liquid-climate-card temperature ring';
    w.__dragPath = (phase) => {
      const svg = document.querySelector('liquid-climate-card')!.shadowRoot!.querySelector('svg[role="slider"]')!;
      const r = svg.getBoundingClientRect();
      const k = r.width / 400;
      const angle = ((135 + 270 * (0.5 - 0.45 * Math.cos(phase))) * Math.PI) / 180;
      return { x: r.left + (200 + 130 * Math.cos(angle)) * k, y: r.top + (200 + 130 * Math.sin(angle)) * k };
    };
  } else if (pageKind === 'media') {
    const grid = mediaGrid();
    for (let i = 0; i < mediaCount; i++) {
      const c = cell(grid);
      mount('liquid-home-media-card', { entity: hassBox.extraMedia[i], ...look }, c);
      mount('liquid-home-tile', { entity: hassBox.extraMedia[i], ...look }, c);
    }
    w.__dragTarget = 'liquid-home-media-card volume pill';
    w.__dragPath = (phase) => {
      const r = document.querySelector('liquid-home-media-card')!.shadowRoot!.querySelector('[role="slider"][aria-label^="Volume"]')!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * (0.5 - 0.4 * Math.sin(phase)) };
    };
  } else if (product === 'lc') {
    const rooms = hassBox.extraClimates;
    mount('liquid-climate-card', { entity: hassBox.climateIds[0], ...look }, '#left');
    rooms.slice(0, 6).forEach((entity) => mount('liquid-climate-badge', { entity, ...look }, '#badges'));
    rooms.forEach((entity) => mount('liquid-climate-tile', { entity, ...look }, '#tiles'));
    mount('liquid-climate-cluster', { title: 'Perf cluster', entities: rooms.slice(0, 5), ...look }, '#room');
    w.__dragTarget = 'liquid-climate-card temperature ring';
    // The dial's temperature ring: radius 130 of 400 view box units, sweeping 270 degrees from 135 degrees.
    w.__dragPath = (phase) => {
      const svg = document.querySelector('liquid-climate-card')!.shadowRoot!.querySelector('svg[role="slider"]')!;
      const r = svg.getBoundingClientRect();
      const k = r.width / 400;
      const angle = ((135 + 270 * (0.5 - 0.45 * Math.cos(phase))) * Math.PI) / 180;
      return { x: r.left + (200 + 130 * Math.cos(angle)) * k, y: r.top + (200 + 130 * Math.sin(angle)) * k };
    };
  } else {
    // The slider the measurement drags is on the light card, so it is always mounted.
    mount('liquid-home-light-card', { entity: hassBox.ids.colourTemp, name: 'Perf light card', ...look }, '#left');
    if (lc !== 'none') {
      mount('liquid-climate-card', { entity: hassBox.climateIds[0] }, '#left');
      mount('liquid-climate-tile', { entity: hassBox.climateIds[1] }, '#left');
    }
    if (groups.has('badges')) hassBox.extraLights.slice(0, 6).forEach((entity) => mount('liquid-home-badge', { entity, ...look }, '#badges'));
    if (groups.has('tiles')) hassBox.extraLights.forEach((entity) => mount('liquid-home-tile', { entity, ...look }, '#tiles'));
    if (groups.has('room')) mount('liquid-home-room', { title: 'Perf room', entities: hassBox.extraLights.slice(0, 5), ...look }, '#room');
    w.__dragTarget = 'liquid-home-light-card slider';
    w.__dragPath = (phase) => {
      const r = document.querySelector('liquid-home-light-card')!.shadowRoot!.querySelector('[role="slider"]')!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * (0.5 - 0.4 * Math.sin(phase)) };
    };
  }

  hassBox.subscribe((h) => all.forEach((e) => (e.hass = h)));
  await Promise.all(all.map((e) => e.updateComplete));
  w.__perfReady = true;
} catch (err) {
  w.__perfError = String((err as Error)?.stack ?? err);
  throw err;
}
