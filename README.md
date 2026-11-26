# Liquid Home

Liquid glass cards for Home Assistant lights, covers and fans: a light card, a cover card, a fan card, a tile, a badge and a room card.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/decibel95/liquid-home/main/docs/public/media/readme/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/decibel95/liquid-home/main/docs/public/media/readme/hero-light.png">
  <img src="https://raw.githubusercontent.com/decibel95/liquid-home/main/docs/public/media/readme/hero-light.png" alt="The Liquid Home light, cover and fan cards, tiles, badges and room card" width="900">
</picture>

<sub>From left to right: light card, cover card, fan card, tile and badge, and room card.</sub>

Requires Home Assistant 2025.1 or newer.

<!-- ha-marketplace:exclude-start -->
## Install

[![Open in Home Assistant](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=decibel95&repository=liquid-home&category=plugin)

**Home Assistant Marketplace (2026.11 and newer).** Open Settings, Marketplace, search for **Liquid Home** and install it. The dashboard resource is added for you.

**HACS (older versions).** Search for **Liquid Home** in HACS, download it and reload the browser.

If the search does not find it, add `https://github.com/decibel95/liquid-home` from a link (Marketplace: **Add from link**, type Dashboard) or as a custom repository in HACS (category Dashboard).

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
