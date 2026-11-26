/**
 * Media staging page for the README and docs media (scripts/media). No harness chrome, English names,
 * fixed states from the derived light fixtures, HA's default light and dark theme variables.
 *
 * Query parameters: ?scene=<name>   ?theme=light|dark   ?lang=en|nl|de|fr|es|it   ?cursor=1 (visible pointer for recordings)
 * Window API for the scripts: __mediaReady (true once fonts and all cards have rendered) and
 * __media.pointer(visible) and __media.settle() (pause ambient motion).
 *
 * SCENES holds one entry per scene; the same names are listed in scripts/media/stills.mjs (and used by animations.mjs).
 */
import './media-focus';
import '../src/index';
import { createHarness, type Harness } from './harness';
import { CARD_TYPES, TAGS } from '../src/const';
import { withMixedRegistry } from './slots/room';
import { COVER_FIXTURES } from '../test/covers/fixtures';
import { FAN_FIXTURES, type FanState } from '../test/fans/fixtures';
import { openEntitySheet } from '../src/cards/sheet/open';

const params = new URLSearchParams(location.search);
const dark = params.get('theme') === 'dark';
const lang = params.get('lang') ?? 'en';
const scene = params.get('scene') ?? '';

export interface SceneContext {
  stage: HTMLElement;
  harness: Harness;
}
export type Scene = (ctx: SceneContext) => void | Promise<void>;

/**
 * The Living Room Fan of the scenes: the derived features-63 fan (speed, oscillate, direction, presets) on at 67 %,
 * oscillating. DERIVED from the real demo fan fixture, as the dev harness slots do.
 */
const presetFan = (): FanState => {
  const f = FAN_FIXTURES.pct67();
  return { ...f, entity_id: 'fan.living_room_fan_media', attributes: { ...f.attributes, supported_features: 63, oscillating: true } };
};
const FAN = presetFan().entity_id;
const COVER = COVER_FIXTURES.living().entity_id;
const COVER_CLOSED = COVER_FIXTURES.hallClosed().entity_id;

/** The light harness hass plus the cover and fan fixtures the scenes show (service calls on them are ignored). */
function withDomains(h: Harness['hass']): Harness['hass'] {
  const states = { ...h.states };
  for (const make of Object.values(COVER_FIXTURES)) {
    const c = make();
    states[c.entity_id] = c;
  }
  for (const make of Object.values(FAN_FIXTURES)) {
    const f = make();
    states[f.entity_id] = f as never;
  }
  states[FAN] = presetFan() as never;
  return { ...h, states };
}

type CardEl = HTMLElement & { hass?: unknown; setConfig(c: unknown): void };

/** A card element with its config and the harness hass, glass forced to the theme of the page (the fake hass has no dark mode). */
function card(ctx: SceneContext, tag: string, config: Record<string, unknown>, withAreas = false): CardEl {
  const el = document.createElement(tag) as CardEl;
  el.setConfig({ ...config, look: { glass: dark ? 'dark' : 'light', ...(config.look as object | undefined) } });
  const make = (h: Harness['hass']) => (withAreas ? withMixedRegistry(withDomains(h), ctx.harness.ids) : withDomains(h));
  el.hass = make(ctx.harness.hass);
  ctx.harness.onHass((h) => (el.hass = make(h)));
  return el;
}

const box = (cls: string, width?: number): HTMLElement => {
  const d = document.createElement('div');
  d.className = cls;
  if (width) d.style.width = `${width}px`;
  return d;
};

