# Tile {#tile}

A compact glass row for one light, cover, fan or media player: an icon button, name and status, and steppers. Type: `custom:liquid-home-tile`. In the card picker it is called "Liquid Home tile".

<img class="light-only" src="/media/tile-light.png" alt="The tile in light glass" loading="lazy">
<img class="dark-only" src="/media/tile-dark.png" alt="The tile in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-tile
entity: light.ceiling_lights
```

The same tile works for a cover, a fan or a media player, only the `entity` changes:

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

### Media players {#tile-media}

- While the player is off, in standby or unknown, the icon is a Power button (`Switch Kitchen`) that turns the player on when it supports turning on, and a disabled Power button when it does not. Otherwise the icon plays or pauses: it sends `media_play` or `media_pause` according to the state, and the label follows the action (`Play, Kitchen` or `Pause, Kitchen`). A player with Play and Pause missing but with turning on and off gets the Power button as its icon, and a player with neither has a disabled icon. The icon is also disabled while the player buffers.
- The steppers lower and raise the volume by 5 % per press, between 0 and 100, and show the volume in percent. Taps are collected as on the light tile, see [How the volume is sent](/cards/media#media-writes). A player that only has volume steps sends one `volume_down` or `volume_up` per tap and shows no percentage. A muted player shows its volume dimmed, and the steppers stay enabled. A player without volume control, and a player that is off or in standby, has no steppers.
- The status line reads `Artist, Title` (`Series, Title` for a TV show, the title alone when there is no second line) while playing, otherwise `Playing`, `Paused`, `Buffering`, `Idle`, `Standby`, `Off`, `On`, `Unavailable` or `Unknown`.
- The icon is a speaker, tinted while the player plays or buffers, or while an on/off-only player is on. While it plays, pauses or buffers and has a cover, the cover is drawn blurred behind the tile, see [Artwork](/cards/media#media-artwork). An unavailable player is dimmed.

### Tap on the name {#tile-tap}

- Tapping the name and status does what `tap_action` says. By default it opens the card of the entity as a sheet, a modal dialog above the dashboard: the [light card](/cards/light), the [cover card](/cards/cover), the [fan card](/cards/fan) or the [media card](/cards/media). Escape, the close button or a click outside closes it.
- The sheet has a history button next to the close button, for lights, covers, fans and media players alike. It closes the sheet and opens the Home Assistant history for that entity.
- The tile, the card in its sheet and any other Liquid Home card on the same entity share one writer, so their changes go out together.

## Options {#tile-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `light`, `cover`, `fan` or `media_player` entity |
| `name` | entity name | Name on the tile |
| `tap_action` | `sheet` | Tap on the name: `sheet` (the card of the entity), `more-info` or `none` |
| `write_hold` | `10` | Seconds a sent value stays on screen while Home Assistant has not reported it back. Passed on to the card in the sheet |
| `controls.modes` | what the light supports | Passed on to the light card sheet: `brightness`, `white`, `colour` |
| `controls.effects` | `true` | Passed on to the light card sheet: the effect chip |
| `controls.presets` | `true` | Passed on to the fan card sheet: the preset chip |
| `controls.sources` | `true` | Passed on to the media card sheet: the Source chip |
| `controls.sound_modes` | `true` | Passed on to the media card sheet: the Sound mode chip |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

Card options can sit in the tile config too and are passed on to the sheet it opens: `controls.modes` and `controls.effects` for a light, `controls.presets` for a fan, `controls.sources` and `controls.sound_modes` for a media player. They change only the sheet, not the tile. The tile itself reads `name`, `tap_action`, `write_hold` and `look`.

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

Pick the light, cover, fan or media player. Option: `entity`. The name field below it is optional and uses the entity name when empty. Option: `name`.

### Tap on the name {#tile-tap-action}

Choices: Open card (`sheet`), More info (`more-info`), Nothing (`none`). Default: `sheet`. Option: `tap_action`.

With `more-info` the tap opens the standard Home Assistant dialog for the entity. With `none` the name is not a button.

### Show sent value for {#tile-write-hold}

Seconds a sent value stays on screen while the entity has not reported it back, for slow devices. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds.

### Look {#tile-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
