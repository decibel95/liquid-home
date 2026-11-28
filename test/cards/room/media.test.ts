// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The sheet is H3's: spy on the openers by their fixed signatures (the strip name button, plan 2.9).
vi.mock('../../../src/cards/sheet/open', () => ({
  openLightSheet: vi.fn(),
  openEntitySheet: vi.fn(),
  reconfigureLightSheet: vi.fn(),
  closeLightSheet: vi.fn(),
  lightSheet: vi.fn(),
}));

import { ICONS, PALETTE, TINT, rgba, tone, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { openEntitySheet } from '../../../src/cards/sheet/open';
import '../../../src/cards/room';
import '../../../src/cards/media';
import { normalizeConfig, pruneConfig, ROOM_DOMAINS } from '../../../src/cards/room/config';
import { domainOf, roomMembers } from '../../../src/cards/room/members';
import { CARD_TYPES, TAGS } from '../../../src/const';
import { mediaWriters } from '../../../src/media';
import { defaultConfig as mediaDefaults } from '../../../src/cards/media/config';
import { $, $$, AREA, GROUP, KITCHEN, makeMediaHass, makeMixedHass, mountRoom, text, tile, tiles, type AnyEl, type Call } from './helpers';

const cfg = (raw: Record<string, unknown>) => normalizeConfig({ type: CARD_TYPES.room, ...raw });
const ALL = ['light', 'cover', 'fan', 'media_player'];
const css = (v: string) => v.replace(/,/g, ', ');
const neutral = (glass: 'dark' | 'light') => tone(PALETTE.neutral, glass);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  vi.mocked(openEntitySheet).mockClear();
});
afterEach(async () => {
  document.body.innerHTML = '';
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const settle = async (c: AnyEl) => {
  await c.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await c.updateComplete;
};

/** A list room of media players (and whatever else is listed), on dark glass. */
async function room(entities: unknown[], extra: Record<string, unknown> = {}, calls: Call[] = [], tweak?: Parameters<typeof makeMediaHass>[1]) {
  const { hass, ids } = makeMediaHass(calls, tweak);
  const card = mountRoom({ domains: ALL, entities, look: { glass: 'dark' }, ...extra }, hass);
  await settle(card);
  return { card, hass, ids };
}
/** Select the tile named `name`: the strip follows it. */
async function select(card: AnyEl, name: string) {
  tile(card, name).click();
  await settle(card);
}
const modes = (c: AnyEl) => $$(c, '.strip .mode') as HTMLButtonElement[];
const labels = (c: AnyEl) => modes(c).map((b) => b.getAttribute('aria-label'));
const disabled = (c: AnyEl) => modes(c).map((b) => b.disabled);
const steps = (c: AnyEl) => $$(c, '.strip .step') as HTMLButtonElement[];
const stepOff = (c: AnyEl) => steps(c).map((b) => b.getAttribute('aria-disabled'));
const iconPath = (b: Element) => b.querySelector('.ricon path')!.getAttribute('d');
const value = (b: Element) => text(b.querySelector('.rv'));
const foot = (b: Element) => text(b.querySelector('.foot'));
const ARTIST_TITLE = 'Technohead, I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)';

describe('domains option with media players (P3-CHO-22)', () => {
  it('media_player is a room domain after fan; the default stays lights only', () => {
    expect([...ROOM_DOMAINS]).toEqual(['light', 'cover', 'fan', 'media_player']);
    expect(cfg({}).domains).toEqual(['light']);
    expect(cfg({ domains: ['media_player', 'light', 'media_player'] }).domains).toEqual(['light', 'media_player']);
    expect(cfg({ domains: ['media_player'] }).domains).toEqual(['media_player']);
    expect(pruneConfig(cfg({ area: AREA, domains: ['media_player', 'fan'] })).domains).toEqual(['fan', 'media_player']);
    expect(domainOf('media_player.kitchen')).toBe('media_player');
    expect(domainOf('media_player.Kitchen')).toBeUndefined();
  });

  it('area source: media players of the area by entity or device area, after lights, covers and fans; hidden and other areas left out', () => {
    const { hass } = makeMediaHass();
    const all = roomMembers(hass, cfg({ area: AREA, power_entity: GROUP, domains: ALL })).map((m) => m.entity);
    const media = all.filter((id) => id.startsWith('media_player.'));
    // Device area (Kitchen player), entity area (Lounge room, Walkman); sorted by name.
    expect(media).toEqual(['media_player.kitchen', 'media_player.lounge_room', 'media_player.lh_fixture_unavailable']);
    // Order: every light, then covers, then fans, then media players.
    const rank = (id: string) => ['light', 'cover', 'fan', 'media_player'].indexOf(id.split('.')[0]);
    expect(all.map(rank)).toEqual([...all.map(rank)].sort((a, b) => a - b));
    expect(all).not.toContain('media_player.hidden_speaker');
    expect(all).not.toContain('media_player.lh_fixture_tv_sources');
    expect(roomMembers(hass, cfg({ area: KITCHEN, domains: ['media_player'] })).map((m) => m.entity)).toEqual([
      'media_player.bedroom',
      'media_player.group',
      'media_player.lh_fixture_paused',
    ]);
  });

  it('list source: media players are accepted when the domain is allowed, in the listed order with name overrides', () => {
    const { hass } = makeMediaHass();
    expect(roomMembers(hass, cfg({ domains: ALL, entities: ['media_player.group', { entity: 'media_player.kitchen', name: 'Speaker' }, 'light.ceiling_lights'] }))).toEqual([
      { entity: 'media_player.group', name: 'Group' },
      { entity: 'media_player.kitchen', name: 'Speaker' },
      { entity: 'light.ceiling_lights', name: 'Ceiling Lights' },
    ]);
    // Not allowed: dropped from members, and setConfig names the domain.
    expect(roomMembers(hass, cfg({ domains: ['light'], entities: ['media_player.group', 'light.ceiling_lights'] })).map((m) => m.entity)).toEqual(['light.ceiling_lights']);
    const card = document.createElement(TAGS.room) as AnyEl;
    expect(() => card.setConfig({ type: CARD_TYPES.room, entities: ['media_player.kitchen'] })).toThrow('"media_player.kitchen" in entities is a media_player, and domains does not include media_player');
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ALL, entities: ['switch.x'] })).toThrow('is not a light, cover, fan or media_player');
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ['media_player'], entities: ['media_player.kitchen'] })).not.toThrow();
    expect(() => card.setConfig({ type: CARD_TYPES.room, domains: ALL, area: AREA, power_entity: 'media_player.kitchen' })).toThrow(/power_entity "media_player.kitchen" is not a light/);
  });

  it('a 0.3 room config (no domains, or domains without media_player) renders exactly the same members as before', async () => {
    const before = makeMixedHass().hass;
    const { hass, ids } = makeMediaHass();
    const configs = [
      { area: AREA, power_entity: GROUP },
      { area: AREA },
      { area: KITCHEN },
      { area: AREA, domains: ['light', 'cover', 'fan'] },
      { area: AREA, domains: ['cover', 'fan'] },
      { entities: [ids.off, { entity: 'light.ceiling_lights', name: 'Sofa' }] },
    ];
    for (const raw of configs) {
      expect(roomMembers(hass, cfg(raw))).toEqual(roomMembers(before, cfg(raw)));
      const a = mountRoom(raw, before);
      const b = mountRoom(raw, hass);
      await settle(a);
      await settle(b);
      const shown = (c: AnyEl) => tiles(c).map((t) => [t.getAttribute('aria-label'), iconPath(t)]);
      expect(shown(b)).toEqual(shown(a));
      expect(text($(b, '.sum'))).toBe(text($(a, '.sum')));
      expect(text($(b, '.empty'))).toBe(text($(a, '.empty')));
      expect(!!$(b, '.power')).toBe(!!$(a, '.power'));
    }
  });
});

