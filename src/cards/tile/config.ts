import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';
import { normalizeConfig as normalizeLightConfig, type LightCardConfig } from '../light/config';

/** What a tap on the tile body or on a badge does, as in Liquid Climate. */
export type TapAction = 'sheet' | 'more-info' | 'none';
export const TAP_ACTIONS: readonly TapAction[] = ['sheet', 'more-info', 'none'];

export const tapAction = (v: unknown, fallback: TapAction): TapAction => (TAP_ACTIONS.includes(v as TapAction) ? (v as TapAction) : fallback);

/** The tile opens the light card as a sheet: light card options can sit here and are passed on. */
export interface TileConfig extends Omit<LightCardConfig, 'type'> {
  type: string;
  /** Tap on the name and status: open the light card (default), HA's more-info dialog, or nothing. */
  tap_action?: TapAction;
}

/** A config after normalizeConfig(): every option the tile reads is filled in. */
export type NormalizedTileConfig = TileConfig & { tap_action: TapAction; write_hold: number; look: Required<LookConfig> };

export const defaultConfig = {
  type: CARD_TYPES.tile,
  entity: '',
  controls: { effects: true },
  write_hold: 10,
  tap_action: 'sheet' as TapAction,
  look: defaultLook,
  config_version: CONFIG_VERSION,
};

/**
 * Migrated config with every default filled in. Unknown values fall back to their default. The light card options
 * the tile passes on to its sheet (name, controls, write_hold, look) go through the light card's own normalizer, so
 * a tile and the card it opens read them identically.
 */
export function normalizeConfig(raw: RawConfig): NormalizedTileConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  const { type: _light, ...light } = normalizeLightConfig({ ...cfg, type: CARD_TYPES.light });
  return {
    type: cfg.type,
    ...light,
    tap_action: tapAction(cfg.tap_action, defaultConfig.tap_action),
  };
}

/** The light card config the tile opens as a sheet: its light card options without its own keys. */
export function sheetConfig(cfg: TileConfig): LightCardConfig {
  const { tap_action: _tap, ...rest } = cfg;
  return { ...rest, type: CARD_TYPES.light };
}

/** What an editor writes: only non-default options. */
export const pruneConfig = (config: TileConfig): Partial<TileConfig> => pruneDefaults(config, defaultConfig);
