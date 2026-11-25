# Liquid Home

Liquid glass cards for Home Assistant lights: a light card, a tile, a badge and a room card.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/decibel95/liquid-home/main/docs/public/media/readme/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/decibel95/liquid-home/main/docs/public/media/readme/hero-light.png">
  <img src="https://raw.githubusercontent.com/decibel95/liquid-home/main/docs/public/media/readme/hero-light.png" alt="The Liquid Home light card, tiles, badges and room card" width="900">
</picture>

<sub>From left to right: light card, tile, badge and room card.</sub>

Requires Home Assistant 2025.1 or newer.

<!-- ha-marketplace:exclude-start -->
## Install

**Home Assistant Marketplace (2026.11 and newer).** Liquid Home is not in the default catalog yet, so add it by link: Settings, Marketplace, **Add from link** in the toolbar, paste `https://github.com/decibel95/liquid-home`, choose the type Dashboard, then **Install** and reload the browser.

**HACS (older versions).** Menu (three dots), Custom repositories, add `https://github.com/decibel95/liquid-home` with the category Dashboard, then download Liquid Home and reload.

**Manual.** Download `liquid-home.js`, `liquid-inter.woff2` and `liquid-inter-OFL.txt` from the [latest release](https://github.com/decibel95/liquid-home/releases/latest) into `/config/www/liquid-home/`. Under Settings, Dashboards, three dots, Resources, add `/local/liquid-home/liquid-home.js` as a JavaScript module and hard refresh. If the card does not update, see [Troubleshooting](https://decibel95.github.io/liquid-home/troubleshooting).
<!-- ha-marketplace:exclude-end -->

## Use

Edit a dashboard, add a card and pick **Liquid Home**. Or in YAML:

```yaml
type: custom:liquid-home-light-card
entity: light.kitchen_lights
```

## Documentation

All options, theming, languages and troubleshooting: [decibel95.github.io/liquid-home](https://decibel95.github.io/liquid-home/).

## License

[MIT](LICENSE). The Liquid Inter font is under the SIL Open Font License 1.1 and the Lucide icons under the ISC license, see [NOTICE](NOTICE).
