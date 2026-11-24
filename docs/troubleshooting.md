# Troubleshooting {#troubleshooting}

## The card does not show {#troubleshooting-not-showing}

Symptoms: "Custom element doesn't exist: liquid-home-light-card", or an empty box where the card should be.

1. Check the resource. Settings, Dashboards, three dots, Resources. There must be an entry for `/local/liquid-home/liquid-home.js` (the Marketplace adds `/local/community/liquid-home/liquid-home.js`, and HACS adds its own path) of type JavaScript module.
2. Check the card type. The four types are `custom:liquid-home-light-card`, `custom:liquid-home-tile`, `custom:liquid-home-badge` and `custom:liquid-home-room`.
3. Hard refresh the browser (Ctrl+F5, or Cmd+Shift+R). Home Assistant caches `/local/` files for a long time: after you replace the file, add a version to the URL, for example `/local/liquid-home/liquid-home.js?v=0.2.1`. The font file picks up the same version.
4. Open the browser console. A load error there names the cause.
5. Check the Home Assistant version. Liquid Home needs 2025.1.0 or newer.

## The page feels slow {#troubleshooting-slow}

Each card draws one blurred glass surface. A dashboard with many cards on a slow device, such as an old tablet, can feel heavy while you scroll or drag. Set `look.blur: 0` to turn the blur off on the cards that matter, or `--lc-blur: 0px` in your theme for all of them. See [Theming](/theming#theming-variables).

## The value jumps back after a change {#troubleshooting-jump}

A slow light can take seconds to report its new value. The card shows the value you sent for `write_hold` seconds (default 10). Raise `write_hold` to 30 or 60, see [show sent value for](/cards/light#light-write-hold).

## The room card is empty {#troubleshooting-room}

With `source: area` the card lists lights whose own area, or whose device area, is the one you chose. Hidden and disabled lights are left out, and so is the `power_entity`. Check the area of the light in Home Assistant, or switch to `source: list` and name the lights.

## Report a problem {#troubleshooting-report}

Open an issue at [GitHub](https://github.com/decibel95/liquid-home/issues) and include the card version and your card config.
