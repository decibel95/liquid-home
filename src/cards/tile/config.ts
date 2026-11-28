import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';
import { normalizeConfig as normalizeLightConfig, type LightCardConfig } from '../light/config';
import { normalizeConfig as normalizeCoverConfig } from '../cover/config';
import { defaultConfig as fanDefaults, normalizeConfig as normalizeFanConfig } from '../fan/config';
import { defaultConfig as mediaDefaults, normalizeConfig as normalizeMediaConfig } from '../media/config';
import { tileDomain, type TileDomain } from './text';

/** What a tap on the tile body or on a badge does, as in Liquid Climate. */
export type TapAction = 'sheet' | 'more-info' | 'none';
export const TAP_ACTIONS: readonly TapAction[] = ['sheet', 'more-info', 'none'];

export const tapAction = (v: unknown, fallback: TapAction): TapAction => (TAP_ACTIONS.includes(v as TapAction) ? (v as TapAction) : fallback);

/**
 * The tile opens the card of its entity's domain (light, cover, fan or media card) as a sheet: that card's options can
 * sit here and are passed on (`controls` of the light, fan and media cards, `write_hold`, `look`).
 */
export interface TileConfig extends Omit<LightCardConfig, 'type' | 'controls'> {
  type: string;
  /** Light card `modes` and `effects`, fan card `presets`, media card `sources` and `sound_modes`. */
  controls?: LightCardConfig['controls'] & { presets?: boolean; sources?: boolean; sound_modes?: boolean };
  /** Tap on the name and status: open the card of the entity (default), HA's more-info dialog, or nothing. */
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

/** The card each domain opens in the sheet, and that card's normalizer for the options the tile passes on. */
const CARDS: Record<TileDomain, { type: string; normalize: (raw: RawConfig) => RawConfig }> = {
  light: { type: CARD_TYPES.light, normalize: normalizeLightConfig },
  cover: { type: CARD_TYPES.cover, normalize: normalizeCoverConfig },
  fan: { type: CARD_TYPES.fan, normalize: normalizeFanConfig },
  media: { type: CARD_TYPES.media, normalize: normalizeMediaConfig },
};

/** The domain a config is for; a config without a valid entity reads as a light (the 0.2 tile). */
const domainOf = (cfg: { entity?: unknown }): TileDomain => tileDomain(cfg.entity) ?? 'light';

/**
 * Migrated config with every default filled in. Unknown values fall back to their default. The card options the
 * tile passes on to its sheet (name, controls, write_hold, look) go through the normalizer of the card it opens (light,
 * cover or fan card), so a tile and the card it opens read them identically.
 */
export function normalizeConfig(raw: RawConfig): NormalizedTileConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  const card = CARDS[domainOf(cfg)];
  const { type: _card, ...opts } = card.normalize({ ...cfg, type: card.type });
  return {
    type: cfg.type,
    ...(opts as Omit<NormalizedTileConfig, 'type' | 'tap_action'>),
    tap_action: tapAction(cfg.tap_action, defaultConfig.tap_action),
  };
}

/** What openEntitySheet takes for the tile: the card of the entity's domain with the tile's card options. */
export interface TileSheetConfig extends Omit<TileConfig, 'tap_action'> {
  type: string;
  entity: string;
  [option: string]: unknown;
}

/** The card config the tile opens as a sheet: its card options without its own keys, typed by the entity's domain. */
export function sheetConfig(cfg: TileConfig): TileSheetConfig {
  const { tap_action: _tap, ...rest } = cfg;
  return { ...rest, type: CARDS[domainOf(cfg)].type };
}

/** The card defaults a tile's `controls` are pruned against: the fan and media cards' own, the light keys otherwise. */
const CONTROL_DEFAULTS: Partial<Record<TileDomain, object>> = { fan: fanDefaults.controls, media: mediaDefaults.controls };

/**
 * What an editor writes: only non-default options. A fan tile's `controls.presets: true` and a media tile's
 * `controls.sources` and `sound_modes: true` are their cards' defaults (the light keys stay as they were).
 */
export const pruneConfig = (config: TileConfig): Partial<TileConfig> => {
  const controls = CONTROL_DEFAULTS[domainOf(config)];
  return pruneDefaults(config, controls ? { ...defaultConfig, controls } : defaultConfig);
};
