import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, withLook, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';
import { tapAction, type TapAction } from '../tile/config';
import type { LightCardConfig } from '../light/config';

export interface BadgeConfig {
  type: string;
  entity: string;
  name?: string;
  /** Tap: HA's more-info dialog (default, as the Liquid Climate badge), the light card as a sheet, or nothing. */
  tap_action?: TapAction;
  /** Only the round icon, without name and value (as the Liquid Climate badge). */
  icon_only?: boolean;
  look?: LookConfig;
  config_version?: number;
}

export const defaultConfig = {
  type: CARD_TYPES.badge,
  entity: '',
  tap_action: 'more-info' as TapAction,
  icon_only: false,
  look: defaultLook,
  config_version: CONFIG_VERSION,
};

/** A config after normalizeConfig(): every option the badge reads is filled in. */
export type NormalizedBadgeConfig = BadgeConfig & { tap_action: TapAction; look: Required<LookConfig> };

/** Migrated config with every default filled in. Unknown values fall back to their default. */
export function normalizeConfig(raw: RawConfig): NormalizedBadgeConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  return {
    ...cfg,
    type: cfg.type,
    entity: typeof cfg.entity === 'string' ? cfg.entity : '',
    name: typeof cfg.name === 'string' && cfg.name ? cfg.name : undefined,
    tap_action: tapAction(cfg.tap_action, defaultConfig.tap_action),
    icon_only: cfg.icon_only === true,
    look: withLook(cfg.look),
    config_version: typeof cfg.config_version === 'number' ? cfg.config_version : CONFIG_VERSION,
  };
}

/** The light card config a badge opens as a sheet: its options without the badge's own keys. */
export function sheetConfig(cfg: BadgeConfig): LightCardConfig {
  const { tap_action: _tap, icon_only: _icon, ...rest } = cfg;
  return { ...rest, type: CARD_TYPES.light };
}

/** What an editor writes: only non-default options. */
export const pruneConfig = (config: BadgeConfig): Partial<BadgeConfig> => pruneDefaults(config, defaultConfig);
