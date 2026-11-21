# Theming {#theming}

All four cards use the same glass and the same theme variables as [Liquid Climate](https://decibel95.github.io/liquid-climate). One theme setting moves both products together. card-mod is not required.

## Look options {#theming-look}

Set on every Liquid Home card under `look`:

| Option | Default | Description |
|--------|---------|-------------|
| `glass` | `theme` | `theme` picks dark glass when Home Assistant is in dark mode, or when the theme has a dark background colour, and light glass otherwise. `dark` or `light` forces one |
| `blur` | `30` | Backdrop blur in px. `0` turns the blur off |
| `motion` | `rich` | `rich`, `subtle` or `minimal` |

```yaml
type: custom:liquid-home-light-card
entity: light.kitchen_lights
look:
  glass: dark
  blur: 40
  motion: subtle
```

There is no `look.tint`. Liquid Home cards draw no mode tint on the glass, so the option does not exist.

## Light and dark {#theming-glass}

The same card in both glass styles.

<img class="light-only" src="/media/light-light.png" alt="The light card in light glass" loading="lazy">
<img class="dark-only" src="/media/light-dark.png" alt="The light card in dark glass" loading="lazy">

## Blur {#theming-blur}

The blur costs rendering time on slow devices. `look.blur: 0` turns it off. See [Troubleshooting](/troubleshooting#troubleshooting-slow).

## Motion {#theming-motion}

`minimal` removes the fill transition of the pill and the sheet animation.

## CSS variables {#theming-variables}

Set these in your Home Assistant theme (or on a card with card-mod). They are the `--lc-*` names Liquid Climate reads, so one theme styles both products:

| Variable | Effect |
|----------|--------|
| `--lc-blur` | Backdrop blur, for example `30px`, overrides `look.blur` |
| `--lc-radius` | Card corner radius. Defaults: light card `40px`, tile `26px`, room card `36px`. The badge does not use it |
| `--lc-tint` | No effect on Liquid Home cards. It still tints Liquid Climate's dial |

A theme example:

```yaml
my-glass-theme:
  lc-blur: 24px
  lc-radius: 28px
```

Home Assistant turns each theme key into a CSS variable with the `--` prefix, so `lc-radius` becomes `--lc-radius`.
