# Room card {#room}

One glass card for a room: a header with a power button, one tile per light (and, if you want, per cover and fan) and a strip to control the selected one. Type: `custom:liquid-home-room`. In the card picker it is called "Liquid Home room".

<img class="light-only" src="/media/room-light.png" alt="The room card in light glass" loading="lazy">
<img class="dark-only" src="/media/room-dark.png" alt="The room card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-room
source: area
area: living_room
```

## Behavior {#room-behavior}

- The title is `title`, else the name of the area, else `Lights`. The header also reads how many are on. A room with only lights reads `1 of 3 on`. A room with a cover or a fan reads `3 of 5 active`: lights that are on, covers that are open or moving, and fans that are on.
- By default the room shows lights only, as before. Choose what it shows with `domains`, see [Domains](#room-domains).
- Tap a tile to select that entity. The strip below shows its name and status and the quick controls of its kind: for a light White and Colour buttons when it supports them and brightness steppers (10 % per press); for a cover Open, Stop and Close and 10 % steps; for a fan power, Oscillate and Slower and Faster speed steps. Direction and presets stay on the [fan card](/cards/fan).
- The name in the strip, and the White and Colour buttons, open the card of that entity ([light](/cards/light), [cover](/cards/cover) or [fan](/cards/fan)) as a sheet. The sheet has a history button next to the close button that opens the Home Assistant history for that entity.
- A cover or a fan tile shows the position or speed, `Open`, `Closed`, `On` or `Off`, and a door icon for doors, garage doors and gates. Covers and fans in the strip send their changes the same way as on the tile, and share one writer with the tile and the sheet, so their steps are collected into one call.
- The header power button is for the lights of the room: it turns them off when any is on, and on otherwise, in one service call. With a power entity, its state decides. See [Power entity](#room-power-entity). A room without the `light` domain has no power button.
- With `source: area` the card lists every light, cover and fan (of the domains you chose) in that area, whether the entity or its device is assigned to it, hidden and disabled entities excluded. A card with no area and no entities shows a placeholder that asks you to choose an area. An area without any entity of the chosen domains reads `No devices in this area.` (`No lights in this area.` for a lights-only room).

## Options {#room-options}

| Option | Default | Description |
|--------|---------|-------------|
| `title` | area name | Title in the header |
| `domains` | `[light]` | What the room shows: any of `light`, `cover` and `fan`. Lights only when missing |
| `source` | inferred | `area` or `list`. When missing: a list of entities gives `list`, otherwise `area`. The editor always writes it |
| `area` | | With `source: area`, the area id |
| `entities` | | With `source: list`, the entities in order. Each must be of a domain in `domains`. Each item is an entity id, or `entity` plus an optional `name` |
| `exclude` | `[]` | Entities left out, for both sources. The editor sets it with the per-light switches of an area card |
| `power_entity` | | A light entity, normally a light group. It must exist. Lights only: ignored in a room without lights |
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

A room with lights, covers and fans from one area:

```yaml
type: custom:liquid-home-room
area: living_room
domains: [light, cover, fan]
```

## Editor groups {#room-editor}

### Domains {#room-domains}

Lights, Covers and Fans: what the room shows. Lights only by default. At least one stays picked. With `source: list`, switching a domain off removes the listed entities of that domain, since the card would refuse them. Option: `domains`.

### Source {#room-source}

`area` takes every light in an area, `list` takes the lights you name, in the order you give. Option: `source`. Switching to `list` starts from the lights the area has now, and switching back returns to the area you had.

### Area and lights {#room-lights}

With `source: area` the editor shows an area picker and one switch per entity of the chosen domains in that area. Switching one off adds it to `exclude`. Options: `area`, `exclude`.

With `source: list` each entity is a row with a name field (option `name` of the entry, empty uses the light name), Up and Down buttons to change the order, and Remove. Add an entity in the text field below the rows: it suggests entities of the chosen domains and accepts only existing ones that are not already listed. Options: `entities`.

### Power entity {#room-power-entity}

Optional light group for the header button. It applies to lights only, so it is ignored in a room without lights and the editor hides it then. With it the button sends one `light.turn_on` or `light.turn_off` to that group. Without it, one call goes to all available lights of the card. A power entity is left out of the tiles of an area card, since the button already stands for it. Option: `power_entity`.

### Look {#room-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