describe('room tiles for media players (P3-CHO-23)', () => {
  for (const glass of ['dark', 'light'] as const) {
    it(`speaker glyph, value, subline and aria on ${glass} glass`, async () => {
      const { card } = await room(
        [
          'media_player.kitchen',
          'media_player.lounge_room',
          'media_player.group',
          'media_player.lh_fixture_buffering',
          'media_player.lh_fixture_idle',
          'media_player.lh_fixture_standby',
          'media_player.lh_fixture_off',
          'media_player.lh_fixture_unavailable',
          'media_player.lh_fixture_onoff_only',
          'media_player.lh_fixture_volume_step',
          { entity: 'media_player.lh_fixture_tv_sources', name: 'TV' },
          { entity: 'media_player.lh_fixture_unknown', name: 'Unknown player' },
        ],
        { look: { glass } },
      );
      const rows = tiles(card).map((t) => ({
        label: t.getAttribute('aria-label'),
        value: value(t),
        foot: foot(t),
        colour: (t.querySelector('.ricon') as HTMLElement).style.color,
        unavail: t.classList.contains('unavail'),
      }));
      const n = css(neutral(glass));
      const fg3 = 'var(--lc-fg3)';
      expect(rows).toEqual([
        { label: `Kitchen, 100%, ${ARTIST_TITLE}, Playing`, value: '100%', foot: ARTIST_TITLE, colour: n, unavail: false },
        // No volume bits: the state word is the value.
        { label: 'Lounge room, Paused, Paused', value: 'Paused', foot: 'Paused', colour: fg3, unavail: false },
        // No title: "Playing".
        { label: 'Group, 100%, Playing', value: '100%', foot: 'Playing', colour: n, unavail: false },
        { label: 'Living Room, 100%, Buffering', value: '100%', foot: 'Buffering', colour: n, unavail: false },
        { label: 'Kitchen, 100%, Idle', value: '100%', foot: 'Idle', colour: fg3, unavail: false },
        // Standby and off report no volume: the word. An on/off-only player in on is lit (amendment 2026-11-28).
        { label: 'Standby, Standby, Standby', value: 'Standby', foot: 'Standby', colour: fg3, unavail: false },
        { label: 'Kitchen, Off, Off', value: 'Off', foot: 'Off', colour: fg3, unavail: false },
        { label: 'Walkman, Unavailable', value: '--', foot: 'Unavailable', colour: fg3, unavail: true },
        { label: 'Amplifier, On, On', value: 'On', foot: 'On', colour: n, unavail: false },
        // Volume step only: HA's level cannot be read, so the state word; the subline is Artist, Title.
        { label: 'Kitchen, Playing, Synthetic Set, Paper Lanterns', value: 'Playing', foot: 'Synthetic Set, Paper Lanterns', colour: n, unavail: false },
        // A series player: "Series, Title".
        { label: 'TV, 60%, House of Cards, Chapter 1, Playing', value: '60%', foot: 'House of Cards, Chapter 1', colour: n, unavail: false },
        { label: 'Unknown player, Unknown, Unknown', value: 'Unknown', foot: 'Unknown', colour: fg3, unavail: false },
      ]);
      for (const t of tiles(card)) expect(iconPath(t)).toBe(ICONS.speaker);
      // WCAG 2.5.3 as axe checks it (label-content-name-mismatch): the visible text in order (name, value, unit,
      // footer), punctuation stripped, is a substring of the stripped accessible name.
      const strip = (x: string) => x.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      for (const t of tiles(card)) {
        const visible = strip(['.rname', '.rv', '.foot'].map((sel) => text(t.querySelector(sel))).join(' '));
        expect(strip(t.getAttribute('aria-label')!)).toContain(visible);
      }
      // No artwork in room tiles: no image, no art layer.
      expect(card.shadowRoot!.querySelector('img, .art, [class*="artwork"]')).toBeNull();
    });
  }

  it('the room tile follows the pending play or pause of the shared writer at once', async () => {
    const calls: Call[] = [];
    const { card } = await room(['media_player.kitchen'], {}, calls);
    modes(card)[1].click();
    await settle(card);
    expect(calls.map((c) => `${c.domain}.${c.service}`)).toEqual(['media_player.media_pause']);
    expect(tiles(card)[0].getAttribute('aria-label')).toBe('Kitchen, 100%, Paused');
    expect((tiles(card)[0].querySelector('.ricon') as HTMLElement).style.color).toBe('var(--lc-fg3)');
    expect(text($(card, '.sum'))).toBe('0 of 1 active');
  });
});

