import { CONFIG_VERSION } from './const';

export { CONFIG_VERSION };

export type RawConfig = Record<string, any>;

/** Options every card shares (the shared card config). No look.tint, no write_delay. */
export interface LookConfig {
  glass?: 'theme' | 'dark' | 'light';
  blur?: number;
  motion?: 'rich' | 'subtle' | 'minimal';
}

export const defaultLook: Required<LookConfig> = { glass: 'theme', blur: 30, motion: 'rich' };

/** Keys that stay in a pruned config even when they equal the default. */
const ALWAYS_KEPT = ['type', 'entity', 'config_version'];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => equal(a[k], b[k]));
  }
  return false;
}

/**
 * The config without options that equal their default, so editors write only what the user changed.
 * `type`, `entity` and `config_version` are always kept. Objects are pruned recursively and dropped when empty.
 */
export function pruneDefaults<T extends RawConfig>(config: T, defaults: RawConfig): Partial<T> {
  const out: RawConfig = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    if (ALWAYS_KEPT.includes(key)) {
      out[key] = value;
      continue;
    }
    const def = defaults[key];
    if (isPlainObject(value) && isPlainObject(def)) {
      const nested = pruneDefaults(value, def);
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }
    if (!equal(value, def)) out[key] = value;
  }
  return out as Partial<T>;
}

/** Fill the shared look options with their defaults (a new object, the input is not changed). */
export function withLook(look: LookConfig | undefined): Required<LookConfig> {
  return { ...defaultLook, ...(look ?? {}) };
}
