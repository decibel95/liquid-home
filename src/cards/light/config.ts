import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, withLook, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';

import { LIGHT_MODES, type LightMode } from '../../lights/model';

export { LIGHT_MODES, type LightMode };

export interface LightCardConfig {
  type: string;
  entity: string;
  name?: string;
  controls?: { modes?: LightMode[]; effects?: boolean };
  write_hold?: number;
  look?: LookConfig;
  config_version?: number;
}

/** A config after normalizeConfig(): every option the card reads is filled in. */
export type NormalizedLightConfig = LightCardConfig & {
  controls: { modes?: LightMode[]; effects: boolean };
  write_hold: number;
  look: Required<LookConfig>;
  config_version: number;
};

export const defaultConfig = {
  type: CARD_TYPES.light,
  entity: '',
  controls: { effects: true },
  write_hold: 10,
  look: defaultLook,
  config_version: CONFIG_VERSION,
};

const GLASSES = ['theme', 'dark', 'light'] as const;
const MOTIONS = ['rich', 'subtle', 'minimal'] as const;

/** A finite number, or a numeric string such as "12" or "1.5"; anything else (null, "", true, "a") is NaN. */
function strictNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(v)) return Number(v);
  return NaN;
}

/** Only the known modes, each once, in the fixed order; anything else means "what the light supports". */
function modesOf(raw: unknown): LightMode[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const picked = LIGHT_MODES.filter((m) => raw.includes(m));
  return picked.length ? picked : undefined;
}

/** Migrated config with every default filled in and every option checked; unknown values fall back to the default. */
export function normalizeConfig(raw: RawConfig): NormalizedLightConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  const controls = (cfg.controls && typeof cfg.controls === 'object' ? cfg.controls : {}) as Record<string, unknown>;
  const modes = modesOf(controls.modes);
  const look = withLook(cfg.look && typeof cfg.look === 'object' ? cfg.look : undefined);
  const hold = strictNumber(cfg.write_hold);
  const blur = strictNumber(look.blur);
  return {
    ...cfg,
    type: cfg.type,
    entity: typeof cfg.entity === 'string' ? cfg.entity : '',
    ...(typeof cfg.name === 'string' && cfg.name.trim() ? { name: cfg.name } : { name: undefined }),
    controls: {
      ...defaultConfig.controls,
      ...controls,
      ...(modes ? { modes } : { modes: undefined }),
      effects: typeof controls.effects === 'boolean' ? controls.effects : defaultConfig.controls.effects,
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
export const pruneConfig = (config: LightCardConfig): Partial<LightCardConfig> => pruneDefaults(config, defaultConfig);
