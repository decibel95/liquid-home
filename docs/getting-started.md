# Getting started {#getting-started}

## Requirements {#requirements}

- Home Assistant 2025.1.0 or newer.
- At least one `light`, `cover`, `fan` or `media_player` entity.

## Install {#install-hacs}

The resource `/local/community/liquid-home/liquid-home.js` is added automatically.

### Marketplace (Home Assistant 2026.11 and newer) {#install-marketplace}

Home Assistant 2026.11 and newer has a built-in Marketplace under Settings, Marketplace (for administrators).

<img class="light-only" src="/media/readme/marketplace-entry-light.png" alt="The Home Assistant Settings page with the Marketplace entry" loading="lazy">
<img class="dark-only" src="/media/readme/marketplace-entry-dark.png" alt="The Home Assistant Settings page with the Marketplace entry" loading="lazy">

1. Open Settings, Marketplace. The first time, read "Before you install from the Marketplace", tick "I understand the risks and agree" and select Continue.
2. Search for **Liquid Home**, or use the [Open in Home Assistant](https://my.home-assistant.io/redirect/hacs_repository/?owner=decibel95&repository=liquid-home&category=plugin) link.
3. Select Install, then reload the browser.

The Marketplace downloads all three release files into `/config/www/community/liquid-home/` and adds the dashboard resource for you. If your dashboards use YAML resources (`lovelace: resource_mode: yaml`), it does not add the resource: add `/local/community/liquid-home/liquid-home.js` yourself, as a JavaScript module. The install dialog shows the exact URL to add.

### HACS (older Home Assistant) {#install-hacs-classic}

1. Open HACS and search for **Liquid Home**.
2. Download it.
3. Reload the browser.

### Add by link (fallback) {#install-by-link}

If Liquid Home does not show up in the search, add it as a custom repository.

- Marketplace: select **Add from link** at the top right (it needs a GitHub connection; the Marketplace asks you to connect GitHub if you have not yet). Enter `https://github.com/decibel95/liquid-home` and choose the type Dashboard.
- HACS: open the menu (three dots), choose Custom repositories, enter the same URL with the category Dashboard, then download Liquid Home.

## Install by hand {#install-manual}

1. Download all three files from the latest release: `liquid-home.js`, `liquid-inter.woff2` (the Inter font) and `liquid-inter-OFL.txt` (the font licence).
2. Copy all three into the same folder, `config/www/liquid-home/`. The card loads the font from next to itself.
3. Under Settings, Dashboards, three dots, Resources add `/local/liquid-home/liquid-home.js` as a JavaScript module.
4. Hard refresh the browser.

Liquid Home ships the Inter font, so the cards look the same on every device, with no internet connection needed. Without `liquid-inter.woff2` next to `liquid-home.js` the cards still work and fall back to an installed Inter or the system font.

## Add a card {#add-card}

The seven cards are in the card picker:

| Picker name | Type |
|-------------|------|
| Liquid Home light card | `custom:liquid-home-light-card` |
| Liquid Home cover card | `custom:liquid-home-cover-card` |
| Liquid Home fan card | `custom:liquid-home-fan-card` |
| Liquid Home media card | `custom:liquid-home-media-card` |
| Liquid Home tile | `custom:liquid-home-tile` |
| Liquid Home badge | `custom:liquid-home-badge` |
| Liquid Home room | `custom:liquid-home-room` |

The tile, badge and room card take lights, covers, fans and media players. The badge is also in the badge picker (Edit dashboard, Badges). Every card has a visual editor, and the YAML works as well:

```yaml
type: custom:liquid-home-light-card
entity: light.kitchen_lights
```

See the pages of the [light card](/cards/light), [cover card](/cards/cover), [fan card](/cards/fan), [media card](/cards/media), [tile](/cards/tile), [badge](/cards/badge) and [room card](/cards/room) for every option.

## Next to Liquid Climate {#next-to-climate}

[Liquid Climate](https://github.com/decibel95/liquid-climate) is the sister card set: glass cards for climate entities, water heaters and humidifiers. Liquid Home and Liquid Climate use the same glass, the same theme variables and the same Inter font, and run side by side on one dashboard. Each is its own resource, so you can install one or both.

The shared parts (the glass, the pill, the sheet, the font and the shared translations) live in the [liquid-core](https://github.com/decibel95/liquid-core) library. It comes from npm as [@decibel95/liquid-core](https://www.npmjs.com/package/@decibel95/liquid-core) and is bundled into `liquid-home.js`, so there is nothing extra to install.
