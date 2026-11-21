# Liquid Home design archive

Design sources for Liquid Home 0.1.

## Artifacts

- Design canvas: version 24 (design review 1 approved 2026-11-18)
- Clickable prototype: version 2 (design review 2 approved 2026-11-18)

## Gates

- Design review 1 (design canvas): PASSED 2026-11-18
- Design review 2 (clickable prototype): PASSED 2026-11-18
- Design review 3 (phase 0.1 plan): PASSED 2026-11-18

## Folders

- `lh-canvas/project/`: Liquid Home canvas source (`.dc.html` boards: Artwork, ColourVariants, Compare, EntityColour, Foundations, Icons, plus LightCard, LightTiles, LightBadges, LightRoom, LoFi and Slider boards, `canvas.json`).
- `lh-proto/`: Clickable prototype. `index.html` (current, v2), `index.v1.html` (v1), `shots/` (phone and desktop screenshots, light and dark, on/off).
- `calc/`: Contrast and colour calculation scripts and data (`ok.py`, `ok.json`, `c.py`, `var.py`, `v15.py`, `v20.py`, `v315.py`, `art.py`, `entity.json`).
- `lc-canvas/project/`: Liquid Climate canvas source (Cluster, Tile, Badges, States, Package, Setup1 to Setup5 boards, `canvas.json`).
- `lucide-0.460.0/`: Lucide 0.460.0 SVG icons used by the design (13 files: rainbow, sun, flame, battery, blinds, thermometer, pause, lightbulb, fan, speaker, play, door-open, skip-forward).
- `lucide/`: Lucide SVG icon copies, 15 files (the 13 above plus `zap.svg` and `battery-low.svg`). Version not pinned in the folder name.
- `lucide460/`: Lucide 0.460.0 SVG copies, 13 files (rainbow, sun, flame, battery, zap, blinds, thermometer, pause, lightbulb, battery-low, speaker, play, skip-forward). Lacks `fan.svg` and `door-open.svg` compared with `lucide-0.460.0/`.
- `chk/`: Check fixtures (`Compare.js`, `LightCardDark.js`, `LightCardLight.js`).
- `pubread/`: `index.html` (public read copy of the prototype).
- `artifact-files/`: Artifact-side files from the design session (one artifact directory, `artifact-type`).

Loose files at the archive root (`*.py`, `*.txt`): scripts and text notes from the design session (`rv.py`, `rv2.py`, `alt.py`, `knob.py`, `k2.py`, `ct.py`, `fix15.py`, `fix15b.py`, `v21.py`, `v2.txt`, `lh_colors.txt`, `lc_colors.txt`, `lh2.txt`, `lhn.txt`, `lh_set.txt`, `lcn.txt`, `devc.txt`, `ids_canvas.txt`, `ids_items.txt`). Contents not reviewed in P0.

## Restored items

None. All required items were present in the archive at P0 check time (2026-11-18). No file was fetched from the Lucide CDN or the artifacts.

## Copy notes (P4, secret scan)

This folder is a copy of the design archive made for the Liquid Home repository. Before copying, every file was scanned for: JWT-shaped tokens (`eyJ...`), the literal long-lived token and the literal login of the local test Home Assistant (compared by value, never printed), and the keywords `Authorization`, `password`, `token`, `secret`, `api_key`, `bearer`, `username`.

Result: no secret found. Keyword hits were only design prose ("design token", "existing token") and Lucide licence comments.

Excluded from the copy:
- `artifact-files/`: a third-party design tooling reference (`craft.md`) from the design session, not Liquid Home design material (it also contains em-dashes, which this repository does not allow). Its line was removed from `MANIFEST.sha256`.
