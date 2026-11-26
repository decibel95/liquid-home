import { html, type TemplateResult } from 'lit';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { LIGHT_MODES, lightView, modesFor, type LightMode } from '../lights';
import { normalizeConfig, pruneConfig, type NormalizedLightConfig } from '../cards/light/config';
import { LiquidHomeBigCardEditor } from './big';

/** Light card editor: Setup (entity, name), Controls (modes, effects, write hold) and Look tabs, as the Liquid Climate dial editor. */
export class LiquidHomeLightCardEditor extends LiquidHomeBigCardEditor<NormalizedLightConfig> {
  protected readonly _card: CardKey = 'light';
  protected readonly _domain = 'light';

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: NormalizedLightConfig) {
    return pruneConfig(c);
  }

  /** Modes on the card, the effect chip and the write hold. */
  protected _controls(cfg: NormalizedLightConfig): TemplateResult {
    const s = this.hass!.states[cfg.entity];
    const v = s ? lightView(s) : undefined;
    const allowed = v ? modesFor(v) : [...LIGHT_MODES];
    const current = v ? modesFor(v, cfg.controls.modes) : (cfg.controls.modes ?? allowed);
    const effects = v ? v.effectList.length : -1;
    // One display: contents wrapper (core's .look, the only one core has) keeps the body's spacing.
    return html`<div class="look">
      ${allowed.length ? this._modes(allowed, current) : html`<span class="hint">${this._t('editor.modesOnOff')}</span>`}
      ${this._switch(
        this._t('editor.effects'),
        // As Liquid Climate: a control the light lacks shows off (and disabled), whatever the config says.
        cfg.controls.effects && effects !== 0,
        () =>
          this._fire((c) => ({
            ...c,
            controls: { ...c.controls, effects: !c.controls.effects },
          })),
        effects === 0 ? this._t('editor.notSupported') : effects > 0 ? this._t('editor.effectCount', { n: effects }) : undefined,
        effects === 0,
      )}
      ${this._hold(cfg.write_hold)}
    </div>`;
  }

  /** Multiple choice on the core segmented control (aria-pressed). All supported picked is the default: nothing is written. */
  private _modes(allowed: LightMode[], current: readonly LightMode[]): TemplateResult {
    const label = this._t('editor.modesOnCard');
    return html`<div class="field">
      <span class="lbl">${label}</span>
      <div class="seg" role="group" aria-label=${label}>
        ${allowed.map((m) => {
          const on = current.includes(m);
          const last = on && allowed.filter((x) => current.includes(x)).length === 1;
          return html`<button
            aria-pressed=${on ? 'true' : 'false'}
            class=${on ? 'on' : ''}
            ?disabled=${last}
            @click=${() => {
              const next = allowed.filter((x) => (x === m ? !on : current.includes(x)));
              const modes = next.length === allowed.length ? undefined : next;
              this._fire((c) => ({ ...c, controls: { ...c.controls, modes } }));
            }}
          >
            ${this._t(`light.mode.${m}`)}
          </button>`;
        })}
      </div>
      <span class="hint">${this._t('editor.modesHint')}</span>
    </div>`;
  }
}
