# Troubleshooting {#troubleshooting}

## The card does not show {#troubleshooting-not-showing}

Symptoms: "Custom element doesn't exist: liquid-home-light-card", or an empty box where the card should be.

1. Check the resource. Settings, Dashboards, three dots, Resources. There must be an entry for `/local/liquid-home/liquid-home.js` (the Marketplace adds `/local/community/liquid-home/liquid-home.js`, and HACS adds its own path) of type JavaScript module.
2. Check the card type. The six types are `custom:liquid-home-light-card`, `custom:liquid-home-cover-card`, `custom:liquid-home-fan-card`, `custom:liquid-home-tile`, `custom:liquid-home-badge` and `custom:liquid-home-room`.
3. Hard refresh the browser (Ctrl+F5, or Cmd+Shift+R). Home Assistant caches `/local/` files for a long time: after you replace the file, add a version to the URL, for example `/local/liquid-home/liquid-home.js?v=0.3.0`. The font file picks up the same version.
4. Open the browser console. A load error there names the cause.
5. Check the Home Assistant version. Liquid Home needs 2025.1.0 or newer.

## The page feels slow {#troubleshooting-slow}

Each card draws one blurred glass surface. A dashboard with many cards on a slow device, such as an old tablet, can feel heavy while you scroll or drag. Set `look.blur: 0` to turn the blur off on the cards that matter, or `--lc-blur: 0px` in your theme for all of them. See [Theming](/theming#theming-variables).

## The value jumps back after a change {#troubleshooting-jump}

A slow light can take seconds to report its new value. The card shows the value you sent for `write_hold` seconds (default 10). Raise `write_hold` to 30 or 60, see [show sent value for](/cards/light#light-write-hold).

## A cover or fan shows a different value than I set {#troubleshooting-snap}

A cover that only stops at certain positions (for example every 10 %) rounds your request, so the pill settles a few points at arrival, see [cover card](/cards/cover#cover-hold). A fan has a fixed number of speeds: the card snaps to them, so on a 3-speed fan 40 % becomes 33 %, see [speed steps](/cards/fan#fan-steps). Both are what the device really does.

## The room card is empty, or shows no covers or fans {#troubleshooting-room}

With `source: area` the card lists entities whose own area, or whose device area, is the one you chose. A room shows lights only unless you set `domains`: add `cover` and `fan`, see [Domains](/cards/room#room-domains). Hidden and disabled entities are left out, and so is the `power_entity`. Check the area of the entity in Home Assistant, or switch to `source: list` and name the entities.

## A long badge name is cut off {#troubleshooting-badge-name}

In the badge row of Home Assistant a name that does not fit is cut short with an ellipsis. Set a shorter `name` on the badge.

## Report a problem {#troubleshooting-report}

Open an issue at [GitHub](https://github.com/decibel95/liquid-home/issues) and include the card version and your card config.

## Development {#development}

Translations are welcome, see [Languages](/languages). To work on the cards:

```
npm ci
npm run dev        # dev harness with fake lights at http://localhost:5198/dev/
npm run typecheck
npm test
npm run build      # dist/liquid-home.js, plus liquid-inter.woff2 and liquid-inter-OFL.txt from liquid-core
npm run size       # raw and gzip size against the budget
npm run docs:dev
```
