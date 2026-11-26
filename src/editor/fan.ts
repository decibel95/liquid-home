import { html, type TemplateResult } from 'lit';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { fanView } from '../fans';
import { normalizeConfig, pruneConfig, type NormalizedFanConfig } from '../cards/fan/config';
import { LiquidHomeBigCardEditor } from './big';

/** Fan card editor: Setup (entity, name), Controls (preset chip, write hold) and Look tabs, as the light card editor. */
export class LiquidHomeFanCardEditor extends LiquidHomeBigCardEditor<NormalizedFanConfig> {
  protected readonly _card: CardKey = 'fan';
  protected readonly _domain = 'fan';

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: NormalizedFanConfig) {
    return pruneConfig(c);
  }

  /** The preset chip (as the light card's effects switch) and the write hold. */
  protected _controls(cfg: NormalizedFanConfig): TemplateResult {
    const s = this.hass!.states[cfg.entity];
    const v = s ? fanView(s) : undefined;
    // -1: no state to read (an entity not chosen yet), so nothing is said about the presets.
    const presets = v ? (v.hasPresets ? v.presets.length : 0) : -1;
    return html`<div class="look">
      ${this._switch(
        this._t('editor.presets'),
        // As the light card's effects: a control the fan lacks shows off (and disabled), whatever the config says.
        cfg.controls.presets && presets !== 0,
        () => this._fire((c) => ({ ...c, controls: { ...c.controls, presets: !c.controls.presets } })),
        presets === 0 ? this._t('editor.presetsNone') : presets > 0 ? this._t('editor.presetCount', { n: presets }) : undefined,
        presets === 0,
      )}
      ${this._hold(cfg.write_hold)}
    </div>`;
  }
}
