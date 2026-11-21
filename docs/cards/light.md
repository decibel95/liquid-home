# Light card {#light}

A full glass card for one light: a big vertical brightness pill, a readout, and mode buttons for white and colour. Type: `custom:liquid-home-light-card`. In the card picker it is called "Liquid Home light card".

<img class="light-only" src="/media/light-light.png" alt="The light card in light glass" loading="lazy">
<img class="dark-only" src="/media/light-dark.png" alt="The light card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-light-card
entity: light.kitchen_lights
```

## Behavior {#light-behavior}

- Drag the pill to set the brightness. The drag is relative: the value moves by how far the pointer moves from where you grabbed, so a tap on the pill does not jump to that spot. On a light that only switches on and off, a drag or tap toggles it.
- Keyboard: arrow keys change the value by 1, Page Up and Page Down by 10, Home and End jump to the ends.
- The mode buttons below the pill switch what the pill sets: Brightness, White (colour temperature) and Colour (hue). A mode shows only when the light supports it.
- A light with an effect list gets an effect chip. A light group shows one chip per member.
- The power button in the header turns the light on or off.
- An unavailable light reads Unavailable, and its power, mode and effect buttons are disabled.

<img src="/media/light-drag.webp" alt="Dragging the brightness pill up and back down" loading="lazy">

### How changes are sent {#light-writes}

- While you drag, the card shows the new value at once. Writes go out at most once every 300 ms: the first move is sent immediately, then one call per 300 ms, and a final call on release if the value differs from the last one sent. The 300 ms is fixed.
- The card holds the sent value on screen until Home Assistant reports it back, or until `write_hold` seconds pass. An older value that arrives late never moves the pill back.
- Releasing the pill at 0 % turns the light off with `light.turn_off` instead of sending a brightness.
- The light card, the tile, the badge sheet and the room card share one writer per light, so two cards on the same light never fight each other.

## Options {#light-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `light` entity |
| `name` | entity name | Name in the header |
| `controls.modes` | what the light supports | List of `brightness`, `white`, `colour`. Modes the light does not support are ignored |
| `controls.effects` | `true` | Show the effect chip when the light has an effect list |
| `write_hold` | `10` | Seconds a sent value stays on screen while Home Assistant has not reported it back |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

```yaml
type: custom:liquid-home-light-card
entity: light.living_room_rgbww_lights
name: Sofa
controls:
  modes: [brightness, white]
  effects: false
write_hold: 30
look:
  glass: dark
  blur: 40
  motion: subtle
```

## Editor groups {#light-editor}

The visual editor has three tabs. The (?) link beside each opens the matching section here.

### Entity {#light-entity}

The Setup tab. Pick the light. Option: `entity`.

### Name {#light-name}

Empty uses the entity name. Option: `name`.

### Controls {#light-controls}

Which modes the card offers and whether the effect chip shows. Options: `controls.modes`, `controls.effects`.

### Show sent value for {#light-write-hold}

Seconds a sent value stays on screen while the light has not reported it back, for slow lights. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds.

### Look {#light-look}

Glass, blur and motion, shared by all Liquid Home cards. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
