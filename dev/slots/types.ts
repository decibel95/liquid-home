import type { HomeAssistant } from '@decibel95/liquid-core';
import type { LightFixtureName } from '../../test/fixtures/lights';

/** What the harness hands to a card slot. A card piece fills only its own dev/slots/<card>.ts. */
export interface SlotContext {
  /** Empty element inside the slot's section of the harness. */
  container: HTMLElement;
  /** The current fake hass (also pushed through `onHass`). */
  hass: HomeAssistant;
  /** Fixture name to entity id, e.g. ids.dimmed === 'light.kitchen_lights_dimmed'. */
  ids: Record<LightFixtureName, string>;
  /** Called with a new hass object after every state change; set `hass` on your cards here. */
  onHass(listener: (hass: HomeAssistant) => void): void;
  /** Append a line to the harness log. */
  log(line: string): void;
}

export type SlotMount = (ctx: SlotContext) => void;
