import type { HomeAssistant } from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../src/const';
import { withRegistry } from './slots/room';
import type { SlotMount } from './slots/types';
import { COVER_FIXTURES } from '../test/covers/fixtures';
import { FAN_FIXTURES } from '../test/fans/fixtures';
import { MEDIA_FIXTURES } from '../test/cards/media/fixtures';

/** The covers, fans and media players the editor pickers offer (the fixture states, static), the real demo ones in the Living Room. */
const EXTRA = [...Object.values(COVER_FIXTURES), ...Object.values(FAN_FIXTURES), ...Object.values(MEDIA_FIXTURES)].map((make) => make());
const IN_ROOM = [
  'cover.hall_window',
  'cover.living_room_window',
  'fan.living_room_fan',
  'fan.lh_fixture_ten',
  'fan.lh_fixture_onoff',
  'media_player.living_room',
  'media_player.lounge_room',
];

/** The harness hass with the room registry plus the covers, fans and media players, so every editor can pick and list them. */
function withDomains(hass: HomeAssistant, ids: Record<string, string>): HomeAssistant {
  const h = withRegistry(hass, ids);
  const states = { ...h.states };
  for (const s of EXTRA) states[s.entity_id] = s as unknown as (typeof states)[string];
  const entities = { ...h.entities };
  for (const id of IN_ROOM) entities[id] = { entity_id: id, platform: 'demo', area_id: 'living_room' };
  return { ...h, states, entities };
}

/** Home Assistant's own editor theme variables (default light and dark theme), so the editors look as in the HA card editor. */
const HA_THEMES = {
  light: '--primary-color:#03a9f4;--text-primary-color:#fff;--primary-text-color:#212121;--secondary-text-color:#727272;--divider-color:rgba(0,0,0,.12);--card-background-color:#fff;background:#fff;color:#212121',
  dark: '--primary-color:#03a9f4;--text-primary-color:#fff;--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--divider-color:rgba(225,225,225,.12);--card-background-color:#1c1c1c;background:#1c1c1c;color:#e1e1e1',
};

type Editable = HTMLElement & { setConfig(c: Record<string, unknown>): void; hass?: HomeAssistant };

/** The saved config as YAML, the way the HA code editor shows it (small objects only: strings, numbers, booleans, lists, maps). */
function yaml(v: unknown, indent = ''): string {
  if (Array.isArray(v)) return v.map((x) => `\n${indent}- ${yaml(x, `${indent}  `).replace(/^\n\s*/, '')}`).join('');
  if (v && typeof v === 'object')
    return Object.entries(v)
      .map(([k, x]) => `\n${indent}${k}:${x && typeof x === 'object' ? yaml(x, `${indent}  `) : ` ${x}`}`)
      .join('');
  return String(v);
}

/**
 * The editor demo: per card its visual editor (in HA's light or dark editor theme), the card it configures and the
 * YAML the editor saves, updated on every config-changed. Nothing talks to Home Assistant.
 */
export const mount: SlotMount = ({ container, hass, ids, onHass }) => {
  const demos: [string, string, string, Record<string, unknown>, number][] = [
    ['Light card', TAGS.lightEditor, TAGS.light, { type: CARD_TYPES.light, entity: ids.colourTemp }, 360],
    ['Cover card', TAGS.coverEditor, TAGS.cover, { type: CARD_TYPES.cover, entity: 'cover.living_room_window' }, 360],
    ['Fan card', TAGS.fanEditor, TAGS.fan, { type: CARD_TYPES.fan, entity: 'fan.lh_fixture_ten' }, 360],
    ['Media card', TAGS.mediaEditor, TAGS.media, { type: CARD_TYPES.media, entity: 'media_player.lounge_room' }, 360],
    ['Tile', TAGS.tileEditor, TAGS.tile, { type: CARD_TYPES.tile, entity: ids.colourTemp }, 360],
    ['Badge', TAGS.badgeEditor, TAGS.badge, { type: CARD_TYPES.badge, entity: ids.colourTemp }, 360],
    ['Room card', TAGS.roomEditor, TAGS.room, { type: CARD_TYPES.room, source: 'area', area: 'living_room', power_entity: ids.group }, 560],
  ];
  const withAreas = (h: HomeAssistant) => withDomains(h, ids);
  const live: Editable[] = [];
  container.style.flexDirection = 'column';

  const theme = document.createElement('label');
  theme.className = 'lang';
  theme.innerHTML = 'Editor theme <select><option value="light">HA light</option><option value="dark">HA dark</option></select>';
  container.append(theme);
  const panels: HTMLElement[] = [];
  theme.querySelector('select')!.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value as keyof typeof HA_THEMES;
    for (const p of panels) p.style.cssText = `${p.dataset.base};${HA_THEMES[v]}`;
  });

  for (const [label, editorTag, cardTag, config, width] of demos) {
    const heading = document.createElement('p');
    heading.className = 'note';
    heading.textContent = `${label} editor`;
    const row = document.createElement('div');
    row.dataset.editor = editorTag;
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start';

    const panel = document.createElement('div');
    panel.className = 'editor-panel';
    panel.dataset.base = 'width:420px;max-width:100%;box-sizing:border-box;padding:8px 16px 16px;border-radius:12px;font:14px/1.4 Roboto, Noto Sans, sans-serif';
    panel.style.cssText = `${panel.dataset.base};${HA_THEMES.light}`;
    panels.push(panel);
    const editor = document.createElement(editorTag) as Editable;
    editor.hass = withAreas(hass);
    editor.setConfig(config);
    panel.append(editor);

    const side = document.createElement('div');
    side.style.cssText = `display:flex;flex-direction:column;gap:12px;width:${width}px;max-width:100%`;
    const card = document.createElement(cardTag) as Editable;
    card.setConfig(config);
    card.hass = withAreas(hass);
    const out = document.createElement('pre');
    out.style.cssText = 'margin:0;background:#11151c;border-radius:12px;padding:12px;font:12px/1.5 ui-monospace, Consolas, monospace;color:#cfd6e0';
    out.textContent = yaml(config).trim();
    editor.addEventListener('config-changed', (e) => {
      const next = (e as CustomEvent).detail.config as Record<string, unknown>;
      out.textContent = yaml(next).trim();
      try {
        card.setConfig(next);
      } catch (err) {
        out.textContent += `\n# card: ${(err as Error).message}`;
      }
    });
    side.append(card, out);
    row.append(panel, side);
    container.append(heading, row);
    live.push(editor, card);
  }
  onHass((next) => {
    const h = withAreas(next);
    for (const el of live) el.hass = h;
  });
};
