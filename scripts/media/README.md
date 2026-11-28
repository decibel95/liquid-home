# Media pipeline

Renders the stills, animations and demo video for the README and docs into `docs/public/media/`.
Everything is generated from the real cards on a staging page (`dev/media.html`), nothing is drawn by hand.
Copied from Liquid Climate and pointed at the Liquid Home harness. Scenes: `light`, `cover`, `fan`, `media`, `tile`, `badge`, `room` (a -light and a -dark still each; the tile, badge and room scenes include media players)
and the animations `light-drag`, `cover-drag` (the pill dragged up and back) and `media-seek` (the position bar dragged forward and let go). The demo video is not made.
The media scenes use the six synthetic covers in `dev/covers/` (never real artwork). The stills freeze the clock so the position and time labels are the same in every run; the clip runs it (`live=1`).

## Run

```
npm install
npm run media              # everything
npm run media -- stills    # only the PNG stills
npm run media -- stills <scene> ...      # only the stills of the named scenes
npm run media -- animations [name ...]   # only the animations
npm run media -- demo      # only demo.mp4
```

An unknown step, scene or animation name stops with a message and exit code 1.

A full run empties `docs/public/media/` first, starts Vite on a free port, renders, and shuts everything down again.

## Prerequisites

- Node 20 or newer and `npm install` (installs `playwright` and `ffmpeg-static`; with `--ignore-scripts` the ffmpeg binary is missing, so set `FFMPEG`).
- A Chromium: `npx playwright install chromium`. If that browser is missing, the script falls back to an installed Google Chrome or Microsoft Edge.
- ffmpeg comes from `ffmpeg-static`. Set `FFMPEG=/path/to/ffmpeg` to use another build (it needs libx264 and libwebp_anim).

## Staging page

`dev/media.html` and `dev/media.ts`. No harness chrome, English names, fixed states from the derived light fixtures (`test/fixtures/lights.ts`), HA's default light and dark theme variables.

Query parameters: `scene`, `live=1` (do not freeze the clock), `theme` (`light`, `dark`), `lang` (`en`, `nl`, `de`, `fr`, `es`, `it`), `cursor=1` (a pointer for recordings: hidden until `__media.pointer(true)`). The page sets `window.__mediaReady` once fonts and all cards have rendered. Open it with `npm run dev` at `/dev/media.html?scene=<name>`.

## Files

- `run.mjs`: entry point, argument handling, server and browser lifecycle.
- `server.mjs`, `browser.mjs`: Vite server and Playwright browser.
- `stills.mjs`, `animations.mjs`, `demo.mjs`: the three kinds of output.
- `capture.mjs`, `encode.mjs`, `input.mjs`: frame capture, ffmpeg encoding and human-paced pointer input.
