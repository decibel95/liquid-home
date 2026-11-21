import { CONFIG_VERSION, CARD_TYPES } from './const';
import type { RawConfig } from './config';
import { STEPS as LIGHT_STEPS } from './cards/light/migrate';
import { STEPS as TILE_STEPS } from './cards/tile/migrate';
import { STEPS as BADGE_STEPS } from './cards/badge/migrate';
import { STEPS as ROOM_STEPS } from './cards/room/migrate';

export type StepMap = Record<number, (c: RawConfig) => RawConfig>;

/** Each card owns its upgrade steps (keyed by the version they upgrade FROM), so one card's migration never touches another's. */
const BY_TYPE: Record<string, StepMap> = {
  [CARD_TYPES.light]: LIGHT_STEPS,
  [CARD_TYPES.tile]: TILE_STEPS,
  [CARD_TYPES.badge]: BADGE_STEPS,
  [CARD_TYPES.room]: ROOM_STEPS,
};

/** Configs without a `config_version` are stamped silently (0 -> 1); unknown types only get the stamp. */
const STAMP: StepMap = { 0: (c) => ({ ...c, config_version: 1 }) };

export function migrateConfig(raw: RawConfig): RawConfig {
  let cfg: RawConfig = { ...raw };
  const steps = BY_TYPE[String(cfg.type)] ?? STAMP;
  let version = typeof cfg.config_version === 'number' ? cfg.config_version : 0;
  while (version < CONFIG_VERSION) {
    const step = steps[version];
    if (!step) break;
    cfg = step(cfg);
    const next = typeof cfg.config_version === 'number' ? cfg.config_version : version + 1;
    // A step that does not advance the version would loop forever.
    if (next <= version) break;
    version = next;
  }
  return cfg;
}
