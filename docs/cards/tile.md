# Tile {#tile}

A compact glass row for one light, cover or fan: an icon button, name and status, and steppers. Type: `custom:liquid-home-tile`. In the card picker it is called "Liquid Home tile".

<img class="light-only" src="/media/tile-light.png" alt="The tile in light glass" loading="lazy">
<img class="dark-only" src="/media/tile-dark.png" alt="The tile in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-tile
entity: light.ceiling_lights
```

The same tile works for a cover or a fan, only the `entity` changes:

```yaml
type: custom:liquid-home-tile
entity: cover.living_room_window
```

## Behavior {#tile-behavior}

### Lights {#tile-lights}

- The icon button turns the light on or off. While on it is tinted with the light's colour.
- The status line reads `On`, `On, 2631 K` for a light in colour temperature, `Off`, `Unavailable`, or `2 of 3 on` for a light group.
- The steppers lower and raise the brightness by 10 % per press, between 1 % and 100 %. They go through the same 300 ms throttle as the light card, see [How changes are sent](/cards/light#light-writes). A light that only switches on and off has no steppers.

### Covers {#tile-covers}

- The icon button toggles the cover: it opens a closed cover and closes an open one. It does this only for a cover that supports both Open and Close. A tilt-only cover toggles its tilt instead (when it supports Open tilt and Close tilt).
- While the cover moves, the icon button stops it. If the cover has no way to toggle, or no Stop, the icon is the Stop button: it is enabled while the cover moves and the cover supports Stop, and disabled otherwise. It never turns into something else, so nothing appears or disappears on the tile.
- The tile has no separate Stop button. Stop is always the icon. The [cover card](/cards/cover) and the [room card](/cards/room) have their own Stop.
- The steppers read Close 10 % and Open 10 % (Close tilt 10 % and Open tilt 10 % on a tilt-only cover). Each tap moves 10 % from where the cover is going, and the taps are collected: one call goes out 500 ms after the last tap. A cover that only toggles (no position), and a tilt-only cover that cannot set its tilt position, has no steppers. See [How changes are sent](/cards/cover#cover-writes).
- The status line reads `Open`, `Closed`, `Opening`, `Closing` or `Unavailable`, with the tilt added when the cover reports one, for example `Open, tilt 50%`.
- The icon is a blinds icon, or a door icon for doors, garage doors and gates. It is tinted while the cover is open or moving, and plain while closed.

### Fans {#tile-fans}

- The icon button turns the fan on or off. A fan that supports neither turning on nor off has an icon that is not a button.
- The steppers read Slower and Faster and move one speed step, see [Speed steps](/cards/fan#fan-steps). Slower is disabled at the lowest step and while a preset is active, Faster at full speed, and Slower and Faster are disabled while the fan is off. A fan without speeds (on/off or presets only) has no steppers. Taps go through the same 300 ms throttle as the fan card.
- The status line reads `On`, `On, oscillating`, `On, reverse`, `On, oscillating, reverse`, the preset name, `Off` or `Unavailable`.
- The icon is a fan icon, tinted while the fan is on.

### Tap on the name {#tile-tap}

- Tapping the name and status does what `tap_action` says. By default it opens the card of the entity as a sheet, a modal dialog above the dashboard: the [light card](/cards/light), the [cover card](/cards/cover) or the [fan card](/cards/fan). Escape, the close button or a click outside closes it.
- The sheet has a history button next to the close button, for lights, covers and fans alike. It closes the sheet and opens the Home Assistant history for that entity.
- The tile, the card in its sheet and any other Liquid Home card on the same entity share one writer, so their changes go out together.

## Options {#tile-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `light`, `cover` or `fan` entity |
| `name` | entity name | Name on the tile |
| `tap_action` | `sheet` | Tap on the name: `sheet` (the card of the entity), `more-info` or `none` |
| `write_hold` | `10` | Seconds a sent value stays on screen while Home Assistant has not reported it back. Passed on to the card in the sheet |
| `controls.modes` | what the light supports | Passed on to the light card sheet: `brightness`, `white`, `colour` |
| `controls.effects` | `true` | Passed on to the light card sheet: the effect chip |
| `controls.presets` | `true` | Passed on to the fan card sheet: the preset chip |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

Card options can sit in the tile config too and are passed on to the sheet it opens: `controls.modes` and `controls.effects` for a light, `controls.presets` for a fan. They change only the sheet, not the tile. The tile itself reads `name`, `tap_action`, `write_hold` and `look`.

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

Pick the light, cover or fan. Option: `entity`. The name field below it is optional and uses the entity name when empty. Option: `name`.

### Tap on the name {#tile-tap-action}

Choices: Open card (`sheet`), More info (`more-info`), Nothing (`none`). Default: `sheet`. Option: `tap_action`.

With `more-info` the tap opens the standard Home Assistant dialog for the entity. With `none` the name is not a button.

### Show sent value for {#tile-write-hold}

Seconds a sent value stays on screen while the entity has not reported it back, for slow devices. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds.

### Look {#tile-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
