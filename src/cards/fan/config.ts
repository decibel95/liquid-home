import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, withLook, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';

/** The fan card config of plan section 4. */
export interface FanCardConfig {
  type: string;
  entity: string;
  name?: string;
  /** `presets: false` hides the preset chip (as controls.effects on the light card). */
  controls?: { presets?: boolean };
  write_hold?: number;
  look?: LookConfig;
  config_version?: number;
}

/** A config after normalizeConfig(): every option the card reads is filled in. */
export type NormalizedFanConfig = FanCardConfig & {
  controls: { presets: boolean };
  write_hold: number;
  look: Required<LookConfig>;
  config_version: number;
};

export const defaultConfig = {
  type: CARD_TYPES.fan,
  entity: '',
  controls: { presets: true },
  write_hold: 10,
  look: defaultLook,
  config_version: CONFIG_VERSION,
};

const GLASSES = ['theme', 'dark', 'light'] as const;
const MOTIONS = ['rich', 'subtle', 'minimal'] as const;

/** A finite number, or a numeric string such as "12" or "1.5"; anything else is NaN (as the light card). */
function strictNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(v)) return Number(v);
  return NaN;
}

/** Migrated config with every default filled in and every option checked; unknown values fall back to the default. */
export function normalizeConfig(raw: RawConfig): NormalizedFanConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  const controls = (cfg.controls && typeof cfg.controls === 'object' ? cfg.controls : {}) as Record<string, unknown>;
  const look = withLook(cfg.look && typeof cfg.look === 'object' ? cfg.look : undefined);
  const hold = strictNumber(cfg.write_hold);
  const blur = strictNumber(look.blur);
  return {
    ...cfg,
    type: cfg.type,
    entity: typeof cfg.entity === 'string' ? cfg.entity : '',
    ...(typeof cfg.name === 'string' && cfg.name.trim() ? { name: cfg.name } : { name: undefined }),
    controls: {
      ...controls,
      presets: typeof controls.presets === 'boolean' ? controls.presets : defaultConfig.controls.presets,
    },
    write_hold: Number.isFinite(hold) && hold >= 0 ? hold : defaultConfig.write_hold,
    look: {
      ...look,
      glass: (GLASSES as readonly string[]).includes(look.glass) ? look.glass : defaultLook.glass,
      blur: Number.isFinite(blur) && blur >= 0 ? blur : defaultLook.blur,
      motion: (MOTIONS as readonly string[]).includes(look.motion) ? look.motion : defaultLook.motion,
    },
    config_version: typeof cfg.config_version === 'number' ? cfg.config_version : CONFIG_VERSION,
  };
}

/** What an editor writes: only non-default options. */
export const pruneConfig = (config: FanCardConfig): Partial<FanCardConfig> => pruneDefaults(config, defaultConfig);
