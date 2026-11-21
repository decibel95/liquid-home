import { LitElement, html } from 'lit';
import type { HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../../src/const';

/**
 * Test stand-in for the light card (P11 builds the real one on another branch): the Lovelace surface the sheet uses
 * (setConfig, hass, updateComplete) and the header slot the sheet's Close button goes into.
 */
export class StubLightCard extends LitElement {
  static override properties = { hass: { attribute: false } };
  hass?: HomeAssistant;
  config?: Record<string, any>;
  configs: Record<string, any>[] = [];
  /** The pill mode the sheet asked for before the first config (the real card's setPillMode). */
  mode?: string;
  setPillMode(mode: string) {
    this.mode = mode;
  }
  setConfig(c: Record<string, any>) {
    this.config = c;
    this.configs.push(c);
  }
  protected override render() {
    return html`<header><slot name="header-action"></slot></header>`;
  }
}

export function defineStubLightCard(): void {
  if (!customElements.get(TAGS.light)) customElements.define(TAGS.light, StubLightCard);
}
