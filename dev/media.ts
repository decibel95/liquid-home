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
import { withRegistry } from './slots/room';

const params = new URLSearchParams(location.search);
const dark = params.get('theme') === 'dark';
const lang = params.get('lang') ?? 'en';
const scene = params.get('scene') ?? '';

export interface SceneContext {
  stage: HTMLElement;
  harness: Harness;
}
export type Scene = (ctx: SceneContext) => void | Promise<void>;

type CardEl = HTMLElement & { hass?: unknown; setConfig(c: unknown): void };

/** A card element with its config and the harness hass, glass forced to the theme of the page (the fake hass has no dark mode). */
function card(ctx: SceneContext, tag: string, config: Record<string, unknown>, withAreas = false): CardEl {
  const el = document.createElement(tag) as CardEl;
  el.setConfig({ ...config, look: { glass: dark ? 'dark' : 'light', ...(config.look as object | undefined) } });
  el.hass = withAreas ? withRegistry(ctx.harness.hass, ctx.harness.ids) : ctx.harness.hass;
  ctx.harness.onHass((h) => (el.hass = withAreas ? withRegistry(h, ctx.harness.ids) : h));
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

  // The tile: on in colour, on in white, off, unavailable.
  tile(ctx) {
    const { ids } = ctx.harness;
    const col = box('pad col', 520 + 88);
    for (const id of [ids.dimmed, ids.colourTemp, ids.off, ids.unavailable]) col.append(card(ctx, TAGS.tile, { type: CARD_TYPES.tile, entity: id }));
    ctx.stage.append(col);
  },

  // The badge: pill and icon only, on, off, unavailable.
  badge(ctx) {
    const { ids } = ctx.harness;
    const pad = box('pad col');
    for (const iconOnly of [false, true]) {
      const row = box('row');
      for (const id of [ids.dimmed, ids.colourTemp, ids.off, ids.unavailable]) {
        row.append(card(ctx, TAGS.badge, { type: CARD_TYPES.badge, entity: id, ...(iconOnly ? { icon_only: true } : {}) }));
      }
      pad.append(row);
    }
    ctx.stage.append(pad);
  },

  // The room card: two lights on and one off, with the group (on) as power entity, so the header reads "2 of 3 on".
  room(ctx) {
    const { ids } = ctx.harness;
    const pad = box('pad', 640 + 88);
    pad.append(
      card(
        ctx,
        TAGS.room,
        { type: CARD_TYPES.room, title: 'Living Room', source: 'list', power_entity: ids.group, entities: [ids.colourTemp, ids.dimmed, ids.off] },
        true,
      ),
    );
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
