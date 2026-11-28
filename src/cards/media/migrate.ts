import type { RawConfig } from '../../config';

/**
 * Upgrade steps of this card, keyed by the version they upgrade FROM. The media card is new in 0.4 and has no upgrade
 * yet; step 0 only stamps a config written without `config_version` (as every card, test/migrate.test.ts). Add an entry
 * here whenever the schema changes in a way old configs cannot satisfy.
 */
export const STEPS: Record<number, (c: RawConfig) => RawConfig> = {
  0: (c) => ({ ...c, config_version: 1 }),
};
