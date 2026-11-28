import { html, nothing, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { isGroup } from '../lights';
import { DEFAULT_DOMAINS, ROOM_DOMAINS, normalizeConfig, pruneConfig, roomDomains, type RoomConfig, type RoomDomain, type RoomSource } from '../cards/room/config';
import { domainOf, firstAreaWithLights, roomMembers, roomTitle } from '../cards/room/members';
import { LiquidHomeEditor } from './base';

/** The domain labels of the multi-select, in display order. */
const DOMAIN_LABELS: Record<RoomDomain, string> = { light: 'editor.lights', cover: 'editor.covers', fan: 'editor.fans', media_player: 'editor.mediaPlayers' };
/** The add input's example id per first domain. */
const EXAMPLE: Record<RoomDomain, string> = { light: 'light.kitchen', cover: 'cover.living_room_window', fan: 'fan.living_room_fan', media_player: 'media_player.kitchen' };

/**
 * Room editor, as the Liquid Climate cluster editor: title, the domains the room shows (lights, covers, fans, media
 * players), where its entities come from (one area, with entities to leave out, or an ordered list with optional
 * names), the power entity (lights only) and the look. The editor always writes `source`; `domains` only when it is not lights only.
 */
export class LiquidHomeRoomEditor extends LiquidHomeEditor<RoomConfig> {
  protected readonly _card: CardKey = 'room';
  /** The area before a switch to `list`, so switching back returns to it. */
  private _lastArea?: string;
  /** The lights left out of that area, restored with it. */
  private _lastExclude?: string[];
  @state() private _powerInvalid = false;

  override setConfig(raw: RawConfig): void {
    super.setConfig(raw);
    this._powerInvalid = false;
  }

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: RoomConfig) {
    return pruneConfig(c);
  }

  private _setSource(to: RoomSource) {
    const cfg = this._config!;
    if (to === cfg.source) return;
    this._powerInvalid = false;
    if (to === 'list') {
      this._lastArea = cfg.area;
      this._lastExclude = cfg.exclude;
      const entities = roomMembers(this.hass!, cfg).map((m) => m.entity);
      this._fire({ source: 'list', entities, area: undefined, exclude: [] });
    } else {
      this._fire({
        source: 'area',
        entities: undefined,
        area: this._lastArea ?? firstAreaWithLights(this.hass),
        exclude: this._lastExclude ?? [],
      });
    }
  }

  /** The entity id of a raw list item (a string, or an object with `entity`); empty for anything else. */
  private _idOf(item: unknown): string {
    if (typeof item === 'string') return item;
    const id = (item as { entity?: unknown } | null)?.entity;
    return item && typeof item === 'object' && typeof id === 'string' ? id : '';
  }

  /** An id of one of these domains that exists in Home Assistant. */
  private _isKnown(id: string, domains: readonly RoomDomain[]): boolean {
    return domains.includes(domainOf(id)!) && !!this.hass?.states[id];
  }

  /** The room's domains, lights only unless set. */
  private _domains(cfg: RoomConfig): RoomDomain[] {
    return roomDomains(cfg.domains);
  }

  /** Lights only (the 0.2 room): the editor keeps its light wording. */
  private _lightsOnly(cfg: RoomConfig): boolean {
    return this._domains(cfg).join() === DEFAULT_DOMAINS.join();
  }

  /** The text key for a lights-only room, or its domain-neutral twin (`<key>Any`, or the given one). */
  private _k(cfg: RoomConfig, key: string, any = `${key}Any`): string {
    return `editor.${this._lightsOnly(cfg) ? key : any}`;
  }

  /**
   * The domains as a multiple choice on the core segmented control (aria-pressed), as the light card's modes; the last
   * one picked cannot be unpicked. A list room drops its entries of a domain that is unpicked (the card would refuse
   * them); an area room just stops showing them.
   */
  private _domainField(cfg: RoomConfig): TemplateResult {
    const label = this._t('editor.domains');
    const current = this._domains(cfg);
    return html`<div class="field">
      <span class="lbl">${label}</span>
      <div class="seg" role="group" aria-label=${label}>
        ${ROOM_DOMAINS.map((d) => {
          const on = current.includes(d);
          return html`<button
            aria-pressed=${on ? 'true' : 'false'}
            class=${on ? 'on' : ''}
            ?disabled=${on && current.length === 1}
            @click=${() => {
              const domains = ROOM_DOMAINS.filter((x) => (x === d ? !on : current.includes(x)));
              this._powerInvalid = false;
              // Entries that name no light, cover, fan or media player are kept as they are (the list keeps what it cannot show).
              const keep = (item: unknown) => {
                const dm = domainOf(this._idOf(item));
                return !dm || domains.includes(dm);
              };
              this._fire((c) => ({
                ...c,
                domains,
                ...(c.source === 'list' && Array.isArray(c.entities) ? { entities: c.entities.filter(keep) } : {}),
              }));
            }}
          >
            ${this._t(DOMAIN_LABELS[d])}
          </button>`;
        })}
      </div>
    </div>`;
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html``;
    const areas = Object.values(this.hass.areas ?? {}).sort((a, b) => a.name.localeCompare(b.name));
    const domains = this._domains(cfg);
    const ids = this._ids(domains);
    const lights = this._lights();
    const members = this._t(this._k(cfg, 'lights', 'entities'));
    return html`<div class="body">
      <label class="field">
        <span class="lbl">${this._t('editor.title')}</span>
        <input
          type="text"
          .value=${cfg.title ?? ''}
          placeholder=${roomTitle(this.hass, { ...cfg, title: undefined })}
          @change=${(e: Event) => this._fire({ title: (e.target as HTMLInputElement).value.trim() || undefined })}
        />
      </label>
      ${this._domainField(cfg)}
      ${this._seg<RoomSource>(
        this._t('editor.source'),
        cfg.source,
        [
          ['area', this._t('editor.sourceArea')],
          ['list', this._t('editor.sourceList')],
        ],
        (v) => this._setSource(v),
        this._help('source', 'editor.source'),
      )}
      ${
        cfg.source === 'area'
          ? html`<label class="field">
              <span class="lbl">${this._t('editor.area')}</span>
              ${
                areas.length
                  ? html`<select @change=${(e: Event) => {
                      this._powerInvalid = false;
                      this._fire({ area: (e.target as HTMLSelectElement).value, exclude: [] });
                    }}>
                      <option value="" disabled ?selected=${!areas.some((a) => a.area_id === cfg.area)}>${this._t('editor.chooseArea')}</option>
                      ${areas.map((a) => html`<option value=${a.area_id} ?selected=${a.area_id === cfg.area}>${a.name}</option>`)}
                    </select>`
                  : html`<span class="hint">${this._t('editor.noAreas')}</span>`
              }
            </label>`
          : nothing
      }
      ${
        cfg.source === 'area'
          ? html`<div class="field" role="group" aria-label=${members}>
              <span class="lbl">${members}</span>
              ${this._areaLights(cfg)}
              <span class="hint">${this._t(this._k(cfg, 'noteArea'))}</span>
            </div>`
          : this._listLights(cfg, ids, members)
      }
      ${domains.includes('light') ? this._power(cfg, lights) : nothing}
      ${this._head('look', 'editor.tabLook')} ${this._look(cfg.look)}
      <span class="hint">${this._t('editor.yamlHint')}</span>
    </div>`;
  }

  /** The header power entity: a light id input with the light groups first in its suggestions. Lights only. */
  private _power(cfg: RoomConfig, lights: string[]): TemplateResult {
    return html`<div class="field">
        <div class="lblrow">
          <span class="lbl" id="lh-power-label">${this._t('editor.powerEntity')}</span>${this._help('power-entity', 'editor.powerEntity')}
        </div>
        <input
          type="text"
          aria-labelledby="lh-power-label"
          list="lh-power-ids"
          .value=${cfg.power_entity ?? ''}
          placeholder="light.living_room_lights"
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            const id = input.value.trim();
            this._powerInvalid = !!id && !this._isKnown(id, ['light']);
            if (this._powerInvalid) input.value = cfg.power_entity ?? '';
            else this._fire({ power_entity: id || undefined });
          }}
        />
        <datalist id="lh-power-ids">
          ${[...lights.filter((id) => isGroup(this.hass!.states[id])), ...lights.filter((id) => !isGroup(this.hass!.states[id]))].map(
            (id) => html`<option value=${id}>${this._friendly(id)}</option>`,
          )}
        </datalist>
        <span class="hint">${this._t('editor.powerHint')}</span>
        ${this._powerInvalid ? html`<span class="hint" role="alert">${this._t('editor.powerInvalid')}</span>` : nothing}
      </div>`;
  }

  /** Every entity of the area of the room's domains, each with a switch: off means it is in `exclude`. */
  private _areaLights(cfg: RoomConfig): TemplateResult | TemplateResult[] {
    if (!cfg.area) return [];
    const all = roomMembers(this.hass!, { ...cfg, exclude: [] });
    if (!all.length) return html`<span class="hint">${this._t(this._k(cfg, 'noLights', 'noEntities'))}</span>`;
    const exclude = cfg.exclude ?? [];
    return all.map((m) => {
      const shown = !exclude.includes(m.entity);
      return this._switch(
        m.name,
        shown,
        () =>
          this._fire((c) => {
            const ex = c.exclude ?? [];
            return {
              ...c,
              exclude: shown ? [...ex, m.entity] : ex.filter((id) => id !== m.entity),
            };
          }),
        undefined,
        false,
        this._t('editor.showLight', { name: m.name }),
      );
    });
  }

  /**
   * The listed entities in order, each in its own group: its name override, then Up, Down and Remove on the core
   * segmented control. Below them the input that adds one of the room's domains, with every such entity not listed yet
   * as a suggestion.
   */
  private _listLights(cfg: RoomConfig, ids: string[], label: string): TemplateResult {
    const domains = this._domains(cfg);
    const raw: unknown[] = Array.isArray(cfg.entities) ? cfg.entities : [];
    // The rows are the items that name a light; the raw items (unknown keys, odd entries) are what gets saved.
    const rows = raw.map((item, at) => ({ item, at, entity: this._idOf(item) })).filter((r) => r.entity);
    const save = (next: unknown[]) => this._fire({ entities: next as RoomConfig['entities'] });
    const move = (k: number, to: number) => {
      const next = [...raw];
      [next[rows[k].at], next[rows[to].at]] = [next[rows[to].at], next[rows[k].at]];
      save(next);
    };
    // Saved as a plain id unless the entry has a name or other keys.
    const rename = (k: number, v: string) => {
      const { item, entity } = rows[k];
      const { name: _old, ...rest } = (item && typeof item === 'object' ? item : { entity }) as Record<string, unknown>;
      const entry = v ? { ...rest, name: v } : rest;
      const next = [...raw];
      next[rows[k].at] = Object.keys(entry).length === 1 ? entity : entry;
      save(next);
    };
    const lines = rows.map((r, k) => {
      const name = this._friendly(r.entity);
      const current = r.item && typeof r.item === 'object' ? (r.item as { name?: unknown }).name : undefined;
      return html`<div class="field" role="group" aria-label=${name}>
        <span class="lbl">${name}</span>
        <input
          type="text"
          .value=${typeof current === 'string' ? current : ''}
          placeholder=${name}
          aria-label=${this._t('editor.lightName', { name })}
          @change=${(ev: Event) => rename(k, (ev.target as HTMLInputElement).value.trim())}
        />
        <div class="seg">
          ${k > 0 ? html`<button aria-label=${this._t('editor.moveUp', { name })} @click=${() => move(k, k - 1)}>${this._t('editor.up')}</button>` : nothing}
          ${k < rows.length - 1
            ? html`<button aria-label=${this._t('editor.moveDown', { name })} @click=${() => move(k, k + 1)}>${this._t('editor.down')}</button>`
            : nothing}
          <button aria-label=${this._t('editor.removeLight', { name })} @click=${() => save(raw.filter((_, j) => j !== r.at))}>
            ${this._t('editor.remove')}
          </button>
        </div>
      </div>`;
    });
    // One display: contents wrapper (core's .look) keeps the body's spacing between the lights (and keeps happy-dom's
    // template markers in place, see core lookFields).
    return html`<div class="look">
      <span class="lbl">${label}</span>
      ${lines}
      <label class="field">
        <span class="lbl">${this._t(this._k(cfg, 'addLight', 'addEntity'))}</span>
        <input
          type="text"
          list="lh-room-ids"
          placeholder=${EXAMPLE[domains[0]]}
          @change=${(ev: Event) => {
            const input = ev.target as HTMLInputElement;
            const id = input.value.trim();
            input.value = '';
            if (this._isKnown(id, domains) && !rows.some((r) => r.entity === id)) save([...raw, id]);
          }}
        />
        <datalist id="lh-room-ids">
          ${ids.filter((id) => !rows.some((r) => r.entity === id)).map((id) => html`<option value=${id}>${this._friendly(id)}</option>`)}
        </datalist>
        <span class="hint">${this._t(this._k(cfg, 'noteList'))}</span>
      </label>
    </div>`;
  }
}
