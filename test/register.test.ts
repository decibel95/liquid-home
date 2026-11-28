// @vitest-environment happy-dom
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CARD_TYPES, DOCS_URL, TAGS } from '../src/const';

/** The documented tags: seven cards, their seven editors and the internal sheet (plan section 4). */
const DOCUMENTED = [
  'liquid-home-light-card',
  'liquid-home-light-card-editor',
  'liquid-home-tile',
  'liquid-home-tile-editor',
  'liquid-home-badge',
  'liquid-home-badge-editor',
  'liquid-home-room',
  'liquid-home-room-editor',
  'liquid-home-cover-card',
  'liquid-home-cover-card-editor',
  'liquid-home-fan-card',
  'liquid-home-fan-card-editor',
  'liquid-home-media-card',
  'liquid-home-media-card-editor',
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
      [TAGS.cover, TAGS.coverEditor],
      [TAGS.fan, TAGS.fanEditor],
      [TAGS.media, TAGS.mediaEditor],
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
  it('lists seven entries: the light, cover, fan and media cards, tile, badge and room once each, next to Liquid Climate', async () => {
    vi.resetModules();
    await import('../src/register');
    const ours = window.customCards!.filter((c) => c.type.startsWith('liquid-home-'));
    expect(ours.map((c) => c.type)).toEqual([TAGS.light, TAGS.cover, TAGS.fan, TAGS.media, TAGS.tile, TAGS.badge, TAGS.room]);
    expect(ours.map((c) => c.name)).toEqual([
      'Liquid Home light card',
      'Liquid Home cover card',
      'Liquid Home fan card',
      'Liquid Home media card',
      'Liquid Home tile',
      'Liquid Home badge',
      'Liquid Home room',
    ]);
    expect(window.customCards![0].type).toBe('liquid-climate-card');
    expect(new Set(window.customCards!.map((c) => c.type)).size).toBe(window.customCards!.length);
    for (const c of ours) {
      expect(c.preview).toBe(true);
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.documentationURL).toBe(`${DOCS_URL}/cards/${c.type.replace('liquid-home-', '').replace('-card', '')}`);
      expect(c.type.startsWith('custom:')).toBe(false);
    }
  });

  it('tile, badge and room describe lights, covers, fans and media players; the cover, fan and media cards their own domain', () => {
    const by = (type: string) => window.customCards!.find((c) => c.type === type)!.description;
    for (const type of [TAGS.tile, TAGS.badge, TAGS.room]) expect(by(type)).toMatch(/lights?, covers?, fans? (and|or) media players?/);
    expect(by(TAGS.cover)).toContain('cover');
    expect(by(TAGS.fan)).toContain('fan');
    expect(by(TAGS.media)).toContain('media player');
  });

  it('the package description names every domain, as the product description does', async () => {
    const pkg = (await import('../package.json')).default as { description: string };
    const en = (await import('../src/i18n/locales/en.json')).default as { product: { description: string } };
    expect(pkg.description).toMatch(/lights, covers, fans and media players$/);
    expect(en.product.description).toBe('Glass cards for Home Assistant lights, covers, fans and media players');
  });

  it('every card offers a stub config of its own type and domain for the picker preview', async () => {
    const { makeMediaHass } = await import('./cards/room/helpers');
    const { hass } = makeMediaHass();
    const stub = (tag: string) => (customElements.get(tag) as unknown as { getStubConfig(h: unknown): Record<string, unknown> }).getStubConfig(hass);
    expect(stub(TAGS.light)).toMatchObject({ type: `custom:${TAGS.light}`, entity: expect.stringMatching(/^light\./) });
    expect(stub(TAGS.cover)).toMatchObject({ type: `custom:${TAGS.cover}`, entity: expect.stringMatching(/^cover\./) });
    expect(stub(TAGS.fan)).toMatchObject({ type: `custom:${TAGS.fan}`, entity: expect.stringMatching(/^fan\./) });
    expect(stub(TAGS.media)).toMatchObject({ type: `custom:${TAGS.media}`, entity: expect.stringMatching(/^media_player\./) });
    expect(stub(TAGS.tile)).toMatchObject({ type: `custom:${TAGS.tile}`, entity: expect.stringMatching(/^light\./) });
    expect(stub(TAGS.badge)).toMatchObject({ type: `custom:${TAGS.badge}`, entity: expect.stringMatching(/^light\./) });
    expect(stub(TAGS.room)).toMatchObject({ type: `custom:${TAGS.room}`, source: 'area', area: expect.any(String) });
    // Without hass (HA can call it before states are in): an example entity, still a valid config of that card.
    for (const tag of [TAGS.cover, TAGS.fan, TAGS.media]) expect(() => (customElements.get(tag) as any).getStubConfig(undefined)).not.toThrow();
    expect((customElements.get(TAGS.media) as any).getStubConfig(undefined)).toMatchObject({ type: CARD_TYPES.media, entity: 'media_player.example' });
  });

  it('the picker preview is guarded: each card mounts its stub on a hass without its domain, and on none at all', async () => {
    const { makeHass } = await import('./cards/room/helpers');
    const { hass } = makeHass();
    for (const tag of [TAGS.light, TAGS.cover, TAGS.fan, TAGS.media, TAGS.tile, TAGS.badge, TAGS.room]) {
      const Card = customElements.get(tag) as unknown as { getStubConfig(h: unknown): Record<string, unknown> };
      for (const h of [hass, undefined]) {
        const el = document.createElement(tag) as HTMLElement & { setConfig(c: unknown): void; hass?: unknown; updateComplete: Promise<unknown> };
        expect(() => el.setConfig(Card.getStubConfig(h))).not.toThrow();
        el.hass = hass;
        document.body.append(el);
        await expect(el.updateComplete).resolves.toBeDefined();
        expect(el.shadowRoot).not.toBeNull();
        el.remove();
      }
    }
  });

  it('lists the badge in the badge picker once, next to the Liquid Climate badge', () => {
    expect(window.customBadges!.map((c) => c.type)).toEqual(['liquid-climate-badge', TAGS.badge]);
  });

  it('every entry text is free of em-dashes', () => {
    for (const c of [...window.customCards!, ...window.customBadges!]) expect(JSON.stringify(c)).not.toContain(String.fromCharCode(0x2014));
  });
});
