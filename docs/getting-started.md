# Getting started {#getting-started}

## Requirements {#requirements}

- Home Assistant 2025.1.0 or newer.
- At least one `light` entity.

## Install with HACS {#install-hacs}

1. Open HACS, choose the menu in the top right and pick Custom repositories.
2. Add `https://github.com/decibel95/liquid-home` with the category Dashboard.
3. Install Liquid Home, then reload the browser.

## Install by hand {#install-manual}

1. Download all three files from the latest release: `liquid-home.js`, `liquid-inter.woff2` (the Inter font) and `liquid-inter-OFL.txt` (the font licence).
2. Copy all three into the same folder, `config/www/liquid-home/`. The card loads the font from next to itself.
3. Under Settings, Dashboards, three dots, Resources add `/local/liquid-home/liquid-home.js` as a JavaScript module.
4. Hard refresh the browser.

Liquid Home ships the Inter font, so the cards look the same on every device, with no internet connection needed. Without `liquid-inter.woff2` next to `liquid-home.js` the cards still work and fall back to an installed Inter or the system font.

## Add a card {#add-card}

The four cards are in the card picker:

| Picker name | Type |
|-------------|------|
| Liquid Home light card | `custom:liquid-home-light-card` |
| Liquid Home tile | `custom:liquid-home-tile` |
| Liquid Home badge | `custom:liquid-home-badge` |
| Liquid Home room | `custom:liquid-home-room` |

The badge is also in the badge picker (Edit dashboard, Badges). Every card has a visual editor, and the YAML works as well:

```yaml
type: custom:liquid-home-light-card
entity: light.kitchen_lights
```

See the pages of the [light card](/cards/light), [tile](/cards/tile), [badge](/cards/badge) and [room card](/cards/room) for every option.

## Next to Liquid Climate {#next-to-climate}

Liquid Home and Liquid Climate use the same glass and the same theme variables, and run side by side on one dashboard. Each is its own resource.
