import type { HomeAssistant } from '@decibel95/liquid-core';
import { COVER_FIXTURES, type CoverState } from './fixtures';

export interface SimCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

export interface CoverSimOptions {
  /** Echo delay of every call (the prototype sim: 250 ms). Null records calls without applying them. */
  echoMs?: number | null;
  /** Motor: 10 % per this many ms (the HA demo: 10 % per second). */
  motorMs?: number;
  /** Travel time of a cover without position; 0 switches at once (the demo). */
  travelMs?: number;
  language?: string;
  darkMode?: boolean;
  onCall?: (call: SimCall) => void;
}

/**
 * A fake hass over the cover fixtures with the gate 2 prototype's simulated HA (applyCover, goCover, goTilt): the call
 * is applied after `echoMs`; positioned covers round the request to 10 (as the demo) and move 10 % per `motorMs` in
 * the `opening` or `closing` state; a tilt move changes the tilt only (HA has no tilt moving state). Every state
 * change is a new state object, published as a new hass to every listener.
 */
export function createCoverSim(opts: CoverSimOptions = {}) {
  const echoMs = opts.echoMs === undefined ? 250 : opts.echoMs;
  const motorMs = opts.motorMs ?? 1000;
  const travelMs = opts.travelMs ?? 0;
  const states: Record<string, CoverState> = {};
  for (const make of Object.values(COVER_FIXTURES)) {
    const s = make();
    states[s.entity_id] = s;
  }
  const calls: SimCall[] = [];
  const listeners = new Set<(hass: HomeAssistant) => void>();
  const motors: Record<string, { pos?: ReturnType<typeof setInterval>; tilt?: ReturnType<typeof setInterval>; travel?: ReturnType<typeof setTimeout>; target?: number; tiltTarget?: number }> = {};
  let language = opts.language ?? 'en';
  let hass: HomeAssistant;

  const build = () => {
    hass = {
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      language,
      locale: { language, number_format: 'language', time_format: 'language' },
      themes: { darkMode: opts.darkMode ?? true },
      config: { unit_system: { temperature: '°C' } },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        const call = { domain, service, data };
        calls.push(call);
        opts.onCall?.(call);
        if (echoMs != null) setTimeout(() => apply(service, data), echoMs);
      },
    } as unknown as HomeAssistant;
    return hass;
  };
  build();

  const publish = () => {
    build();
    for (const l of listeners) l(hass);
  };
  /** A new state object for `id` (attributes merged), published. */
  const write = (id: string, state: string, attributes: Record<string, unknown> = {}) => {
    const s = states[id];
    states[id] = { ...s, state, attributes: { ...s.attributes, ...attributes } };
    publish();
  };
  const feat = (id: string) => Number(states[id].attributes.supported_features ?? 0);
  const has = (id: string, bit: number) => (feat(id) & bit) !== 0;
  const pos = (id: string) => states[id].attributes.current_position as number | undefined;
  const tilt = (id: string) => states[id].attributes.current_tilt_position as number | undefined;
  const moving = (id: string) => states[id].state === 'opening' || states[id].state === 'closing';
  const motor = (id: string) => (motors[id] ??= {});
  const stopMotor = (id: string) => {
    const m = motor(id);
    clearInterval(m.pos);
    clearTimeout(m.travel);
    m.pos = m.travel = undefined;
  };
  const rest = (id: string) => (has(id, 4) && pos(id) === 0 ? 'closed' : 'open');

  function goCover(id: string, target: number) {
    stopMotor(id);
    const m = motor(id);
    if (has(id, 4)) {
      const to = Math.max(0, Math.min(100, Math.round(target / 10) * 10));
      m.target = to;
      const from = pos(id) ?? 0;
      if (to === from) return write(id, rest(id));
      write(id, to > from ? 'opening' : 'closing');
      m.pos = setInterval(() => {
        const p = pos(id) ?? 0;
        const d = to - p;
        const next = p + Math.sign(d) * Math.min(10, Math.abs(d));
        if (next === to) {
          clearInterval(m.pos);
          m.pos = undefined;
          write(id, next === 0 ? 'closed' : 'open', { current_position: next });
        } else write(id, states[id].state, { current_position: next });
      }, motorMs);
      return;
    }
    const open = target > 0;
    if ((open && states[id].state === 'open') || (!open && states[id].state === 'closed')) return write(id, states[id].state);
    if (!travelMs) return write(id, open ? 'open' : 'closed');
    write(id, open ? 'opening' : 'closing');
    m.travel = setTimeout(() => write(id, open ? 'open' : 'closed'), travelMs);
  }

  function goTilt(id: string, target: number) {
    const m = motor(id);
    clearInterval(m.tilt);
    const to = Math.max(0, Math.min(100, Math.round(target / 10) * 10));
    m.tiltTarget = to;
    if (to === tilt(id)) return write(id, states[id].state);
    m.tilt = setInterval(() => {
      const p = tilt(id) ?? 0;
      const d = to - p;
      const next = p + Math.sign(d) * Math.min(10, Math.abs(d));
      if (next === to) {
        clearInterval(m.tilt);
        m.tilt = undefined;
      }
      write(id, states[id].state, { current_tilt_position: next });
    }, motorMs);
  }

  function apply(service: string, data: Record<string, unknown>) {
    const id = data.entity_id as string;
    if (!states[id] || states[id].state === 'unavailable') return;
    switch (service) {
      case 'open_cover':
        if (has(id, 1)) goCover(id, 100);
        break;
      case 'close_cover':
        if (has(id, 2)) goCover(id, 0);
        break;
      case 'stop_cover':
        if (has(id, 8)) {
          const was = moving(id);
          stopMotor(id);
          if (was) write(id, rest(id));
        }
        break;
      case 'set_cover_position':
        if (has(id, 4)) goCover(id, Number(data.position));
        break;
      case 'toggle':
        if (!(has(id, 1) && has(id, 2))) break;
        if (moving(id)) {
          if (has(id, 8)) {
            stopMotor(id);
            write(id, rest(id));
          }
        } else goCover(id, states[id].state === 'closed' ? 100 : 0);
        break;
      case 'open_cover_tilt':
        if (has(id, 16)) goTilt(id, 100);
        break;
      case 'close_cover_tilt':
        if (has(id, 32)) goTilt(id, 0);
        break;
      case 'stop_cover_tilt':
        if (has(id, 64)) clearInterval(motor(id).tilt);
        break;
      case 'set_cover_tilt_position':
        if (has(id, 128)) goTilt(id, Number(data.tilt_position));
        break;
      case 'toggle_cover_tilt':
        if (has(id, 16) && has(id, 32)) goTilt(id, tilt(id) === 0 ? 100 : 0);
        break;
    }
  }

  return {
    states,
    calls,
    get hass() {
      return hass;
    },
    onHass(l: (hass: HomeAssistant) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    publish,
    /** Replace a state (attributes merged) and publish: a fresh state object. */
    set: write,
    setLanguage(lang: string) {
      language = lang;
      publish();
    },
    /** Stop every motor (between tests). */
    stopAll() {
      for (const id of Object.keys(motors)) {
        stopMotor(id);
        clearInterval(motors[id].tilt);
      }
    },
  };
}

export type CoverSim = ReturnType<typeof createCoverSim>;
