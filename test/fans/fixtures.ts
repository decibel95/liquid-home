/**
 * Fan fixtures for unit tests and the dev harness slot. REAL: the HA demo fans and the test HA fixtures as listed in
 * the 0.3 pre-flight facts (section 4): features, percentage_step, preset_modes. DERIVED: the states the demo lacks
 * (on at 33, 67 and 100 %, preset Auto, oscillating, reverse, unavailable, a long name). Every state is a fresh object.
 */

export interface FanState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: { id: string; parent_id: null; user_id: null };
}

const ts = '2026-11-26T12:00:00+00:00';
const PRESETS = ['auto', 'smart', 'sleep', 'on'];
const STEP_3 = 100 / 3;

const build = (entity_id: string, state: string, attributes: Record<string, unknown>): FanState => ({
  entity_id,
  state,
  attributes: { oscillating: false, direction: 'forward', percentage: null, percentage_step: 1, preset_mode: null, preset_modes: null, ...attributes },
  last_changed: ts,
  last_updated: ts,
  context: { id: entity_id, parent_id: null, user_id: null },
});

/** fan.living_room_fan (real): features 55, 3 speeds (step 33.33), off. Presets are listed but bit 8 is not set. */
const living = (suffix: string, state: string, a: Record<string, unknown> = {}) =>
  build(`fan.living_room_fan${suffix}`, state, { friendly_name: 'Living Room Fan', supported_features: 55, percentage_step: STEP_3, preset_modes: PRESETS, percentage: 0, ...a });

/** The derived features-63 Living Room Fan (adds PRESET_MODE). */
const living63 = (suffix: string, state: string, a: Record<string, unknown> = {}) => living(suffix, state, { supported_features: 63, ...a });

export const FAN_FIXTURES = {
  /** Real: off, 3 speeds. */
  off: () => living('', 'off'),
  /** Derived: on at the first step (HA demo floor: 33). */
  pct33: () => living('_33', 'on', { percentage: 33 }),
  /** Derived: on at 67 (the demo's turn_on default, not a step value: 66 is). */
  pct67: () => living('_67', 'on', { percentage: 67 }),
  /** Derived: full speed. */
  pct100: () => living('_100', 'on', { percentage: 100 }),
  /** Derived (features 63): preset Auto, percentage null under a preset (as HA's demo). */
  presetAuto: () => living63('_auto', 'on', { percentage: null, preset_mode: 'auto' }),
  /** Derived (features 63): off, with the chip offering presets. */
  presetsOff: () => living63('_presets', 'off'),
  /** Derived: on at 33, oscillating. */
  oscillating: () => living('_osc', 'on', { percentage: 33, oscillating: true }),
  /** Derived: on at 67, reverse. */
  reverse: () => living('_rev', 'on', { percentage: 67, direction: 'reverse' }),
  /** Real fan.preset_only_limited_fan: features 56, off. */
  presetOnly: () => build('fan.preset_only_limited_fan', 'off', { friendly_name: 'Preset Only Limited Fan', supported_features: 56, preset_modes: PRESETS, oscillating: undefined, direction: undefined }),
  /** Derived: the same fan on with preset Auto. */
  presetOnlyAuto: () =>
    build('fan.preset_only_limited_fan_auto', 'on', { friendly_name: 'Preset Only Limited Fan', supported_features: 56, preset_modes: PRESETS, preset_mode: 'auto', oscillating: undefined, direction: undefined }),
  /** Test HA fan.lh_fixture_onoff (features 48, "Bedroom Fan"), on. */
  onoff: () => build('fan.lh_fixture_onoff', 'on', { friendly_name: 'Bedroom Fan', supported_features: 48, oscillating: undefined, direction: undefined }),
  /** Derived: the on/off-only fan off. */
  onoffOff: () => build('fan.lh_fixture_onoff_off', 'off', { friendly_name: 'Bedroom Fan', supported_features: 48, oscillating: undefined, direction: undefined }),
  /** Test HA fan.lh_fixture_ten: features 57, 10 speeds, presets auto and sleep, on at 40. */
  ten: () => build('fan.lh_fixture_ten', 'on', { friendly_name: 'Ten Speed Fan', supported_features: 57, percentage_step: 10, percentage: 40, preset_modes: ['auto', 'sleep'], oscillating: undefined, direction: undefined }),
  /** Real fan.percentage_full_fan: features 55, 100 speeds, on at 40 (derived state). */
  full: () => build('fan.percentage_full_fan', 'on', { friendly_name: 'Percentage Full Fan', supported_features: 55, percentage: 40 }),
  /** Real fan.ceiling_fan: features 49 (speed, on, off), off. */
  ceiling: () => build('fan.ceiling_fan', 'off', { friendly_name: 'Ceiling Fan', supported_features: 49, percentage: 0, oscillating: undefined, direction: undefined }),
  /** Derived: unavailable (HA keeps the capability attributes). */
  unavailable: () => living63('_unavailable', 'unavailable', { percentage: null }),
  /** Derived: a long name. */
  longName: () => living('_long', 'on', { friendly_name: 'Upstairs Guest Bedroom Ceiling Fan With A Long Name', percentage: 67, oscillating: true }),
};

export type FanFixtureName = keyof typeof FAN_FIXTURES;

export const fanIds = Object.fromEntries(Object.entries(FAN_FIXTURES).map(([n, make]) => [n, make().entity_id])) as Record<FanFixtureName, string>;

/**
 * What HA (the demo fan, demo/fan.py) does with a fan call, applied to a state in place: set_percentage keeps the
 * value and clears a preset, turn_on without arguments gives 67 on a speed fan, turn_on with a preset sets the preset
 * only, set_preset_mode clears the percentage. Calls without their feature bit are ignored (as HA refuses them).
 */
export function applyFanCall(s: FanState, service: string, data: Record<string, unknown>): FanState {
  const f = Number(s.attributes.supported_features) || 0;
  const a = { ...s.attributes };
  let state = s.state;
  const setPct = (p: number) => {
    a.preset_mode = null;
    a.percentage = p;
    state = p > 0 ? 'on' : 'off';
  };
  switch (service) {
    case 'turn_on':
      if (!(f & 32)) return s;
      if (typeof data.preset_mode === 'string') {
        state = 'on';
        a.preset_mode = data.preset_mode;
        a.percentage = null;
      } else if (f & 1) setPct(typeof data.percentage === 'number' ? data.percentage : 67);
      else state = 'on';
      break;
    case 'turn_off':
      if (!(f & 16)) return s;
      state = 'off';
      a.preset_mode = null;
      if (f & 1) a.percentage = 0;
      break;
    case 'set_percentage':
      if (f & 1) setPct(Number(data.percentage));
      break;
    case 'oscillate':
      if (f & 2) a.oscillating = !!data.oscillating;
      break;
    case 'set_direction':
      if (f & 4) a.direction = data.direction;
      break;
    case 'set_preset_mode':
      if (f & 8) {
        state = 'on';
        a.preset_mode = data.preset_mode;
        a.percentage = null;
      }
      break;
    default:
      return s;
  }
  return { ...s, state, attributes: a };
}
