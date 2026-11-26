import type { HassEntity } from '@decibel95/liquid-core';

/**
 * Cover states for the cover tests and the dev harness slot. The first five are the HA demo covers as the test HA
 * reports them (facts section 4: features 11, 15, 511, 3, 240); the rest are derived (labelled), as the gate 1 canvas
 * derives them: Hall Window at 0 and 100, moving states, an open garage, unavailable, a long name, a 255 and a
 * 1024-bit entity, assumed_state.
 */
export type CoverState = HassEntity;

const cover = (id: string, state: string, attributes: Record<string, unknown>): CoverState =>
  ({ entity_id: `cover.${id}`, state, attributes, last_changed: '', last_updated: '', context: { id: '', parent_id: null, user_id: null } }) as unknown as CoverState;

export const COVER_FIXTURES = {
  // Real demo covers.
  kitchen: () => cover('kitchen_window', 'closed', { friendly_name: 'Kitchen Window', supported_features: 11 }),
  hall: () => cover('hall_window', 'open', { friendly_name: 'Hall Window', supported_features: 15, current_position: 10 }),
  living: () => cover('living_room_window', 'open', { friendly_name: 'Living Room Window', supported_features: 511, current_position: 70, current_tilt_position: 50 }),
  garage: () => cover('garage_door', 'closed', { friendly_name: 'Garage Door', supported_features: 3, device_class: 'garage' }),
  pergola: () => cover('pergola_roof', 'closed', { friendly_name: 'Pergola Roof', supported_features: 240, current_tilt_position: 60 }),
  // Derived.
  hallOpen: () => cover('hall_window_open', 'open', { friendly_name: 'Hall Window', supported_features: 15, current_position: 100 }),
  hallClosed: () => cover('hall_window_closed', 'closed', { friendly_name: 'Hall Window', supported_features: 15, current_position: 0 }),
  hallOpening: () => cover('hall_window_opening', 'opening', { friendly_name: 'Hall Window', supported_features: 15, current_position: 40 }),
  hallClosing: () => cover('hall_window_closing', 'closing', { friendly_name: 'Hall Window', supported_features: 15, current_position: 60 }),
  kitchenOpen: () => cover('kitchen_window_open', 'open', { friendly_name: 'Kitchen Window', supported_features: 11 }),
  kitchenOpening: () => cover('kitchen_window_opening', 'opening', { friendly_name: 'Kitchen Window', supported_features: 11 }),
  kitchenClosing: () => cover('kitchen_window_closing', 'closing', { friendly_name: 'Kitchen Window', supported_features: 11 }),
  garageOpen: () => cover('garage_door_open', 'open', { friendly_name: 'Garage Door', supported_features: 3, device_class: 'garage' }),
  garageOpening: () => cover('garage_door_opening', 'opening', { friendly_name: 'Garage Door', supported_features: 3, device_class: 'garage' }),
  unavailable: () => cover('hall_window_unavailable', 'unavailable', { friendly_name: 'Hall Window', supported_features: 15 }),
  longName: () => cover('long_name_window', 'open', { friendly_name: 'Upstairs Guest Bathroom Skylight Window Blind', supported_features: 15, current_position: 40 }),
  full: () => cover('full_cover', 'open', { friendly_name: 'Full Cover', supported_features: 255, current_position: 30, current_tilt_position: 40 }),
  unknownBits: () => cover('unknown_bits', 'closed', { friendly_name: 'Unknown Bits', supported_features: 1024 }),
  assumed: () => cover('assumed_window', 'open', { friendly_name: 'Assumed Window', supported_features: 15, current_position: 100, assumed_state: true }),
} satisfies Record<string, () => CoverState>;

export type CoverFixtureName = keyof typeof COVER_FIXTURES;

export const coverIds = Object.fromEntries(Object.entries(COVER_FIXTURES).map(([n, make]) => [n, make().entity_id])) as Record<CoverFixtureName, string>;
