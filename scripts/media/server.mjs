import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Start Vite on a free port. Returns { base, close }. */
export async function startServer() {
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    clearScreen: false,
    server: { port: 5290, strictPort: false, host: '127.0.0.1', open: false },
  });
  await server.listen();
  const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '');
  if (!base) throw new Error('Vite did not report a local URL');
  return { base, close: () => server.close() };
}
