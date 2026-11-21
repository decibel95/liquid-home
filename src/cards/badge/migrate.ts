import type { RawConfig } from '../../config';

/**
 * Upgrade steps of this card, keyed by the version they upgrade FROM. Add an entry here
 * whenever the config schema changes in a way old configs cannot satisfy.
 */
export const STEPS: Record<number, (c: RawConfig) => RawConfig> = {
  // 0 -> 1: configs written before versioning existed only get stamped.
  0: (c) => ({ ...c, config_version: 1 }),
};
