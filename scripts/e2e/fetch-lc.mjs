#!/usr/bin/env node
/**
 * Downloads the Liquid Climate release asset the two-bundle tests load next to liquid-home.js, and verifies its
 * sha256 (plan 2.3). Never builds or touches the Liquid Climate repository.
 *
 * Cache directory: $LH_E2E_CACHE, else <os tmpdir>/lh-e2e-cache. Needs network only when the cached file is missing
 * or has the wrong hash. Usage: node scripts/e2e/fetch-lc.mjs   (prints the path of the verified file)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LC_VERSION = 'v0.13.0';
export const LC_URL = `https://github.com/decibel95/liquid-climate/releases/download/${LC_VERSION}/liquid-climate.js`;
export const LC_SHA256 = 'bec2a35630f24e8c503f0daa9dd839ce710fbb7fc5422fb317a4ceea0ceb35ae';
export const LC_BYTES = 355735;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function cacheDir() {
  return process.env.LH_E2E_CACHE || join(tmpdir(), 'lh-e2e-cache');
}

/** Returns the path of the verified liquid-climate.js, downloading it first when needed. */
export async function ensureLc() {
  const dir = join(cacheDir(), `liquid-climate-${LC_VERSION}`);
  const file = join(dir, 'liquid-climate.js');
  if (existsSync(file) && sha256(readFileSync(file)) === LC_SHA256) return file;

  mkdirSync(dir, { recursive: true });
  const res = await fetch(LC_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Cannot download ${LC_URL}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const declared = res.headers.get('content-length');
  if (body.length !== LC_BYTES || (declared !== null && Number(declared) !== body.length)) {
    throw new Error(`Liquid Climate ${LC_VERSION} asset is ${body.length} bytes (content-length ${declared ?? 'absent'}), expected ${LC_BYTES}. Not using it.`);
  }
  const got = sha256(body);
  if (got !== LC_SHA256) {
    throw new Error(`Liquid Climate ${LC_VERSION} asset has sha256 ${got}, expected ${LC_SHA256} (${body.length} bytes, expected ${LC_BYTES}). Not using it.`);
  }
  // Write beside the target and rename, so a parallel run never reads a half-written file.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, file);
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureLc().then(
    (file) => console.log(file),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