describe('media strip (P3-CHO-24)', () => {
  it('generic (30141) playing: Previous, Pause tinted, Next, then the volume steps; no Mute, Source or Sound mode', async () => {
    const { card } = await room([{ entity: 'media_player.lh_fixture_volume_mid', name: 'Kitchen' }]);
    expect(labels(card)).toEqual(['Previous', 'Pause', 'Next']);
    expect(disabled(card)).toEqual([false, false, false]);
    // Pause is the tinted action (the neutral at the tile TINT), with no aria-pressed (plan 2.11).
    const [prev, pause, next] = modes(card);
    expect(pause.style.background).toBe(css(rgba(neutral('dark'), TINT.tile)));
    expect(pause.style.borderColor).toBe(css(rgba(neutral('dark'), TINT.tileEdge)));
    expect(prev.style.background).toBe('');
    expect(pause.hasAttribute('aria-pressed')).toBe(false);
    // Previous is skip-forward mirrored, Next the plain skip-forward.
    expect(prev.querySelector('svg')!.classList.contains('mirror')).toBe(true);
    expect(next.querySelector('svg')!.classList.contains('mirror')).toBe(false);
    expect(prev.querySelector('path')!.getAttribute('d')).toBe(ICONS.skipForward);
    expect(pause.querySelector('path')!.getAttribute('d')).toBe(ICONS.pause);
    expect(steps(card).map((b) => b.getAttribute('aria-label'))).toEqual(['Volume down, Kitchen', 'Volume up, Kitchen']);
    expect(stepOff(card)).toEqual(['false', 'false']);
    expect(text($(card, '.strip .target'))).toBe('Volume 35%');
    expect(text($(card, '.strip .modes'))).toBe('');
    expect($(card, '.strip .modes')!.getAttribute('aria-label')).toBe('Playback controls');
    expect(card.shadowRoot!.querySelector('.strip [aria-label*="Mute"], .strip [aria-label*="Source"], .strip [aria-label*="Sound"]')).toBeNull();
    // The strip name button reads the tile subline.
    expect($(card, '.strip .who')!.getAttribute('aria-label')).toBe('Open Kitchen, Synthetic Set, Paper Lanterns');
  });

  it('at 100 %: Volume up disabled (kitchen); at 0 %: Volume down disabled', async () => {
    const { card } = await room(['media_player.kitchen', { entity: 'media_player.lh_fixture_volume_mid', name: 'Zero' }], {}, [], (h) => {
      h.states['media_player.lh_fixture_volume_mid'].attributes.volume_level = 0;
    });
    expect(text($(card, '.strip .target'))).toBe('Volume 100%');
    expect(stepOff(card)).toEqual(['false', 'true']);
    await select(card, 'Zero');
    expect(text($(card, '.strip .target'))).toBe('Volume 0%');
    expect(stepOff(card)).toEqual(['true', 'false']);
  });

  it('21439 paused: Play is a plain action; buffering: Pause disabled; seek_live playing: all enabled', async () => {
    const { card } = await room([
      { entity: 'media_player.lh_fixture_paused', name: 'Paused' },
      { entity: 'media_player.lh_fixture_buffering', name: 'Buffering' },
      { entity: 'media_player.lh_fixture_seek_live', name: 'Seek' },
    ]);
    expect(labels(card)).toEqual(['Previous', 'Play', 'Next']);
    expect(disabled(card)).toEqual([false, false, false]);
    expect(modes(card)[1].style.background).toBe('');
    expect(modes(card)[1].querySelector('path')!.getAttribute('d')).toBe(ICONS.play);
    await select(card, 'Buffering');
    expect(labels(card)).toEqual(['Previous', 'Pause', 'Next']);
    expect(disabled(card)).toEqual([false, true, false]);
    // Disabled: no tint.
    expect(modes(card)[1].style.background).toBe('');
    await select(card, 'Seek');
    expect(labels(card)).toEqual(['Previous', 'Pause', 'Next']);
    expect(disabled(card)).toEqual([false, false, false]);
  });

  it('21391 standby: no Previous or Next, Play disabled, no volume steps; unavailable: every button disabled, steps "--"', async () => {
    const { card } = await room([
      { entity: 'media_player.lh_fixture_standby', name: 'Standby' },
      { entity: 'media_player.lh_fixture_unavailable', name: 'Gone' },
    ]);
    expect(labels(card)).toEqual(['Play']);
    expect(disabled(card)).toEqual([true]);
    expect(steps(card)).toHaveLength(0);
    await select(card, 'Gone');
    expect(labels(card)).toEqual(['Previous', 'Play', 'Next']);
    expect(disabled(card)).toEqual([true, true, true]);
    expect(text($(card, '.strip .target'))).toBe('Volume --');
    expect(stepOff(card)).toEqual(['true', 'true']);
  });

  it('30137 volume step only: both steps always enabled, no value; a tap sends volume_up or volume_down at once', async () => {
    const calls: Call[] = [];
    const { card } = await room([{ entity: 'media_player.lh_fixture_volume_step', name: 'Step' }], {}, calls);
    expect(stepOff(card)).toEqual(['false', 'false']);
    expect($(card, '.strip .target')).toBeNull();
    steps(card)[1].click();
    steps(card)[1].click();
    steps(card)[0].click();
    expect(calls.map((c) => c.service)).toEqual(['volume_up', 'volume_up', 'volume_down']);
    expect(calls[0]).toEqual({ domain: 'media_player', service: 'volume_up', data: { entity_id: 'media_player.lh_fixture_volume_step' } });
  });

  it('an unavailable step-only player shows "--" in the strip readout', async () => {
    const { card } = await room([{ entity: 'media_player.lh_fixture_volume_step', name: 'Step' }], {}, [], (h) => {
      const states = h.states as Record<string, HassEntity>;
      const id = 'media_player.lh_fixture_volume_step';
      states[id] = { ...states[id], state: 'unavailable' };
    });
    expect(text($(card, '.strip .target'))).toBe('Volume --');
  });

  it('an available volume player with no level has no strip steps (as the tile)', async () => {
    const { card } = await room([{ entity: 'media_player.lh_fixture_volume_mid', name: 'Kitchen' }], {}, [], (h) => {
      const states = h.states as Record<string, HassEntity>;
      const id = 'media_player.lh_fixture_volume_mid';
      const { volume_level: _v, ...attributes } = states[id].attributes;
      states[id] = { ...states[id], attributes };
    });
    expect(steps(card)).toHaveLength(0);
    expect($(card, '.strip .target')).toBeNull();
  });

  it('a failed discrete call is announced even while the writer is sending a volume step', async () => {
    const calls: Call[] = [];
    const { card } = await room([{ entity: 'media_player.lh_fixture_volume_mid', name: 'Kitchen' }], {}, calls, (h) => {
      // The volume write hangs (the writer reports sending); the pause call fails.
      (h as unknown as { callService: unknown }).callService = (domain: string, service: string, data: Record<string, unknown> = {}) => {
        calls.push({ domain, service, data } as Call);
        if (service === 'volume_set') return new Promise(() => undefined);
        return Promise.reject(new Error('Speaker said no'));
      };
    });
    steps(card)[1].click();
    await settle(card);
    modes(card)[1].click();
    await settle(card);
    expect(calls.map((c) => c.service)).toContain('media_pause');
    expect(text($(card, '.sr[role=alert]'))).toBe('Kitchen: Speaker said no');
  });

  it('384 on/off only and an off player: no transport and no steps; 22973 TV: transport and volume, no chips', async () => {
    const { card } = await room([
      { entity: 'media_player.lh_fixture_onoff_only', name: 'Amp' },
      { entity: 'media_player.lh_fixture_off', name: 'Off' },
      { entity: 'media_player.lh_fixture_tv_sources', name: 'TV' },
    ]);
    expect(modes(card)).toHaveLength(0);
    expect(steps(card)).toHaveLength(0);
    expect($(card, '.strip')!.classList.contains('nomodes')).toBe(true);
    await select(card, 'Off');
    expect(modes(card)).toHaveLength(0);
    expect(steps(card)).toHaveLength(0);
    await select(card, 'TV');
    expect(labels(card)).toEqual(['Previous', 'Pause', 'Next']);
    expect(text($(card, '.strip .target'))).toBe('Volume 60%');
    expect(card.shadowRoot!.querySelector('.chip, [aria-haspopup="menu"]')).toBeNull();
  });

  it('Previous, Next and Play go out through the shared writer with the media card hold time', async () => {
    const calls: Call[] = [];
    const { card } = await room([{ entity: 'media_player.lh_fixture_seek_live', name: 'Seek' }], {}, calls);
    modes(card)[0].click();
    modes(card)[2].click();
    expect(calls.map((c) => c.service)).toEqual(['media_previous_track', 'media_next_track']);
    const lease = (card as unknown as { _leases: Map<string, { current?: { hold: number } }> })._leases.get('media_player.lh_fixture_seek_live');
    expect(lease?.current?.hold).toBe(mediaDefaults.write_hold);
  });

  it('volume steps: from 35 %, three Minus taps give a leading and one trailing volume_set (throttled 300 ms)', async () => {
    const calls: Call[] = [];
    const { card } = await room([{ entity: 'media_player.lh_fixture_volume_mid', name: 'Mid' }], {}, calls);
    steps(card)[0].click();
    await settle(card);
    expect(text($(card, '.strip .target'))).toBe('Volume 30%');
    steps(card)[0].click();
    steps(card)[0].click();
    await settle(card);
    expect(text($(card, '.strip .target'))).toBe('Volume 20%');
    // The tile shows the pending value too.
    expect(value(tiles(card)[0])).toBe('20%');
    await vi.advanceTimersByTimeAsync(400);
    expect(calls.map((c) => [c.service, c.data.volume_level])).toEqual([
      ['volume_set', 0.3],
      ['volume_set', 0.2],
    ]);
  });
});

