# Room card {#room}

One glass card for all lights of a room: a header with a power button, one tile per light and a strip to control the selected light. Type: `custom:liquid-home-room`. In the card picker it is called "Liquid Home room".

<img class="light-only" src="/media/room-light.png" alt="The room card in light glass" loading="lazy">
<img class="dark-only" src="/media/room-dark.png" alt="The room card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-room
source: area
area: living_room
```

## Behavior {#room-behavior}

- The title is `title`, else the name of the area, else `Lights`. The header also reads how many lights are on, for example `1 of 3 on`.
- Tap a tile to select that light. The strip below shows its name and status, White and Colour buttons when the light supports them, and brightness steppers (10 % per press).
- The name in the strip, and the White and Colour buttons, open the [light card](/cards/light) as a sheet for that light.
- The header power button turns the room off when any light is on, and on otherwise, in one service call. With a power entity, its state decides. See [Power entity](#room-power-entity).
- With `source: area` the card lists every light in that area, whether the light or its device is assigned to it, hidden and disabled lights excluded. A card with no area and no entities shows a placeholder that asks you to choose an area.

## Options {#room-options}

| Option | Default | Description |
|--------|---------|-------------|
| `title` | area name | Title in the header |
| `source` | inferred | `area` or `list`. When missing: a list of entities gives `list`, otherwise `area`. The editor always writes it |
| `area` | | With `source: area`, the area id |
| `entities` | | With `source: list`, the lights in order. Each item is an entity id, or `entity` plus an optional `name` |
| `exclude` | `[]` | Lights left out, for both sources. The editor sets it with the per-light switches of an area card |
| `power_entity` | | A light entity, normally a light group. It must exist |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

```yaml
type: custom:liquid-home-room
title: Living Room
source: list
power_entity: light.living_room_lights
entities:
  - light.ceiling_lights
  - entity: light.living_room_rgbww_lights
    name: Sofa
```

## Editor groups {#room-editor}

### Source {#room-source}

`area` takes every light in an area, `list` takes the lights you name, in the order you give. Option: `source`. Switching to `list` starts from the lights the area has now, and switching back returns to the area you had.

### Area and lights {#room-lights}

With `source: area` the editor shows an area picker and one switch per light in that area. Switching a light off adds it to `exclude`. Options: `area`, `exclude`.

With `source: list` each light is a row with a name field (option `name` of the entry, empty uses the light name), Up and Down buttons to change the order, and Remove. Add a light in the text field below the rows: it suggests lights and accepts only existing lights that are not already listed. Options: `entities`.

### Power entity {#room-power-entity}

Optional light group for the header button. With it the button sends one `light.turn_on` or `light.turn_off` to that group. Without it, one call goes to all available lights of the card. A power entity is left out of the tiles of an area card, since the button already stands for it. Option: `power_entity`.

### Look {#room-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
