# Badge {#badge}

A glass pill with the icon of a light, cover or fan, the name and one value, for example the brightness or the position. Type: `custom:liquid-home-badge`. It works as a view badge (Edit dashboard, Badges) and as a card in a grid. In the pickers it is called "Liquid Home badge" and it is listed in both the card picker and the badge picker.

<img class="light-only" src="/media/badge-light.png" alt="The badge in light glass, as a pill and icon only" loading="lazy">
<img class="dark-only" src="/media/badge-dark.png" alt="The badge in dark glass, as a pill and icon only" loading="lazy">

```yaml
badges:
  - type: custom:liquid-home-badge
    entity: light.ceiling_lights
```

## Behavior {#badge-behavior}

- A light shows the brightness while on, for example `71%`, or `On` for a light that only switches on and off. The icon is tinted with the light's colour.
- A cover shows the position, for example `70%`, `Closed`, `Opening` or `Closing`. A cover without a position shows `Open` or `Closed`.
- A fan shows its speed, for example `67%`, the name of the preset, `On` or `Off`.
- Off, closed and unavailable are drawn in grey. In the icon-only badge, a closed cover and a fan that is off are plain glass, without the tint.
- A tap does what `tap_action` says. By default it opens the standard Home Assistant dialog for the entity (`more-info`). With `tap_action: sheet` it opens the card of the entity (light, cover or fan card) in a sheet, with a history button next to the close button.
- A long name is cut short with an ellipsis when it does not fit the badge row of Home Assistant, for example on a narrow phone. Give the badge a shorter `name` to see all of it.
- With `icon_only` the badge is a round icon without name and value. Its accessible name still reads the name and the value.

## Options {#badge-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `light`, `cover` or `fan` entity |
| `name` | entity name | Name on the badge |
| `tap_action` | `more-info` | Tap on the badge: `more-info`, `sheet` (the card of the entity, with History) or `none` |
| `icon_only` | `false` | Show only the round icon |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

```yaml
type: custom:liquid-home-badge
entity: light.ceiling_lights
name: Ceiling
icon_only: true
tap_action: sheet
```

## Editor groups {#badge-editor}

### Entity {#badge-entity}

Pick the light, cover or fan. Option: `entity`. The name field below it is optional and uses the entity name when empty. Option: `name`.

The Icon only switch sits below it. Option: `icon_only`.

### Tap on the badge {#badge-tap-action}

Choices: More info (`more-info`), Open card (`sheet`), Nothing (`none`). Default: `more-info`. Option: `tap_action`.

With `sheet` the tap opens the card of the entity in a sheet: the [light card](/cards/light), [cover card](/cards/cover) or [fan card](/cards/fan), with the history button for that entity. With `none` the badge is not a button.

### Look {#badge-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