/** Scene name to builder. Each scene is one card (or one group of its variants) on the themed page. */
const SCENES: Record<string, Scene> = {
  // The light card: Kitchen Lights, dimmed, colour mode available.
  light(ctx) {
    const pad = box('pad', 444 + 88);
    pad.append(card(ctx, TAGS.light, { type: CARD_TYPES.light, entity: ctx.harness.ids.dimmed, name: 'Kitchen Lights' }));
    ctx.stage.append(pad);
  },

  // The cover card: Living Room Window, open at 70 %, tilt available (Position and Tilt buttons).
  cover(ctx) {
    const pad = box('pad', 444 + 88);
    pad.append(card(ctx, TAGS.cover, { type: CARD_TYPES.cover, entity: COVER }));
    ctx.stage.append(pad);
  },

  // The fan card: Living Room Fan, on at 67 %, oscillating, with the preset chip.
  fan(ctx) {
    const pad = box('pad', 444 + 88);
    pad.append(card(ctx, TAGS.fan, { type: CARD_TYPES.fan, entity: FAN }));
    ctx.stage.append(pad);
  },

  // The tile, mixed domains: a light on in colour, an open cover, a fan, a closed cover.
  tile(ctx) {
    const { ids } = ctx.harness;
    const col = box('pad col', 520 + 88);
    for (const id of [ids.dimmed, COVER, FAN, COVER_CLOSED]) col.append(card(ctx, TAGS.tile, { type: CARD_TYPES.tile, entity: id }));
    ctx.stage.append(col);
  },

  // The badge, mixed domains: pill and icon only.
  badge(ctx) {
    const { ids } = ctx.harness;
    const pad = box('pad col');
    for (const iconOnly of [false, true]) {
      const row = box('row');
      for (const id of [ids.dimmed, COVER, FAN, COVER_CLOSED, ids.unavailable]) {
        row.append(card(ctx, TAGS.badge, { type: CARD_TYPES.badge, entity: id, ...(iconOnly ? { icon_only: true } : {}) }));
      }
      pad.append(row);
    }
    ctx.stage.append(pad);
  },

  // The room card with lights, covers and fans from one area (domains: all three).
  room(ctx) {
    const pad = box('pad', 780 + 88);
    pad.append(card(ctx, TAGS.room, { type: CARD_TYPES.room, area: 'living_room', domains: ['light', 'cover', 'fan'] }, true));
    ctx.stage.append(pad);
  },

  // README hero: the three big cards on top, the tile column and badges beside the room card below.
  hero(ctx) {
    const { ids } = ctx.harness;
    const pad = box('pad col');
    pad.style.gap = '28px';
    const w = (n: number, el: HTMLElement) => {
      const b = box('', n);
      b.append(el);
      return b;
    };
    const top = box('row');
    top.style.alignItems = 'flex-start';
    top.style.flexWrap = 'nowrap';
    top.style.gap = '28px';
    top.append(
      w(444, card(ctx, TAGS.light, { type: CARD_TYPES.light, entity: ids.dimmed, name: 'Kitchen Lights' })),
      w(444, card(ctx, TAGS.cover, { type: CARD_TYPES.cover, entity: COVER })),
      w(444, card(ctx, TAGS.fan, { type: CARD_TYPES.fan, entity: FAN })),
    );
    const col = box('col', 520);
    for (const id of [ids.dimmed, COVER, FAN]) col.append(card(ctx, TAGS.tile, { type: CARD_TYPES.tile, entity: id }));
    const badges = box('row');
    for (const id of [ids.dimmed, COVER, FAN]) badges.append(card(ctx, TAGS.badge, { type: CARD_TYPES.badge, entity: id }));
    col.append(badges);
    const left = box('col');
    left.style.gap = '28px';
    left.append(top, col);
    pad.style.flexDirection = 'row';
    pad.style.alignItems = 'flex-start';
    pad.append(left, w(780, card(ctx, TAGS.room, { type: CARD_TYPES.room, area: 'living_room', domains: ['light', 'cover', 'fan'] }, true)));
    ctx.stage.append(pad);
  },

  // README sheet: the light card open as a sheet (power, history and close in the header), on a 532 x 550 stage.
  async sheet(ctx) {
    const { ids } = ctx.harness;
    const pad = box('fixedsheet');
    pad.style.cssText = 'width:532px;height:550px';
    const host = card(ctx, TAGS.tile, { type: CARD_TYPES.tile, entity: ids.dimmed, name: 'Kitchen Lights' });
    pad.append(host);
    ctx.stage.append(pad);
    await customElements.whenDefined(TAGS.tile);
    openEntitySheet(host, { type: CARD_TYPES.light, entity: ids.dimmed, name: 'Kitchen Lights', look: { glass: dark ? 'dark' : 'light' } });
  },

  // README modes: the light card in Brightness, White and Colour mode.
  modes(ctx) {
    const { ids } = ctx.harness;
    const pad = box('pad row');
    pad.style.flexWrap = 'nowrap';
    for (const mode of ['brightness', 'white', 'colour']) {
      const b = box('', 444);
      const el = card(ctx, TAGS.light, { type: CARD_TYPES.light, entity: ids.dimmed, name: 'Kitchen Lights' });
      (el as CardEl & { setPillMode?(m: string): void }).setPillMode?.(mode);
      b.append(el);
      pad.append(b);
    }
    ctx.stage.append(pad);
  },
};

const stage = document.getElementById('stage')!;
document.documentElement.classList.add(dark ? 'theme-dark' : 'theme-light');
const root = document.createElement('div');
root.className = `root ${dark ? 'theme-dark' : 'theme-light'}`;
stage.append(root);

const harness = createHarness({ language: lang, delay: 0 });

// ---- Pointer overlay for recordings ----------------------------------------------------------
const pointerEl = document.createElement('div');
document.body.append(pointerEl);
if (params.get('cursor') === '1') {
  const p = pointerEl;
  p.id = 'pointer';
  p.setAttribute('popover', 'manual');
  p.append(document.createElement('i'));
  p.showPopover();
  let queued = false;
  const move = (e: MouseEvent) => {
    p.style.transform = `translate(${e.clientX - 11}px, ${e.clientY - 11}px)`;
    // A modal dialog opens in the top layer above the pointer: put the pointer back on top.
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        p.hidePopover();
        p.showPopover();
      });
    }
  };
  addEventListener('mousemove', move, true);
  addEventListener('mousedown', (e) => { move(e); p.classList.add('down'); e.preventDefault(); }, true);
  addEventListener('mouseup', () => p.classList.remove('down'), true);
} else {
  pointerEl.remove();
}

// ---- Window API --------------------------------------------------------------------------------
const allElements = (from: ParentNode = document): Element[] => {
  const out: Element[] = [];
  for (const e of from.querySelectorAll('*')) {
    out.push(e);
    if (e.shadowRoot) out.push(...allElements(e.shadowRoot));
  }
  return out;
};

(window as unknown as { __media: unknown }).__media = {
  pointer(visible: boolean) {
    pointerEl.classList.toggle('on', visible);
  },
  /** For stills: let finite animations and transitions finish, park the endless ones at their start. */
  async settle() {
    // A paused finite animation never finishes: give up after about 3 s rather than hang the run.
    const work = (async () => {
      for (let round = 0; round < 4; round++) {
        const list = allElements().flatMap((e) => e.getAnimations());
        const finite = list.filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime as number));
        await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
        for (const a of list) {
          if (!finite.includes(a)) {
            a.pause();
            a.currentTime = 0;
          }
        }
      }
    })();
    await Promise.race([work, new Promise((res) => setTimeout(res, 3000))]);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  },
};

async function ready() {
  await SCENES[scene]?.({ stage: root, harness });
  await document.fonts.ready;
  for (const e of allElements()) {
    const u = (e as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
    if (u) await u;
  }
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  (window as unknown as { __mediaReady: boolean }).__mediaReady = true;
}
void ready();
