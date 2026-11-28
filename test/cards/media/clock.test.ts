// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, fakeHass, text } from './helpers';
import { LiquidHomeMediaCard } from '../../../src/cards/media';

vi.mock('../../../src/media/model', async (orig) => {
  const mod = await orig<typeof import('../../../src/media/model')>();
  const { completeView } = await import('./helpers');
  return { ...mod, mediaView: (e: Parameters<typeof mod.mediaView>[0], o: Parameters<typeof mod.mediaView>[1]) => completeView(mod.mediaView(e, o), e, o) };
});
vi.mock('../../../src/media/writer', async () => {
  const { fakeRegistry, fakeWriter } = await import('./helpers');
  return { mediaWriters: fakeRegistry(), createMediaWriter: fakeWriter };
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-28T12:00:00Z'));
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the ticker (GD3) with the real clock semantics', () => {
  it('labels and value text read the real time while the fill leads by 1 s; one render per tick', async () => {
    const render = vi.spyOn(LiquidHomeMediaCard.prototype as unknown as { render(): unknown }, 'render');
    // seek_live: playing, 83 s of 245 s at mount time, SEEK.
    const el = await fakeHass().mount('seek_live');
    await el.updateComplete;
    const seek = () => $(el, '.seek .lc-slider')!;
    // The clock started in the first willUpdate, so the very first render already leads (no second update cycle).
    expect(render).toHaveBeenCalledTimes(1);
    expect(seek().getAttribute('aria-valuenow')).toBe('84');
    expect(seek().getAttribute('aria-valuetext')).toBe('1:23 of 4:05');
    expect($$(el, '.times span').map(text)).toEqual(['1:23', '-2:42']);
    render.mockClear();
    for (const s of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(1000);
      await el.updateComplete;
      expect(seek().getAttribute('aria-valuenow')).toBe(String(84 + s));
      expect(seek().getAttribute('aria-valuetext')).toBe(`1:2${3 + s} of 4:05`);
      expect(text($$(el, '.times span')[0])).toBe(`1:2${3 + s}`);
    }
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('a seek key gesture stops the clock (counts as dragging) and starts from the real position', async () => {
    const el = await fakeHass().mount('seek_live');
    await el.updateComplete;
    const seek = $(el, '.seek .lc-slider')!;
    seek.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await el.updateComplete;
    // 83 s real (not the 84 s the fill showed) plus 5 s.
    expect(text($$(el, '.times span')[0])).toBe('1:28 of 4:05');
    const clock = (el as unknown as { _clock: { running: boolean } })._clock;
    expect(clock.running).toBe(false);
    seek.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await el.updateComplete;
    expect(clock.running).toBe(true);
  });
});