describe('header summary and power with media players (P3-CHO-25)', () => {
  it('"N of M active" counts playing and buffering players with lights on, covers open and fans on', async () => {
    const { hass } = makeMediaHass();
    const living = mountRoom({ area: AREA, domains: ALL, power_entity: GROUP }, hass);
    await settle(living);
    const members = roomMembers(hass, cfg({ area: AREA, domains: ALL, power_entity: GROUP }));
    // Only the Kitchen player plays; the paused Lounge room and the unavailable Walkman do not count.
    const nonMedia = mountRoom({ area: AREA, domains: ['light', 'cover', 'fan'], power_entity: GROUP }, hass);
    await settle(nonMedia);
    const [n0] = text($(nonMedia, '.sum')).split(' ');
    expect(text($(living, '.sum'))).toBe(`${Number(n0) + 1} of ${members.length} active`);
    expect($(living, '.power')).not.toBeNull();
    const players = mountRoom({ domains: ['media_player'], entities: ['media_player.kitchen', 'media_player.lh_fixture_buffering', 'media_player.lounge_room', 'media_player.lh_fixture_idle', 'media_player.lh_fixture_unavailable'] }, hass);
    await settle(players);
    expect(text($(players, '.sum'))).toBe('2 of 5 active');
  });

  it('an on/off-only player in on counts as active', async () => {
    const { hass } = makeMediaHass();
    const ids = ['media_player.kitchen', 'media_player.lounge_room', 'media_player.lh_fixture_onoff_only'];
    const players = mountRoom({ domains: ['media_player'], entities: ids }, hass);
    await settle(players);
    expect(text($(players, '.sum'))).toBe('2 of 3 active');
  });

  it('a media-only room: no header power; a lights-only list keeps "N of M on"', async () => {
    const { hass, ids } = makeMediaHass();
    const kitchen = mountRoom({ area: KITCHEN, domains: ['media_player'] }, hass);
    const withLightDomain = mountRoom({ area: KITCHEN, domains: ['light', 'media_player'] }, hass);
    const lights = mountRoom({ domains: ALL, entities: [ids.colourTemp, ids.off] }, hass);
    await settle(kitchen);
    await settle(withLightDomain);
    await settle(lights);
    expect($(kitchen, '.power')).toBeNull();
    expect(text($(kitchen, 'h2'))).toBe('Kitchen');
    expect(text($(kitchen, '.sum'))).toBe('1 of 3 active');
    // The light domain without lights in the area: still no power button.
    expect($(withLightDomain, '.power')).toBeNull();
    expect(text($(lights, '.sum'))).toBe('1 of 2 on');
    const empty = mountRoom({ area: 'attic', domains: ['media_player'] }, hass);
    await settle(empty);
    expect(text($(empty, '.empty'))).toBe('No devices in this area.');
  });

  it('exactly one backdrop-filter in the whole card with media players and every domain, for each strip', async () => {
    const { hass } = makeMediaHass();
    const card = mountRoom({ area: AREA, domains: ALL, look: { glass: 'dark' } }, hass);
    await settle(card);
    const count = () =>
      [card.shadowRoot!, ...$$(card, '*')].filter((el) => {
        if (!(el instanceof Element)) return false;
        const v = getComputedStyle(el).backdropFilter;
        return !!v && v !== 'none';
      }).length;
    for (const t of tiles(card)) {
      t.click();
      await settle(card);
      expect(count()).toBe(1);
    }
    const sheetCss = (card.constructor as unknown as { elementStyles: { cssText: string }[] }).elementStyles.map((s) => s.cssText).join('\n');
    expect(sheetCss.match(/(?<!-webkit-)backdrop-filter:/g)?.length).toBe(1);
  });
});

