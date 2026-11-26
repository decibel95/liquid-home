import type { HomeAssistant } from '@decibel95/liquid-core';
import { COVER_FIXTURES, type CoverState } from '../../covers/fixtures';
import { FAN_FIXTURES, type FanState } from '../../fans/fixtures';
import type { Call } from './helpers';

type State = CoverState | FanState;

const ts = '2026-11-26T12:00:00+00:00';
const make = (entity_id: string, state: string, attributes: Record<string, unknown>): State =>
  ({ entity_id, state, attributes, last_changed: ts, last_updated: ts, context: { id: entity_id, parent_id: null, user_id: null } }) as unknown as State;

/**
 * Derived states the cover and fan fixture sets do not have, for the tile and badge rules of plan 2.6 (labelled, as
 * the fixture files label theirs): the D-15 covers (no OPEN and CLOSE pair, a tilt-only cover without CLOSE_TILT), a
 * position cover moving with STOP and without OPEN and CLOSE, a fan without TURN_ON and TURN_OFF, a fan off without
 * TURN_ON, and long names for the 390 px check.
 */
export const EXTRA = {
  /** D-15: SET_POSITION only (4), still. The icon is a disabled Stop; the steps work. */
  positionOnly: () => make('cover.position_only', 'open', { friendly_name: 'Position Only', supported_features: 4, current_position: 50 }),
  /** D-15: SET_POSITION and STOP (12), opening. The icon is an enabled Stop. */
  positionStopOpening: () => make('cover.position_stop', 'opening', { friendly_name: 'Position Stop', supported_features: 12, current_position: 40 }),
  /** D-15: OPEN and STOP (9), a toggle cover without CLOSE, closed. Disabled Stop, steps hidden. */
  openOnly: () => make('cover.open_only', 'closed', { friendly_name: 'Open Only', supported_features: 9 }),
  /** D-15: tilt-only with OPEN_TILT and SET_TILT_POSITION (144), no CLOSE_TILT. Disabled Stop, tilt steps. */
  tiltOpenOnly: () => make('cover.tilt_open_only', 'open', { friendly_name: 'Tilt Open Only', supported_features: 144, current_tilt_position: 30 }),
  /** A long cover name (badge 390 px). */
  coverLong: () => make('cover.long_badge', 'open', { friendly_name: 'Upstairs Guest Bathroom Skylight Window Blind Left', supported_features: 15, current_position: 70 }),
  /** A fan with SET_SPEED only (1), on at 50: no TURN bits, the icon is not a button (P2-CHO-8). */
  noTurn: () => make('fan.no_turn', 'on', { friendly_name: 'No Turn Fan', supported_features: 1, percentage_step: 1, percentage: 50 }),
  /** SET_SPEED and TURN_OFF (17), off: power disabled while off without TURN_ON (P2-CHO-1), drawn at 0.3. */
  offNoTurnOn: () => make('fan.off_no_turn_on', 'off', { friendly_name: 'Off No Turn On', supported_features: 17, percentage_step: 1, percentage: 0 }),
  /** A long fan name (badge 390 px). */
  fanLong: () => make('fan.long_badge', 'on', { friendly_name: 'Upstairs Guest Bedroom Ceiling Fan With A Long Name', supported_features: 55, percentage_step: 100 / 3, percentage: 67 }),
};

export interface DomainHass {
  hass: HomeAssistant;
  states: Record<string, State>;
  calls: Call[];
  /** A new hass object with `patch` applied to one state, as HA pushes it. */
  update(id: string, patch: { state?: string; attributes?: Record<string, unknown> }): HomeAssistant;
}

/** A fake hass over the cover and fan fixtures plus EXTRA. Calls are recorded and resolve at once; nothing changes state by itself. */
export function domainHass(opts: { darkMode?: boolean; language?: string } = {}): DomainHass {
  const states: Record<string, State> = {};
  for (const m of [...Object.values(COVER_FIXTURES), ...Object.values(FAN_FIXTURES), ...Object.values(EXTRA)]) {
    const s = (m as () => State)();
    states[s.entity_id] = s;
  }
  const calls: Call[] = [];
  const language = opts.language ?? 'en';
  const build = (): HomeAssistant =>
    ({
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      config: { unit_system: { temperature: '°C' } },
      language,
      locale: { language, number_format: 'language' },
      themes: { darkMode: opts.darkMode ?? true },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        calls.push({ domain, service, data });
      },
    }) as unknown as HomeAssistant;
  const api: DomainHass = {
    hass: build(),
    states,
    calls,
    update(id, patch) {
      const s = states[id];
      states[id] = { ...s, ...(patch.state ? { state: patch.state } : {}), attributes: { ...s.attributes, ...(patch.attributes ?? {}) } } as State;
      api.hass = build();
      return api.hass;
    },
  };
  return api;
}
