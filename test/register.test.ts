// @vitest-environment happy-dom
import { afterAll, describe, expect, it, vi } from 'vitest';
import { DOCS_URL, TAGS } from '../src/const';

/** The documented tags: four cards, their four editors and the internal sheet. */
const DOCUMENTED = [
  'liquid-home-light-card',
  'liquid-home-light-card-editor',
  'liquid-home-tile',
  'liquid-home-tile-editor',
  'liquid-home-badge',
  'liquid-home-badge-editor',
  'liquid-home-room',
  'liquid-home-room-editor',
  'liquid-home-sheet',
];

// Liquid Climate's entries are on the page first (both bundles on one dashboard).
window.customCards = [{ type: 'liquid-climate-card', name: 'Liquid Climate', description: 'x' }];
window.customBadges = [
  {
    type: 'liquid-climate-badge',
    name: 'Liquid Climate badge',
    description: 'x',
  },
];

const define = vi.spyOn(customElements, 'define');
await import('../src/index');
const defined = define.mock.calls.map(([tag]) => tag);
afterAll(() => define.mockRestore());

describe('custom elements (plan 2.3, 4.2)', () => {
  it('defines exactly the documented tags, each once, all prefixed liquid-home-', () => {
    expect([...defined].sort()).toEqual([...DOCUMENTED].sort());
    expect(new Set(defined).size).toBe(defined.length);
    for (const tag of defined) expect(tag.startsWith('liquid-home-')).toBe(true);
    expect(Object.values(TAGS).sort()).toEqual([...DOCUMENTED].sort());
  });

  it('every card returns its own editor element from getConfigElement', async () => {
    for (const [card, editor] of [
      [TAGS.light, TAGS.lightEditor],
      [TAGS.tile, TAGS.tileEditor],
      [TAGS.badge, TAGS.badgeEditor],
      [TAGS.room, TAGS.roomEditor],
    ]) {
      const Card = customElements.get(card) as unknown as {
        getConfigElement(): Promise<HTMLElement>;
      };
      const el = await Card.getConfigElement();
      expect(el.localName).toBe(editor);
      expect(el).toBeInstanceOf(customElements.get(editor)!);
    }
  });

  it('a second copy of the bundle defines nothing again and does not throw', async () => {
    define.mockClear();
    vi.resetModules();
    await expect(import('../src/index')).resolves.toBeDefined();
    expect(define).not.toHaveBeenCalled();
  });
});

describe('picker entries (plan 2.3, D-16)', () => {
  it('lists the light card, tile, badge and room once each, next to Liquid Climate', async () => {
    vi.resetModules();
    await import('../src/register');
    const ours = window.customCards!.filter((c) => c.type.startsWith('liquid-home-'));
    expect(ours.map((c) => c.type)).toEqual([TAGS.light, TAGS.tile, TAGS.badge, TAGS.room]);
    expect(ours.map((c) => c.name)).toEqual(['Liquid Home light card', 'Liquid Home tile', 'Liquid Home badge', 'Liquid Home room']);
    expect(window.customCards![0].type).toBe('liquid-climate-card');
    expect(new Set(window.customCards!.map((c) => c.type)).size).toBe(window.customCards!.length);
    for (const c of ours) {
      expect(c.preview).toBe(true);
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.documentationURL).toBe(`${DOCS_URL}/cards/${c.type === TAGS.light ? 'light' : c.type.replace('liquid-home-', '')}`);
      expect(c.type.startsWith('custom:')).toBe(false);
    }
  });

  it('lists the badge in the badge picker once, next to the Liquid Climate badge', () => {
    expect(window.customBadges!.map((c) => c.type)).toEqual(['liquid-climate-badge', TAGS.badge]);
  });

  it('every entry text is free of em-dashes', () => {
    for (const c of [...window.customCards!, ...window.customBadges!]) expect(JSON.stringify(c)).not.toContain(String.fromCharCode(0x2014));
  });
});
