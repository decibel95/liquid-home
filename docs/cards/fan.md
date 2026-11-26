# Fan card {#fan}

A full glass card for one fan: a big vertical speed pill, a readout, a power button, oscillate and direction buttons, and a preset chip. Type: `custom:liquid-home-fan-card`. In the card picker it is called "Liquid Home fan card".

<img class="light-only" src="/media/fan-light.png" alt="The fan card in light glass" loading="lazy">
<img class="dark-only" src="/media/fan-dark.png" alt="The fan card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-fan-card
entity: fan.living_room_fan
```

## Behavior {#fan-behavior}

### Kinds of fan {#fan-kinds}

The card shows only what the fan supports.

| Fan | What the card shows |
|-----|---------------------|
| Speed fan | A speed pill. The readout shows the percentage, `Off` or `--` |
| Preset-only fan | A toggle pill instead of the speed pill, and the preset chip |
| On/off-only fan | A toggle pill. The readout says `On` or `Off`, and `Tap to switch` |

- The power button in the header turns the fan on or off. It is disabled while the fan is off and cannot be turned on, and while it is on and cannot be turned off. A fan that supports neither has no power button.
- The Oscillate and Direction buttons (Direction is labelled Reverse and is active while the fan runs in reverse) show only when the fan supports them. With neither, the row is hidden.
- While a preset is active the readout shows the preset name with the label `Preset`, and the pill is empty.
- An off fan ignores the speed it last reported, so a fan that is off reads `Off`.
- An unavailable fan reads `--` and `Unavailable`, and its controls are disabled.
- Keyboard on the speed pill (fans with fewer than 100 speeds): arrow keys move one speed step, Page Up and Page Down about 10 %, at least one step, Home jumps to the lowest step and End to full speed. Arrow Down from the lowest step turns the fan off. On a fan with 100 speeds the keys change the value by 1, Page keys by 10.

### Speed steps {#fan-steps}

Home Assistant fans have a fixed number of speeds (a 3-speed fan, a 6-speed fan). The card snaps what you set to those steps, the same way Home Assistant does, so the value you pick is the value the fan can really use.

- On a 3-speed fan the steps are 33 %, 66 % and 100 % (and off). Dragging to 40 % sets 33 %, dragging to 55 % sets 66 %.
- While you drag, the readout shows the snapped step, not the raw finger position. A drag to 10 % on a 3-speed fan reads `Off`, and sets the fan off on release. The pill fill itself follows your finger.
- A fan with 100 speeds has no snapping, every percentage is a step.
- The tile and room steps (Slower and Faster) move one speed step. Slower is disabled at the lowest step, while the fan is off, and while a preset is active. Faster is disabled while the fan is off and at full speed.

### Presets {#fan-presets}

A fan that supports presets gets a preset chip. Tap it to go to the next preset. After the last preset it wraps back to the first one.

- While the fan is **on**, the chip changes the preset with `fan.set_preset_mode`.
- While the fan is **off**, the chip turns it on with that preset (`fan.turn_on` with the preset). This needs a fan that can be turned on; otherwise the chip is disabled.
- The chip is disabled when the fan is unavailable.
- Hide the chip with `controls.presets: false`.

### How changes are sent {#fan-writes}

- While you drag the pill, writes go out at most once every 300 ms: the first move is sent at once, then one call per 300 ms, and a final call on release if the value differs from the last one sent. Every value is a speed step (`fan.set_percentage`). A drag to 0 waits for the release before it turns the fan off, so a drag that passes through 0 does not switch the fan off on the way.
- A value equal to what is already sent or what Home Assistant reports is not sent again.
- Power, Oscillate, Direction and the preset chip are sent at once.
- The card holds the sent value on the pill until Home Assistant reports it back, or until `write_hold` seconds pass. An older value that arrives late never moves the pill back.
- The fan card, its sheet, the tile and the room card of one fan share one writer.

## Options {#fan-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `fan` entity |
| `name` | entity name | Name in the header |
| `controls.presets` | `true` | Show the preset chip when the fan has presets, see [Presets](#fan-presets) |
| `write_hold` | `10` | Seconds a sent value stays on screen while Home Assistant has not reported it back |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

```yaml
type: custom:liquid-home-fan-card
entity: fan.living_room_fan
name: Ceiling fan
controls:
  presets: false
write_hold: 30
look:
  glass: light
  motion: minimal
```

## Editor groups {#fan-editor}

The visual editor has three tabs. The (?) link beside each opens the matching section here.

### Entity {#fan-entity}

The Setup tab. Pick the fan, and optionally give it a name. Empty uses the entity name. Options: `entity`, `name`.

### Controls {#fan-controls}

Whether the preset chip shows. A fan without presets shows the switch off and disabled. Option: `controls.presets`.

### Show sent value for {#fan-write-hold}

Seconds a sent value stays on screen while the fan has not reported it back. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds.

### Look {#fan-look}

Glass, blur and motion, shared by all Liquid Home cards. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
