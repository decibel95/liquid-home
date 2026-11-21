import { spawn } from 'node:child_process';
import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = process.env.FFMPEG || ffmpegPath;
if (!FFMPEG) throw new Error('ffmpeg not found: run npm install, or set FFMPEG to an ffmpeg binary');

export function ffmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.trim()}`))));
  });
}

export const sizeOf = async (file) => (await stat(file)).size;
export const mb = (n) => (n / 1048576).toFixed(2);

/**
 * Write an ffconcat list from captured frames. Each frame lasts until the next one arrived,
 * which keeps real-time pacing even though the browser paints at an irregular rate.
 * `from` and `to` (seconds since the first frame) trim the clip.
 */
export async function writeList(capture, { from = 0, to = Infinity } = {}) {
  const { dir, frames } = capture;
  const t0 = frames[0].t;
  const keep = frames.filter((f) => f.t - t0 >= from && f.t - t0 <= to);
  if (keep.length < 2) throw new Error('Capture produced too few frames');
  let text = 'ffconcat version 1.0\n';
  keep.forEach((f, i) => {
    const next = keep[i + 1];
    text += `file '${f.file}'\nduration ${(next ? next.t - f.t : 0.04).toFixed(4)}\n`;
  });
  text += `file '${keep[keep.length - 1].file}'\n`;
  await writeFile(join(dir, 'list.txt'), text);
  const seconds = keep[keep.length - 1].t - keep[0].t + 0.04;
  return { list: 'list.txt', seconds, count: keep.length };
}

const INPUT = (list) => ['-f', 'concat', '-safe', '0', '-i', list];

/** GIF: one diff-based palette per clip, scaled down until it fits `maxBytes`. */
export async function encodeGif(capture, out, { maxBytes = 3 * 1048576, ...trim } = {}) {
  const { list } = await writeList(capture, trim);
  const ladder = [[480, 15], [440, 12], [420, 12], [400, 10], [360, 10], [320, 10]];
  let last;
  for (const [width, fps] of ladder) {
    const vf =
      `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];` +
      '[a]palettegen=max_colors=128:stats_mode=diff[p];' +
      '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
    await ffmpeg([...INPUT(list), '-filter_complex', vf, '-loop', '0', out], capture.dir);
    last = { width, fps, size: await sizeOf(out) };
    if (last.size <= maxBytes) break;
  }
  return last;
}

/** Animated WebP at full frame rate, scaled and compressed harder until it fits `maxBytes`. */
export async function encodeWebp(capture, out, { maxBytes = 2.4 * 1048576, ...trim } = {}) {
  const { list } = await writeList(capture, trim);
  const ladder = [[800, 30, 96], [800, 30, 90], [800, 30, 82], [800, 30, 74], [760, 30, 68], [720, 30, 62], [680, 30, 56]];
  let last;
  for (const [width, fps, q] of ladder) {
    await ffmpeg(
      [...INPUT(list), '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos`, '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(q), '-compression_level', '5', '-g', '8', '-loop', '0', '-an', out],
      capture.dir,
    );
    last = { width, fps, size: await sizeOf(out) };
    if (last.size <= maxBytes) break;
  }
  return last;
}

/** H.264 video, constant frame rate, faststart, no audio. */
export async function encodeMp4(capture, out, { width = 1920, height = 1080, fps = 30, crf = 18, ...trim } = {}) {
  const { list } = await writeList(capture, trim);
  await ffmpeg(
    [...INPUT(list), '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', '-an', out],
    capture.dir,
  );
  return { size: await sizeOf(out) };
}

/** Extract one frame at `seconds` for a visual check. */
export function extractFrame(input, seconds, out) {
  return ffmpeg(['-ss', String(seconds), '-i', input, '-frames:v', '1', out]);
}
