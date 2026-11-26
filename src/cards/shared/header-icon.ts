import { css, html, nothing, svg, unsafeCSS, type CSSResult, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { ICONS, UNAVAILABLE_POWER_OPACITY } from '@decibel95/liquid-core';

/** How the header device icon is drawn: on, open, opening and closing use the entity colour (plan 2.8). */
export type HeaderIconState = 'active' | 'inactive' | 'unavailable';

/** The tile icon (the power button of the tile): 22 px at stroke 1.9. */
const SIZE = 22;
const STROKE = 1.9;

/**
 * The bare, non-interactive device icon left of a big card's titles (plan 2.8, Q10-i): a span with the class `hicon`,
 * `aria-hidden`, not focusable. `active` draws `colour` (the entity colour of the light, or the toned fan_only neutral
 * of a cover or fan; without one, the foreground), `inactive` the quiet `--lc-fg3` (off, closed), `unavailable`
 * `--lc-fg3` at the unavailable power opacity (class `un`). Put it before `.titles` in the header.
 */
export function renderHeaderIcon(glyph: keyof typeof ICONS, state: HeaderIconState, colour?: string): TemplateResult | typeof nothing {
  const path = ICONS[glyph];
  if (!path) return nothing;
  const color = state === 'active' ? (colour ?? 'var(--lc-fg)') : 'var(--lc-fg3)';
  return html`<span class="hicon ${state === 'unavailable' ? 'un' : ''}" aria-hidden="true" style=${styleMap({ color })}
    >${svg`<svg class="i" width=${SIZE} height=${SIZE} viewBox="0 0 24 24" stroke-width=${STROKE} aria-hidden="true"><path d=${path}></path></svg>`}</span
  >`;
}

/** The `.hicon` rules, shared by the light, cover and fan cards; every value is a core constant. */
export const headerIconStyles: CSSResult = css`
  .hicon {
    display: flex;
    flex: none;
  }
  .hicon.un {
    opacity: ${unsafeCSS(UNAVAILABLE_POWER_OPACITY)};
  }
  .hicon + .titles {
    flex: 1;
  }
`;
