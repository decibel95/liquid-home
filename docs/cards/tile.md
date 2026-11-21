# Tile {#tile}

A compact glass row for one light: power button, name and status, brightness steppers. Type: `custom:liquid-home-tile`. In the card picker it is called "Liquid Home tile".

<img class="light-only" src="/media/tile-light.png" alt="The tile in light glass" loading="lazy">
<img class="dark-only" src="/media/tile-dark.png" alt="The tile in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-tile
entity: light.ceiling_lights
```

## Behavior {#tile-behavior}

- The power button turns the light on or off. While on it is tinted with the light's colour.
- The status line reads `On`, `On, 2631 K` for a light in colour temperature, `Off`, `Unavailable`, or `2 of 3 on` for a light group.
- The steppers lower and raise the brightness by 10 % per press, between 1 % and 100 %. They go through the same 300 ms throttle as the light card, see [How changes are sent](/cards/light#light-writes). A light that only switches on and off has no steppers.
- Tapping the name and status does what `tap_action` says. By default it opens the [light card](/cards/light) as a sheet, a modal dialog above the dashboard. Escape, the close button or a click outside closes it.
- The tile, the light card in its sheet and any other Liquid Home card on the same light share one writer, so their changes go out together.

## Options {#tile-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `light` entity |
| `name` | entity name | Name on the tile |
| `tap_action` | `sheet` | Tap on the name: `sheet` (the light card), `more-info` or `none` |
| `write_hold` | `10` | Seconds a sent value stays on screen while Home Assistant has not reported it back |
| `controls.modes` | what the light supports | Passed on to the light card sheet: `brightness`, `white`, `colour` |
| `controls.effects` | `true` | Passed on to the light card sheet: the effect chip |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

Light card options can sit in the tile config too and are passed on to the sheet it opens: `controls.modes` and `controls.effects` change only the sheet, not the tile. The tile itself reads `name`, `tap_action`, `write_hold` and `look`.

```yaml
type: custom:liquid-home-tile
entity: light.living_room_rgbww_lights
name: Sofa
tap_action: sheet
write_hold: 30
controls:
  modes: [brightness, white]
```

## Editor groups {#tile-editor}

### Entity {#tile-entity}

Pick the light. Option: `entity`. The name field below it is optional and uses the entity name when empty. Option: `name`.

### Tap on the name {#tile-tap-action}

Choices: Open light card (`sheet`), More info (`more-info`), Nothing (`none`). Default: `sheet`. Option: `tap_action`.

With `more-info` the tap opens the standard Home Assistant dialog for the light. With `none` the name is not a button.

### Show sent value for {#tile-write-hold}

Seconds a sent value stays on screen while the light has not reported it back, for slow lights. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds.

### Look {#tile-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
