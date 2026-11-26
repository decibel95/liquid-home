import { debounceWrites, EntityWriter, WriterRegistry, type HassEntity, type HomeAssistant, type WriteCall, type WriterOptions } from '@decibel95/liquid-core';
import { t } from '../i18n';
import { coverStateOf, isCoverUnavailable, isMoving, nextStep, stepKey, stepsShown, type CoverAction, type CoverKey } from './model';

/**
 * A cover change in writer terms:
 * - `position`, `tilt_position`: the value the card wants HA to report (`current_position`, `current_tilt_position`).
 *   Sent as `set_cover_position {position}` and `set_cover_tilt_position {tilt_position}`, and held (Q6 a).
 * - `action`: a discrete service (open, stop, close, toggle and the tilt forms). It sets nothing, so it starts no hold.
 */
export interface CoverPatch {
  position?: number;
  tilt_position?: number;
  action?: CoverAction;
}

export type CoverCall = WriteCall<CoverPatch>;

/** Q2 a (gate 2): steps coalesce into one write 500 ms after the last tap; a pill or key gesture sends at its end. */
export const COVER_DEBOUNCE_MS = 500;

/**
 * Q6 a condition (5): with the cover never moving, an echo ends the hold once this long has passed since the send (an
 * echo before that ends it at this mark, as the prototype's sweep: echo seen and more than 400 ms since the send).
 */
export const COVER_ECHO_MS = 400;

const KEYS: readonly CoverKey[] = ['position', 'tilt_position'];
const SERVICE: Record<CoverKey, string> = { position: 'set_cover_position', tilt_position: 'set_cover_tilt_position' };

/**
 * The calls for a coalesced change. An action goes out as is (`sets: {}`, no hold). A position or tilt equal to its
 * baseline is dropped (Q2 a, "dropped when equal to the baseline"): the value in flight (the hold), else for the
 * position the target while moving (`target`, see CoverWriter.movingTarget), else the cover's current value.
 */
export function buildCoverCalls(change: CoverPatch, entity: HassEntity, baseline: CoverPatch, target?: number): CoverCall[] {
  const entity_id = entity.entity_id;
  if (change.action) return [{ service: change.action, data: { entity_id }, sets: {} }];
  const calls: CoverCall[] = [];
  for (const key of KEYS) {
    const v = change[key];
    if (typeof v !== 'number') continue;
    const base = key in baseline ? baseline[key] : key === 'position' && target !== undefined ? target : coverStateOf(entity, key);
    if (v === base) continue;
    calls.push({ service: SERVICE[key], data: { entity_id, [key]: v }, sets: { [key]: v } });
  }
  return calls;
}

/** One held key (Q6 a). */
interface Hold {
  /** When the value was sent. */
  at: number;
  /** When the key's value last changed (or the send): condition (4) counts `hold` seconds from here. */
  last: number;
  /** The key's value as last seen. */
  cur: unknown;
  /** An `opening` or `closing` state was seen for this hold: condition (2). Position key only (RV0 note 1). */
  sawMoving: boolean;
  /** The cover moved for this key (moving state, or the value changed): condition (5) needs it false. */
  moved: boolean;
  /** A fresh, non-moving state arrived while the key never moved: condition (5) once 400 ms have passed. */
  echo: boolean;
  timer?: ReturnType<typeof setTimeout>;
  echoTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Where an Open, Close or toggle sent through this writer drives the cover. Armed at the send (`pending`) and directed
 * by the fresh states after it: `opening` gives 100, `closing` gives 0. Open and Close know their direction (`dir`):
 * only that moving state directs them, the opposite one keeps them pending (a stale report from before the command),
 * a non-moving state clears them. A toggle has no known direction, so HA picks it (a toggle on a partly open cover
 * goes by its last direction): the first fresh state decides, a non-moving one clears it; a toggle on a cover already
 * moving (a stop) arms nothing. Once directed the target holds while that moving state lasts.
 * Any fresh state that is not a moving state ends the pending marker, also a report that changes only another
 * attribute before the moving state arrives: the inference is then lost (the baseline is the position), never wrong.
 * A failed action call, any other command, or no fresh state within `hold` seconds clears it; `write_hold: 0` holds
 * nothing, so nothing is inferred either.
 */
type Target =
  | { pending: true; dir?: 'opening' | 'closing'; from: HassEntity | undefined; timer: ReturnType<typeof setTimeout> }
  | { pending: false; value: number; while: 'opening' | 'closing' };

export type CoverWriterOptions = Partial<Omit<WriterOptions<CoverPatch, CoverCall>, 'schedule' | 'build'>>;

/**
 * The cover writer (Q2 a, Q6 a): an EntityWriter on debounceWrites(500) with a movement-aware hold, built on the core
 * 0.3.0 protected hooks (facts section 2, design 2.5). It must stay on debounce: the core send timeout and idle
 * handling only apply to throttled sends, so `hold` here only times this writer's own per-key timers.
 *
 * The sent value of a key stays held (on the pill fill, and as the baseline of the next write) until
 * (1) HA reports exactly that value (core reconcile, with order-aware stale echoes),
 * (2) the cover moved and has stopped moving (position only: HA has no tilt moving state),
 * (3) another command goes out (a new value of the key replaces it; discrete actions call discard()),
 * (4) `hold` seconds after the last movement (each reported change of the key restarts the timer), or
 * (5) the cover never moved, a fresh non-moving state (an echo) arrived, and more than 400 ms passed since the send.
 * The base hold timer is never armed: the queue's public `onFlushed` handler is replaced (same per-key send records).
 */
export class CoverWriter extends EntityWriter<CoverPatch, CoverCall> {
  private holds = new Map<CoverKey, Hold>();
  /** The state seen by the last send or reconcile: a reconcile against the same object is no echo. */
  private lastState?: HassEntity;
  private gone = false;
  private target?: Target;
  /** The key of a pending step: its send ends the other key's hold too (prototype dropHolds on a step). */
  private stepping?: CoverKey;

