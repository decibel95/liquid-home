import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Frame capture through the DevTools screencast: the browser pushes a frame every time it
 * paints, with a timestamp. Frames go to disk as they arrive; encode.mjs resamples them to a
 * constant frame rate using those timestamps.
 */
/** Where the captured frames go. run.mjs removes it at the end. */
export const CAPTURE_ROOT = join(tmpdir(), 'liquid-home-media');

export async function startCapture(page, name, { quality = 100 } = {}) {
  const dir = join(CAPTURE_ROOT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ file, t: metadata.timestamp });
    writes.push(writeFile(join(dir, file), Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1 });
  return {
    dir,
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all(writes);
      await cdp.detach().catch(() => {});
      return { dir, frames };
    },
  };
}
