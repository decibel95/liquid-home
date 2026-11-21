# Badge {#badge}

A glass pill with a light icon, the name and one value: the brightness while on, `Off` or `Unavailable`. Type: `custom:liquid-home-badge`. It works as a view badge (Edit dashboard, Badges) and as a card in a grid. In the pickers it is called "Liquid Home badge" and it is listed in both the card picker and the badge picker.

<img class="light-only" src="/media/badge-light.png" alt="The badge in light glass, as a pill and icon only" loading="lazy">
<img class="dark-only" src="/media/badge-dark.png" alt="The badge in dark glass, as a pill and icon only" loading="lazy">

```yaml
badges:
  - type: custom:liquid-home-badge
    entity: light.ceiling_lights
```

## Behavior {#badge-behavior}

- On shows the brightness, for example `71%`, or `On` for a light that only switches on and off. The icon is tinted with the light's colour.
- Off and unavailable are drawn in grey.
- A tap does what `tap_action` says. By default it opens the standard Home Assistant dialog for the light (`more-info`).
- With `icon_only` the badge is a round icon without name and value. Its accessible name still reads the name and the value.

## Options {#badge-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `light` entity |
| `name` | entity name | Name on the badge |
| `tap_action` | `more-info` | Tap on the badge: `more-info`, `sheet` (the light card) or `none` |
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

Pick the light. Option: `entity`. The name field below it is optional and uses the entity name when empty. Option: `name`.

The Icon only switch sits below it. Option: `icon_only`.

### Tap on the badge {#badge-tap-action}

Choices: More info (`more-info`), Open light card (`sheet`), Nothing (`none`). Default: `more-info`. Option: `tap_action`.

With `sheet` the tap opens the [light card](/cards/light) in a sheet. With `none` the badge is not a button.

### Look {#badge-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
