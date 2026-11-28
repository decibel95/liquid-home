import type { ReactiveController, ReactiveControllerHost } from 'lit';

/** What the ticker needs to know each time it evaluates; the card returns it from a function so it is always current. */
export interface MediaClockInputs {
  /** The state is `playing` and no next/previous buffering is pending. */
  playing: boolean;
  /** The seek bar exists on this host. */
  seekBar: boolean;
  /** A seek drag is active. */
  dragging: boolean;
}

/** GD3: one tick per second. */
export const MEDIA_TICK_MS = 1000;

/** The clocks of one document and its one IntersectionObserver (threshold 0). */
interface Shared {
  io: IntersectionObserver | null;
  clocks: Map<Element, MediaClock>;
}

const shared = new WeakMap<Document, Shared>();

function sharedFor(doc: Document): Shared {
  let s = shared.get(doc);
  if (!s) {
    const clocks = new Map<Element, MediaClock>();
    const IO = doc.defaultView?.IntersectionObserver ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
    const io = IO
      ? new IO(
          (entries) => {
            for (const e of entries) clocks.get(e.target)?.intersect(e.isIntersecting);
          },
          { threshold: 0 },
        )
      : null;
    s = { io, clocks };
    shared.set(doc, s);
  }
  return s;
}

/**
 * The position ticker of plan 2.4 (GD3). A ReactiveController: it runs a 1 s interval only while `playing`, `seekBar`,
 * not `dragging`, `document.visibilityState === 'visible'` and the host intersects the viewport (one shared
 * IntersectionObserver per document, threshold 0); otherwise no timer exists. `visibilitychange` and the observer
 * re-evaluate it; the card calls `update()` after its inputs change. Each tick, and each start or stop, calls
 * `host.requestUpdate()`. The card reads `clock.now` (epoch ms, "now + 1 s" while running so the core `ticker`
 * transition fills the second) and passes it as `mediaView(entity, { now: clock.now })`.
 *
 * A host counts as intersecting until the observer says otherwise, so a browser (or test DOM) whose observer never
 * reports still ticks.
 */
export class MediaClock implements ReactiveController {
  private timer?: ReturnType<typeof setInterval>;
  private connected = false;
  private intersecting = true;
  private doc?: Document;
  private readonly onVisibility = (): void => this.update();

  constructor(
    readonly host: ReactiveControllerHost & HTMLElement,
    readonly inputs: () => MediaClockInputs,
  ) {
    host.addController(this);
  }

  /** True while the 1 s interval runs. */
  get running(): boolean {
    return this.timer !== undefined;
  }

  /** The time to feed `mediaView`: one second ahead while ticking, so the fill transitions toward the next second. */
  get now(): number {
    return this.running ? Date.now() + MEDIA_TICK_MS : Date.now();
  }

  hostConnected(): void {
    this.connected = true;
    const doc = (this.doc = this.host.ownerDocument ?? document);
    const s = sharedFor(doc);
    s.clocks.set(this.host, this);
    s.io?.observe(this.host);
    doc.addEventListener('visibilitychange', this.onVisibility);
    this.update();
  }

  hostDisconnected(): void {
    this.connected = false;
    const doc = this.doc;
    if (doc) {
      const s = sharedFor(doc);
      s.clocks.delete(this.host);
      s.io?.unobserve(this.host);
      doc.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.stop();
  }

  /** The shared observer reports this host. */
  intersect(isIntersecting: boolean): void {
    this.intersecting = isIntersecting;
    this.update();
  }

  /** Re-evaluate the conditions after the card changed `inputs` (state change, drag start or end). */
  update(): void {
    const i = this.connected ? this.inputs() : undefined;
    const run = !!i && i.playing && i.seekBar && !i.dragging && this.intersecting && (this.doc ?? document).visibilityState === 'visible';
    if (run === this.running) return;
    if (run) this.timer = setInterval(() => this.host.requestUpdate(), MEDIA_TICK_MS);
    else this.stop();
    this.host.requestUpdate();
  }

  private stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