describe('the strip name button opens the media card in the sheet', () => {
  it('sheetConfig gives the media card config (not the light card) with the name override and the look', async () => {
    const { card } = await room([{ entity: 'media_player.kitchen', name: 'Speaker' }, 'media_player.group'], { look: { glass: 'light' } });
    expect(card.sheetConfig('media_player.kitchen')).toEqual({ type: CARD_TYPES.media, entity: 'media_player.kitchen', name: 'Speaker', look: card._config.look });
    expect(card.sheetConfig('media_player.group')).toEqual({ type: CARD_TYPES.media, entity: 'media_player.group', look: card._config.look });
    ($(card, '.strip .who') as HTMLButtonElement).click();
    expect(vi.mocked(openEntitySheet).mock.calls).toEqual([[card, { type: CARD_TYPES.media, entity: 'media_player.kitchen', name: 'Speaker', look: card._config.look }]]);
  });
});

describe('writers: the room shares the media writer', () => {
  it('a lease per media member, released on disconnect and when media_player leaves domains', async () => {
    const { hass } = makeMediaHass();
    const card = mountRoom({ area: AREA, domains: ALL }, hass);
    await settle(card);
    expect(['media_player.kitchen', 'media_player.lounge_room'].map((id) => mediaWriters.refs(id))).toEqual([1, 1]);
    card.setConfig({ type: CARD_TYPES.room, area: AREA, domains: ['light', 'cover', 'fan'] });
    await settle(card);
    expect(mediaWriters.refs('media_player.kitchen')).toBe(0);
    card.setConfig({ type: CARD_TYPES.room, area: AREA, domains: ALL });
    await settle(card);
    expect(mediaWriters.refs('media_player.kitchen')).toBe(1);
    card.remove();
    expect(mediaWriters.refs('media_player.kitchen')).toBe(0);
  });

  it('the strip and the media card (the sheet copy) hold one writer: a strip step shows in the card, and the steps coalesce', async () => {
    const calls: Call[] = [];
    const id = 'media_player.lh_fixture_volume_mid';
    const { card: roomCard, hass } = await room([{ entity: id, name: 'Mid' }], {}, calls);
    const mediaCard = document.createElement(TAGS.media) as AnyEl;
    mediaCard.setConfig({ type: CARD_TYPES.media, entity: id });
    mediaCard.hass = hass;
    document.body.append(mediaCard);
    await settle(mediaCard);
    expect(mediaWriters.refs(id)).toBe(2);
    const roomWriter = roomCard._leases.get(id).current;
    expect(mediaCard._lease.current).toBe(roomWriter);
    steps(roomCard)[1].click();
    await settle(roomCard);
    await settle(mediaCard);
    // The card's pill reads the strip's pending 40 % before any echo.
    expect(mediaCard.shadowRoot!.querySelector('[role="slider"]')!.getAttribute('aria-valuenow')).toBe('40');
    // A card step within the same 300 ms window coalesces with the strip's into one throttle stream.
    mediaCard.shadowRoot!.querySelector<HTMLElement>('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    mediaCard.shadowRoot!.querySelector<HTMLElement>('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
    await vi.advanceTimersByTimeAsync(400);
    expect(calls.filter((c) => c.service === 'volume_set').map((c) => c.data.volume_level)).toEqual([0.4, 0.42]);
  });
});

/** Not a media test: guards the shared hass helper against the media fixtures leaking into the 0.3 Living Room. */
describe('fixtures', () => {
  it('the media hass keeps every 0.3 Living Room entity', () => {
    const a = makeMixedHass().hass as HomeAssistant;
    const b = makeMediaHass().hass as HomeAssistant;
    for (const id of Object.keys(a.states)) expect(b.states[id]).toEqual(a.states[id]);
  });
});
