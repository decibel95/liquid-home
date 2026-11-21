import { describe, expect, it, vi } from 'vitest';
import { CARD_TYPES, CONFIG_VERSION } from '../src/const';
import { migrateConfig } from '../src/migrate';

describe('migrateConfig', () => {
  it('is at config version 1', () => {
    expect(CONFIG_VERSION).toBe(1);
  });

  it.each(Object.entries(CARD_TYPES))('stamps a %s config without config_version and changes nothing else', (_card, type) => {
    const raw = { type, entity: 'light.a', name: 'A' };
    expect(migrateConfig(raw)).toEqual({ ...raw, config_version: 1 });
  });

  it('leaves a current config alone and does not mutate its input', () => {
    const raw = { type: CARD_TYPES.light, entity: 'light.a', config_version: 1 };
    const copy = structuredClone(raw);
    expect(migrateConfig(raw)).toEqual(copy);
    expect(raw).toEqual(copy);
  });

  it('stamps an unknown type too', () => {
    expect(migrateConfig({ type: 'custom:other' })).toEqual({ type: 'custom:other', config_version: 1 });
  });

  it('does not downgrade a newer config', () => {
    expect(migrateConfig({ type: CARD_TYPES.badge, config_version: 7 }).config_version).toBe(7);
  });

  it.each(Object.entries(CARD_TYPES))('stamps a %s config silently: nothing logged, nothing thrown', (_card, type) => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(migrateConfig({ type, entity: 'light.a' }).config_version).toBe(1);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it.each(Object.entries(CARD_TYPES))('leaves a %s config of an unknown future version alone, every key as it is', (_card, type) => {
    const raw = { type, entity: 'light.a', some_new_option: { deep: [1, 2] }, config_version: CONFIG_VERSION + 5 };
    const copy = structuredClone(raw);
    expect(migrateConfig(raw)).toEqual(copy);
    expect(raw).toEqual(copy);
  });

  it.each(Object.entries(CARD_TYPES))('every %s step map starts at 0 and reaches CONFIG_VERSION', async (card) => {
    const { STEPS } = await import(`../src/cards/${card}/migrate.ts`);
    let cfg: Record<string, unknown> = { type: 'x' };
    for (let v = 0; v < CONFIG_VERSION; v++) {
      expect(typeof STEPS[v], `${card} step ${v}`).toBe('function');
      cfg = STEPS[v](cfg);
    }
    expect(cfg.config_version).toBe(CONFIG_VERSION);
  });

  it('stops when a step does not advance config_version', async () => {
    vi.resetModules();
    vi.doMock('../src/cards/light/migrate', () => ({ STEPS: { 0: (c: Record<string, unknown>) => ({ ...c, config_version: 0, touched: true }) } }));
    const { migrateConfig: migrate } = await import('../src/migrate');
    expect(migrate({ type: CARD_TYPES.light })).toEqual({ type: CARD_TYPES.light, config_version: 0, touched: true });
    vi.doUnmock('../src/cards/light/migrate');
  });
});
