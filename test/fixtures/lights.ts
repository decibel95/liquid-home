/**
 * Unit and dev-harness light fixtures. DERIVED: plain JSON states taken from the Home Assistant demo
 * integration snapshot (2026-11-18) with capabilities removed or
 * added to cover the cases the demo lacks (the fixture set below). They are not real device output.
 * Entity ids are unique per fixture: the demo id, with a suffix where two fixtures derive from the same demo light
 * (the colour-mode fixtures keep the plain demo id, so the group's members resolve). Every state is a fresh object.
 */

export interface FixtureState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

const ts = '2026-11-18T12:00:00+00:00';
const withTimes = (s: FixtureState) => ({ ...s, last_changed: ts, last_updated: ts, context: { id: s.entity_id, parent_id: null, user_id: null } });
export type LightState = ReturnType<typeof withTimes>;

const build = (entity_id: string, state: string, attributes: Record<string, unknown>): LightState =>
  withTimes({ entity_id, state, attributes: { friendly_name: attributes.friendly_name, ...attributes } });

const COLOR_TEMP_RANGE = { min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 };

/** Kitchen Lights, dimmed: brightness 26 of 255 (about 10 %), colour hs. */
export const dimmed = () =>
  build('light.kitchen_lights_dimmed', 'on', {
    friendly_name: 'Kitchen Lights',
    supported_color_modes: ['color_temp', 'hs'],
    color_mode: 'hs',
    brightness: 26,
    hs_color: [345, 75],
    rgb_color: [255, 64, 112],
    xy_color: [0.588, 0.274],
    color_temp_kelvin: null,
    ...COLOR_TEMP_RANGE,
    supported_features: 0,
  });

/**
 * Office RGBW Lights, unavailable. HA keeps the capability attributes of an unavailable light (LightEntity
 * capability_attributes: supported_color_modes, the kelvin range only with color_temp, effect_list only with the
 * effect feature) and drops the state attributes (brightness, colour, effect). This light, as on the test HA
 * (light.office_rgbw_lights), supports rgbw only, so it keeps supported_color_modes and no kelvin range or effects.
 */
export const unavailable = () =>
  build('light.office_rgbw_lights_unavailable', 'unavailable', {
    friendly_name: 'Office RGBW Lights',
    supported_color_modes: ['rgbw'],
    supported_features: 0,
  });

/** Living Room RGBWW Lights, off: colour attributes are null while off. */
export const off = () =>
  build('light.living_room_rgbww_lights_off', 'off', {
    friendly_name: 'Living Room RGBWW Lights',
    supported_color_modes: ['rgbww'],
    color_mode: null,
    brightness: null,
    hs_color: null,
    rgb_color: null,
    xy_color: null,
    rgbww_color: null,
    supported_features: 0,
  });

/** Ceiling Lights as a brightness-only light (supported_color_modes [brightness]). */
export const brightnessOnly = () =>
  build('light.ceiling_lights_brightness', 'on', {
    friendly_name: 'Ceiling Lights',
    supported_color_modes: ['brightness'],
    color_mode: 'brightness',
    brightness: 180,
    supported_features: 0,
  });

/** Entrance Color + White Lights as an on/off-only light (supported_color_modes [onoff]). */
export const onOffOnly = () =>
  build('light.entrance_color_white_lights', 'on', {
    friendly_name: 'Entrance Color + White Lights',
    supported_color_modes: ['onoff'],
    color_mode: 'onoff',
    supported_features: 0,
  });

/** The canvas's derived light group: members as an `entity_id` list, on when any member is on. */
export const group = () =>
  build('light.lh_fixture_living_room_lights', 'on', {
    friendly_name: 'Living Room Lights',
    entity_id: ['light.ceiling_lights', 'light.living_room_rgbww_lights', 'light.entrance_color_white_lights'],
    supported_color_modes: ['color_temp', 'hs', 'rgbww', 'white'],
    color_mode: 'color_temp',
    brightness: 180,
    color_temp_kelvin: 2631,
    ...COLOR_TEMP_RANGE,
    supported_features: 0,
  });

/** Bed Light with an effect list, switched on with an effect running. */
export const effectList = () =>
  build('light.bed_light', 'on', {
    friendly_name: 'Bed Light',
    supported_color_modes: ['color_temp', 'hs'],
    color_mode: 'color_temp',
    brightness: 180,
    color_temp_kelvin: 3000,
    ...COLOR_TEMP_RANGE,
    effect_list: ['rainbow', 'off'],
    effect: 'rainbow',
    supported_features: 4,
  });

/** Ceiling Lights in colour temperature mode at 2631 K (the demo value). */
export const colourTemp = () =>
  build('light.ceiling_lights', 'on', {
    friendly_name: 'Ceiling Lights',
    supported_color_modes: ['color_temp', 'hs'],
    color_mode: 'color_temp',
    brightness: 180,
    hs_color: [28.55, 67.974],
    rgb_color: [255, 164, 82],
    xy_color: [0.532, 0.388],
    color_temp_kelvin: 2631,
    ...COLOR_TEMP_RANGE,
    supported_features: 0,
  });

/** Kitchen Lights in hs colour mode (hue 345, saturation 75). */
export const colourHs = () =>
  build('light.kitchen_lights', 'on', {
    friendly_name: 'Kitchen Lights',
    supported_color_modes: ['color_temp', 'hs'],
    color_mode: 'hs',
    brightness: 180,
    hs_color: [345, 75],
    rgb_color: [255, 64, 112],
    xy_color: [0.588, 0.274],
    color_temp_kelvin: null,
    ...COLOR_TEMP_RANGE,
    supported_features: 0,
  });

/** Office RGBW Lights, on in rgbw mode. */
export const rgbw = () =>
  build('light.office_rgbw_lights', 'on', {
    friendly_name: 'Office RGBW Lights',
    supported_color_modes: ['rgbw'],
    color_mode: 'rgbw',
    brightness: 180,
    hs_color: [0, 49.804],
    rgb_color: [255, 128, 128],
    xy_color: [0.524, 0.313],
    rgbw_color: [255, 0, 0, 255],
    supported_features: 0,
  });

/** Living Room RGBWW Lights, on in rgbww mode. */
export const rgbww = () =>
  build('light.living_room_rgbww_lights', 'on', {
    friendly_name: 'Living Room RGBWW Lights',
    supported_color_modes: ['rgbww'],
    color_mode: 'rgbww',
    brightness: 180,
    hs_color: [0.923, 50.98],
    rgb_color: [255, 127, 125],
    xy_color: [0.528, 0.315],
    rgbww_color: [255, 0, 0, 255, 0],
    supported_features: 0,
  });

/** Every fixture by name; dev harness and tests iterate this. Names are the case labels of the fixture set. */
export const LIGHT_FIXTURES = {
  dimmed,
  unavailable,
  off,
  brightnessOnly,
  onOffOnly,
  group,
  effectList,
  colourTemp,
  colourHs,
  rgbw,
  rgbww,
} as const;

export type LightFixtureName = keyof typeof LIGHT_FIXTURES;
