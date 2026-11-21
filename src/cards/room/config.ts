import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, withLook, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';

export type RoomSource = 'area' | 'list';

export interface RoomEntry {
  entity: string;
  name?: string;
}

export interface RoomConfig {
  type: string;
  title?: string;
  source: RoomSource;
  area?: string;
  power_entity?: string;
  entities?: (string | RoomEntry)[];
  exclude?: string[];
  look?: LookConfig;
  config_version?: number;
}

export const defaultConfig = {
  type: CARD_TYPES.room,
  source: 'area',
  exclude: [] as string[],
  look: defaultLook,
  config_version: CONFIG_VERSION,
};

/** `source` is inferred when missing: `entities` present gives `list`, otherwise `area`. */
export function normalizeConfig(raw: RawConfig): RoomConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  const source: RoomSource = cfg.source === 'area' || cfg.source === 'list' ? cfg.source : Array.isArray(cfg.entities) ? 'list' : 'area';
  return {
    ...cfg,
    type: cfg.type,
    source,
    exclude: Array.isArray(cfg.exclude) ? cfg.exclude : [],
    look: withLook(cfg.look),
    config_version: typeof cfg.config_version === 'number' ? cfg.config_version : CONFIG_VERSION,
  };
}

/** What an editor writes: only non-default options. A room card has no `entity`, so `source` is kept explicitly. */
export const pruneConfig = (config: RoomConfig): Partial<RoomConfig> => ({
  ...pruneDefaults(config, defaultConfig),
  source: config.source,
});

/** The `entities` list as entries: a string is an entity id, an object carries an optional name. Anything else is dropped. */
export function roomEntries(config: Pick<RoomConfig, 'entities'>): RoomEntry[] {
  if (!Array.isArray(config.entities)) return [];
  const out: RoomEntry[] = [];
  for (const item of config.entities) {
    if (typeof item === 'string' && item) out.push({ entity: item });
    else if (item && typeof item === 'object' && typeof item.entity === 'string' && item.entity) {
      out.push(typeof item.name === 'string' && item.name ? { entity: item.entity, name: item.name } : { entity: item.entity });
    }
  }
  return out;
}
