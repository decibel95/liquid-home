# Liquid Home

Glass cards for Home Assistant lights: a light card, a tile, a badge and a room card, each with a visual editor.

Status: first release, version 0.1.0.

Documentation: https://decibel95.github.io/liquid-home

## Cards

| Card | Type |
|---|---|
| Light card | `custom:liquid-home-light-card` |
| Tile | `custom:liquid-home-tile` |
| Badge | `custom:liquid-home-badge` |
| Room card | `custom:liquid-home-room` |

## Install

With HACS: add `https://github.com/decibel95/liquid-home` as a custom repository with the category Dashboard, install Liquid Home and reload the browser.

By hand: download `liquid-home.js` from the latest release, copy it to `config/www/liquid-home/` and add `/local/liquid-home/liquid-home.js` as a JavaScript module resource.

Requires Home Assistant 2025.1.0 or newer.

## Languages

English, Dutch, German, French, Spanish and Italian. See [CONTRIBUTING-translations.md](CONTRIBUTING-translations.md).

## Development

```
npm ci
npm run dev        # dev harness with fake lights at http://localhost:5198/dev/
npm run typecheck
npm test
npm run build      # dist/liquid-home.js
npm run size       # raw and gzip size against the budget
npm run docs:dev
```

Liquid Home builds on the shared library [liquid-core](https://github.com/decibel95/liquid-core), which comes from npm as [@decibel95/liquid-core](https://www.npmjs.com/package/@decibel95/liquid-core) and is bundled into `liquid-home.js`.

## License

MIT. Icons are from [Lucide](https://lucide.dev) (ISC), see [NOTICE](NOTICE).