  constructor(entityId: string, opts: CoverWriterOptions = {}) {
    // build() needs the writer's moving target; the writer exists only after super(), so build reads it through `self`.
    const self: { w?: CoverWriter } = {};
    super(entityId, {
      stateOf: coverStateOf,
      t: (hass, key) => t(hass, key),
      errorKey: 'common.commandFailed',
      ...opts,
      build: (change, entity, baseline) => buildCoverCalls(change, entity, baseline, self.w?.movingTarget(entity)),
      schedule: debounceWrites(COVER_DEBOUNCE_MS),
    });
    self.w = this;
    // Replaces the base handler (core writer.ts onFlushed): the same per-key send records, no base hold timer.
    this.queue.onFlushed = (sent) => {
      if (this.gone) return;
      const s = this.entity();
      const now = performance.now();
      const next = { ...this._inflight, ...sent } as CoverPatch;
      for (const key of KEYS) {
        if (!(key in sent)) continue;
        const value = sent[key];
        const rec = key in this._inflight ? this.sent.get(key) : undefined;
        this.sent.set(key, rec ? { ...rec, values: [...rec.values, value], from: s?.state } : { values: [value], seen: s ? this.stateOf(s, key) : undefined, from: s?.state });
        const old = this.holds.get(key);
        clearTimeout(old?.timer);
        clearTimeout(old?.echoTimer);
        // Prototype setCoverHold: started = moving now, or the hold it replaces saw the cover move.
        const saw = key === 'position' && ((!!s && isMoving(s)) || !!old?.sawMoving);
        this.holds.set(key, { at: now, last: now, cur: s ? this.stateOf(s, key) : undefined, sawMoving: saw, moved: saw, echo: false });
        this.arm(key);
        // A position sent replaces an Open or Close target: the hold is the baseline now.
        if (key === 'position') this.clearTarget();
      }
      if (this.stepping && this.stepping in sent) {
        // A step ends the other key's hold, unless that key went out in this same flush (a pill write beside it).
        for (const key of KEYS) {
          if (key in sent) continue;
          delete next[key];
          this.sent.delete(key);
        }
      }
      this.stepping = undefined;
      this._inflight = next;
      this.prune();
      // The state at send time is not an echo.
      this.lastState = s;
    };
  }

  /** The held (sent, not yet released) value of a key, if any. */
  held(key: CoverKey): number | undefined {
    const v = this._inflight[key];
    return typeof v === 'number' ? v : undefined;
  }

  /**
   * Where the cover is going while it moves, inferred (HA reports no target): 100 while `opening` and 0 while
   * `closing`, only when that moving state is the first fresh state after an Open, Close or toggle sent through this
   * writer, until the cover stops (see Target).
   */
  movingTarget(s: HassEntity | undefined = this.entity()): number | undefined {
    const tg = this.target;
    return tg && !tg.pending && s?.state === tg.while ? tg.value : undefined;
  }

  /**
   * The base of the next step (and of the drop rule): the pending value, else the hold, else the target while
   * moving, else the cover's value (0 when it reports none).
   */
  baseline(key: CoverKey): number {
    const local = this.local[key];
    if (typeof local === 'number') return local;
    const s = this.entity();
    if (key === 'position') {
      const tv = this.movingTarget(s);
      if (tv !== undefined) return tv;
    }
    const cur = s ? coverStateOf(s, key) : null;
    return typeof cur === 'number' ? cur : 0;
  }

  /**
   * One tile or room step (Q2 a): 10 % from the baseline, rounded to 10, clamped; taps coalesce into one call 500 ms
   * after the last one. Tilt-only covers step the tilt. Returns the new pending value, or null when there is no step.
   */
  step(dir: 1 | -1): number | null {
    const s = this.entity();
    if (!s || isCoverUnavailable(s) || !stepsShown(s)) return null;
    const key = stepKey(s);
    const base = this.baseline(key);
    const v = nextStep(base, dir);
    if (v === base) return null;
    super.set({ [key]: v } as CoverPatch);
    this.stepping = key;
    return v;
  }

  /** A pill or key gesture value: not a step, so it never ends the other key's hold. */
  override set(patch: CoverPatch): void {
    this.stepping = undefined;
    super.set(patch);
  }

