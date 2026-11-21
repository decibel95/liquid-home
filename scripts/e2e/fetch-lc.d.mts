export const LC_VERSION: string;
export const LC_URL: string;
export const LC_SHA256: string;
export const LC_BYTES: number;
export function cacheDir(): string;
export function ensureLc(): Promise<string>;
