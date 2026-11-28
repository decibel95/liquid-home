import { CARD_TYPES, CONFIG_VERSION } from '../../const';
import { defaultLook, pruneDefaults, withLook, type LookConfig, type RawConfig } from '../../config';
import { migrateConfig } from '../../migrate';

export type RoomSource = 'area' | 'list';

/** The domains a room can hold (P2-CHO-17, P3-CHO-22), in display order: lights, covers, fans, then media players. */
export const ROOM_DOMAINS = ['light', 'cover', 'fan', 'media_player'] as const;
export type RoomDomain = (typeof ROOM_DOMAINS)[number];
/** Without `domains` a room holds lights only, exactly as a 0.2 room (no config_version bump, plan section 4). */
export const DEFAULT_DOMAINS: RoomDomain[] = ['light'];

export interface RoomEntry {
  entity: string;
  name?: string;
}

export interface RoomConfig {
  type: string;
  title?: string;
  source: RoomSource;
  /** The domains this room shows (P2-CHO-17, P3-CHO-22): a subset of light, cover, fan and media_player, default light only. */
  domains?: RoomDomain[];
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

/**
 * The `domains` option as a clean subset in display order (light, cover, fan, media_player): unknown values and repeats are dropped,
 * and a missing, empty or unusable list gives the default, lights only.
 */
export function roomDomains(raw: unknown): RoomDomain[] {
  const given = Array.isArray(raw) ? raw : [];
  const out = ROOM_DOMAINS.filter((d) => given.includes(d));
  return out.length ? out : [...DEFAULT_DOMAINS];
}

/** `source` is inferred when missing: `entities` present gives `list`, otherwise `area`. */
export function normalizeConfig(raw: RawConfig): RoomConfig {
  const cfg = migrateConfig({ type: defaultConfig.type, ...raw });
  const source: RoomSource = cfg.source === 'area' || cfg.source === 'list' ? cfg.source : Array.isArray(cfg.entities) ? 'list' : 'area';
  return {
    ...cfg,
    type: cfg.type,
    source,
    domains: roomDomains(cfg.domains),
    exclude: Array.isArray(cfg.exclude) ? cfg.exclude : [],
    look: withLook(cfg.look),
    config_version: typeof cfg.config_version === 'number' ? cfg.config_version : CONFIG_VERSION,
  };
}

/**
 * What an editor writes: only non-default options. A room card has no `entity`, so `source` is kept explicitly.
 * `domains` is written only when it is not lights only; it stays out of defaultConfig, so a 0.2 config and its pruned
 * form are unchanged.
 */
export const pruneConfig = (config: RoomConfig): Partial<RoomConfig> => {
  const { domains, ...rest } = pruneDefaults(config, defaultConfig);
  const own = roomDomains(domains);
  return { ...rest, ...(domains && own.join() !== DEFAULT_DOMAINS.join() ? { domains: own } : {}), source: config.source };
};

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