  /**
   * A discrete action (Open, Stop, Close, toggle, the tilt forms, the tile icon): ends every hold and pending step of
   * the entity, THEN sends at once (the other order would merge a pending step into the action's flush).
   */
  act(action: CoverAction): void {
    const s = this.entity();
    this.discard();
    const dir = action === 'open_cover' ? 'opening' : action === 'close_cover' ? 'closing' : undefined;
    if (dir || (action === 'toggle' && !isMoving(s))) {
      this.target = { pending: true, dir, from: s, timer: setTimeout(() => this.clearTarget(), this.hold * 1000) };
    }
    this.sendNow({ action });
  }

  override observe(hass: HomeAssistant): void {
    super.observe(hass);
    const tg = this.target;
    const s = this.entity();
    if (!tg || !s) return;
    if (tg.pending) {
      if (s === tg.from) return;
      const mv = s.state === 'opening' || s.state === 'closing' ? s.state : undefined;
      // The opposite moving state is a report from before Open or Close took effect: keep waiting.
      if (mv && tg.dir && mv !== tg.dir) return;
      this.clearTarget();
      if (mv === 'opening') this.target = { pending: false, value: 100, while: 'opening' };
      else if (mv === 'closing') this.target = { pending: false, value: 0, while: 'closing' };
    } else if (s.state !== tg.while) this.clearTarget();
  }

  private clearTarget(): void {
    if (this.target?.pending) clearTimeout(this.target.timer);
    this.target = undefined;
  }

  protected override reconcile(s: HassEntity): void {
    const fresh = s !== this.lastState;
    this.lastState = s;
    // (1), with stale echoes keeping the newest value held.
    super.reconcile(s);
    const now = performance.now();
    const mvg = isMoving(s);
    const next = { ...this._inflight } as CoverPatch;
    for (const key of KEYS) {
      if (!(key in next)) continue;
      const h = this.holds.get(key);
      if (!h) continue;
      const cur = this.stateOf(s, key);
      if (cur !== h.cur) {
        // (4) restarts on every movement of this key.
        h.cur = cur;
        h.last = now;
        h.moved = true;
      }
      if (key === 'position' && mvg) h.sawMoving = h.moved = true;
      const stopped = h.sawMoving && !mvg; // (2)
      if (!h.moved && fresh && !mvg) h.echo = true;
      const echoed = !h.moved && h.echo && now - h.at > COVER_ECHO_MS; // (5)
      if (!echoed && !h.moved && h.echo && h.echoTimer === undefined) h.echoTimer = setTimeout(() => this.settleEcho(key), h.at + COVER_ECHO_MS - now);
      if (stopped || echoed) {
        delete next[key];
        this.sent.delete(key);
      } else this.arm(key);
    }
    this._inflight = next;
    this.prune();
  }

  override discard(): void {
    this.clearTarget();
    this.stepping = undefined;
    super.discard();
    this.prune();
  }

  protected override rollback(failed: Record<string, unknown>[]): void {
    super.rollback(failed);
    // A failed Open, Close or toggle drives nowhere (an action call sets nothing: its set is empty).
    if (failed.some((x) => !Object.keys(x).length)) this.clearTarget();
    this.prune();
  }

  override dispose(): void {
    this.gone = true;
    this.clearTarget();
    super.dispose();
    for (const h of this.holds.values()) {
      clearTimeout(h.timer);
      clearTimeout(h.echoTimer);
    }
    this.holds.clear();
  }

  /** (4): release `key` `hold` seconds after its last movement. */
  private arm(key: CoverKey): void {
    const h = this.holds.get(key);
    if (!h) return;
    clearTimeout(h.timer);
    h.timer = setTimeout(() => this.expire(key), Math.max(0, this.hold * 1000 - (performance.now() - h.last)));
  }

  /** (5) for an echo that came within 400 ms of the send: release at the 400 ms mark if the cover still has not moved. */
  private settleEcho(key: CoverKey): void {
    const h = this.holds.get(key);
    if (!h) return;
    h.echoTimer = undefined;
    if (!h.moved) this.expire(key);
  }

  private expire(key: CoverKey): void {
    if (!(key in this._inflight)) return;
    const next = { ...this._inflight };
    delete next[key];
    this._inflight = next;
    this.sent.delete(key);
    this.prune();
    this.changed();
  }

  /** Drop hold records (and their timers) of keys no longer held. */
  private prune(): void {
    for (const [key, h] of this.holds) {
      if (key in this._inflight) continue;
      clearTimeout(h.timer);
      clearTimeout(h.echoTimer);
      this.holds.delete(key);
    }
  }
}

export const createCoverWriter = (entityId: string): CoverWriter => new CoverWriter(entityId);

/**
 * One shared writer per cover entity for the whole bundle: the cover card, its sheet copy, the tile and the room
 * strip coalesce into one queue and agree on what is held. A card reaches it through a WriterLease: `set()` for a pill
 * or key gesture, `step()` for a tile or strip step, `act()` for a discrete action.
 */
export const coverWriters = new WriterRegistry<CoverWriter>(createCoverWriter);
