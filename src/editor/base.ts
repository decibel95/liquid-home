import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { editorStyles, helpLink, lookFields, segField, type HomeAssistant, type LookValues } from '@decibel95/liquid-core';
import { DOCS_URL, type CardKey } from '../const';
import { withLook, type LookConfig, type RawConfig } from '../config';
import { isLightEntity } from '../lights';
import { t } from '../i18n';
import type { TapAction } from '../cards/tile/config';

const TAP_LABELS: Record<TapAction, string> = {
  sheet: 'editor.tapCard',
  'more-info': 'editor.tapMoreInfo',
  none: 'editor.tapNothing',
};

/**
 * What the four Liquid Home editors share, in the Liquid Climate editor style: the editor owns the config, the
 * liquid-core helpers (segField, lookFields, helpLink, editorStyles) draw the fields. Every change is saved as the
 * card's pruned config (only non-default options; type, entity and config_version always kept).
 */
export abstract class LiquidHomeEditor<C extends RawConfig> extends LitElement {
  static override styles = editorStyles;

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected _config?: C;
  /** The docs page and the prefix of its anchors. */
  protected abstract readonly _card: CardKey;

  /** The card's own normalizeConfig (migrates, fills every default, keeps unknown keys). */
  protected abstract _normalize(raw: RawConfig): C;
  /** The card's own pruneConfig. */
  protected abstract _prune(config: C): RawConfig;

  setConfig(raw: RawConfig): void {
    this._config = this._normalize(raw ?? {});
  }

  protected _t = (key: string, vars?: Record<string, string | number>): string => t(this.hass, key, vars);

  protected _fire(patch: Partial<C> | ((c: C) => C)): void {
    if (!this._config) return;
    const next = typeof patch === 'function' ? patch(this._config) : { ...this._config, ...patch };
    this._config = next;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: this._prune(next) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** A (?) link to the docs section `<card>-<slug>`; its name says which section. */
  protected _help(slug: string, labelKey: string): TemplateResult {
    return helpLink(DOCS_URL, this._card, slug, this._t(labelKey), this._t);
  }

  /** Section heading with its help link, for the editors without tabs. */
  protected _head(slug: string, labelKey: string): TemplateResult {
    return html`<div class="lblrow"><span class="lbl">${this._t(labelKey)}</span>${this._help(slug, labelKey)}</div>`;
  }

  /**
   * A segmented single choice. Without help this is core segField; with help the label row carries the (?) link as
   * Liquid Climate's _seg does (core segField has no help slot yet: core change request).
   */
  protected _seg<V extends string>(
    label: string,
    value: V,
    options: readonly (readonly [V, string])[],
    pick: (v: V) => void,
    help?: TemplateResult,
  ): TemplateResult {
    if (!help) return segField(label, value, options, pick);
    return html`<div class="field">
      <div class="lblrow"><span class="lbl">${label}</span>${help}</div>
      <div class="seg" role="radiogroup" aria-label=${label}>
        ${options.map(
          ([v, l]) =>
            html`<button role="radio" aria-checked=${value === v ? 'true' : 'false'} class=${value === v ? 'on' : ''} @click=${() => pick(v)}>${l}</button>`,
        )}
      </div>
    </div>`;
  }

  /** A switch row: the label (and an optional hint under it) with the core switch on the right; `aria` names the switch. */
  protected _switch(label: string, on: boolean, toggle: () => void, hint?: string, disabled = false, aria = label): TemplateResult {
    return html`<div class="lblrow">
      <span>${label}${hint ? html`<br /><span class="hint">${hint}</span>` : nothing}</span>
      <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${aria} ?disabled=${disabled} @click=${toggle}>
        <span></span>
      </button>
    </div>`;
  }

  /** Every light entity id, sorted. */
  protected _lights(): string[] {
    return Object.keys(this.hass?.states ?? {})
      .filter((id) => isLightEntity(id))
      .sort();
  }

  protected _friendly(id: string): string {
    return (this.hass?.states[id]?.attributes.friendly_name as string | undefined) || id;
  }

  /** The light picker: a native select over the light entities, as the Liquid Climate entity field. */
  protected _entity(entity: string): TemplateResult {
    const ids = this._lights();
    return html`<label class="field">
      <span class="lbl">${this._t('editor.entity')}</span>
      <select @change=${(e: Event) => this._fire({ entity: (e.target as HTMLSelectElement).value } as RawConfig as Partial<C>)}>
        ${ids.includes(entity) ? nothing : html`<option value="" disabled selected>${entity || this._t('editor.chooseLight')}</option>`}
        ${ids.map((id) => html`<option value=${id} ?selected=${id === entity}>${this._friendly(id)} (${id})</option>`)}
      </select>
    </label>`;
  }

  protected _name(name: string | undefined, entity: string): TemplateResult {
    return html`<label class="field">
      <span class="lbl">${this._t('editor.name')}</span>
      <input
        type="text"
        .value=${name ?? ''}
        placeholder=${entity ? this._friendly(entity) : ''}
        @change=${(e: Event) => this._fire({ name: (e.target as HTMLInputElement).value.trim() || undefined } as RawConfig as Partial<C>)}
      />
      <span class="hint">${this._t('editor.nameHint')}</span>
    </label>`;
  }

  /** What a tap does, in the card's own order (its default first). */
  protected _tap(labelKey: string, order: readonly TapAction[], value: TapAction): TemplateResult {
    return this._seg<TapAction>(
      this._t(labelKey),
      value,
      order.map((v) => [v, this._t(TAP_LABELS[v])] as const),
      (tap_action) => this._fire({ tap_action } as RawConfig as Partial<C>),
      this._help('tap-action', labelKey),
    );
  }

  /** How long a sent value is shown while HA has not reported it back (Liquid Climate's choices). */
  protected _hold(value: number): TemplateResult {
    return this._seg<string>(
      this._t('editor.writeHold'),
      String(value),
      ['10', '30', '60'].map((n) => [n, this._t('editor.seconds', { n })] as const),
      (v) => this._fire({ write_hold: Number(v) } as RawConfig as Partial<C>),
      this._help('write-hold', 'editor.writeHold'),
    );
  }

  /** The core look section, without tint (Liquid Home has no look.tint). */
  protected _look(look: LookConfig | undefined): TemplateResult {
    return lookFields(withLook(look) as LookValues, this._t, (patch) =>
      this._fire((c) => ({
        ...c,
        look: { ...withLook(c.look as LookConfig | undefined), ...patch },
      })),
    );
  }
}
