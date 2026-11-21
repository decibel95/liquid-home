# Getting started {#getting-started}

## Requirements {#requirements}

- Home Assistant 2025.1.0 or newer.
- At least one `light` entity.

## Install with HACS {#install-hacs}

1. Open HACS, choose the menu in the top right and pick Custom repositories.
2. Add `https://github.com/decibel95/liquid-home` with the category Dashboard.
3. Install Liquid Home, then reload the browser.

## Install by hand {#install-manual}

1. Download `liquid-home.js` from the latest release.
2. Copy it to `config/www/liquid-home/liquid-home.js`.
3. Under Settings, Dashboards, three dots, Resources add `/local/liquid-home/liquid-home.js` as a JavaScript module.
4. Hard refresh the browser.

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
