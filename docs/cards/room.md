# Room card {#room}

One glass card for a room: a header with a power button, one tile per light (and, if you want, per cover, fan and media player) and a strip to control the selected one. Type: `custom:liquid-home-room`. In the card picker it is called "Liquid Home room".

<img class="light-only" src="/media/room-light.png" alt="The room card in light glass" loading="lazy">
<img class="dark-only" src="/media/room-dark.png" alt="The room card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-room
source: area
area: living_room
```

## Behavior {#room-behavior}

- The title is `title`, else the name of the area, else `Lights`. The header also reads how many are on. A room with only lights reads `1 of 3 on`. A room with a cover, a fan or a media player reads `3 of 5 active`: lights that are on, covers that are open or moving, fans that are on, and media players that are playing or buffering (a player that only switches on and off counts when it is on).
- By default the room shows lights only, as before. Choose what it shows with `domains`, see [Domains](#room-domains).
- Tap a tile to select that entity. The strip below shows its name and status and the quick controls of its kind: for a light White and Colour buttons when it supports them and brightness steppers (10 % per press); for a cover Open, Stop and Close and 10 % steps; for a fan power, Oscillate and Slower and Faster speed steps; for a media player Previous, Play or Pause and Next (each when the player supports it) and volume steps of 5 %. Direction and presets stay on the [fan card](/cards/fan). Mute, Source, Sound mode and Power stay on the [media card](/cards/media): an off player is turned on from its sheet.
- The name in the strip, and the White and Colour buttons, open the card of that entity ([light](/cards/light), [cover](/cards/cover), [fan](/cards/fan) or [media](/cards/media)) as a sheet. The sheet has a history button next to the close button that opens the Home Assistant history for that entity.
- A media player tile shows the volume in percent while the player is on and can set its volume, otherwise the state word, with the tile status line under it. The speaker is tinted while it plays. A tile has no artwork. Media players send their changes through the same writer as the media card, so the strip, the tile and the sheet share one queue.
- A cover or a fan tile shows the position or speed, `Open`, `Closed`, `On` or `Off`, and a door icon for doors, garage doors and gates. Covers and fans in the strip send their changes the same way as on the tile, and share one writer with the tile and the sheet, so their steps are collected into one call.
- The header power button is for the lights of the room: it turns them off when any is on, and on otherwise, in one service call. With a power entity, its state decides. See [Power entity](#room-power-entity). A room without the `light` domain has no power button.
- With `source: area` the card lists every light, cover, fan and media player (of the domains you chose) in that area, whether the entity or its device is assigned to it, hidden and disabled entities excluded. A media player without an area (many demo and custom players have none) is not listed, see [Troubleshooting](/troubleshooting#troubleshooting-room). A card with no area and no entities shows a placeholder that asks you to choose an area. An area without any entity of the chosen domains reads `No devices in this area.` (`No lights in this area.` for a lights-only room).

## Options {#room-options}

| Option | Default | Description |
|--------|---------|-------------|
| `title` | area name | Title in the header |
| `domains` | `[light]` | What the room shows: any of `light`, `cover`, `fan` and `media_player`. Lights only when missing |
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

A room with lights, covers, fans and media players from one area:

```yaml
type: custom:liquid-home-room
area: living_room
domains: [light, cover, fan, media_player]
```

## Editor groups {#room-editor}

### Domains {#room-domains}

Lights, Covers, Fans and Media players: what the room shows. Lights only by default. At least one stays picked. With `source: list`, switching a domain off removes the listed entities of that domain, since the card would refuse them. Option: `domains`.

### Source {#room-source}

`area` takes every light in an area, `list` takes the lights you name, in the order you give. Option: `source`. Switching to `list` starts from the lights the area has now, and switching back returns to the area you had.

### Area and lights {#room-lights}

With `source: area` the editor shows an area picker and one switch per entity of the chosen domains in that area. Switching one off adds it to `exclude`. Options: `area`, `exclude`.

With `source: list` each entity is a row with a name field (option `name` of the entry, empty uses the light name), Up and Down buttons to change the order, and Remove. Add an entity in the text field below the rows: it suggests entities of the chosen domains and accepts only existing ones that are not already listed. Options: `entities`.

### Power entity {#room-power-entity}

Optional light group for the header button. It applies to lights only, so it is ignored in a room without lights and the editor hides it then. With it the button sends one `light.turn_on` or `light.turn_off` to that group. Without it, one call goes to all available lights of the card. A power entity is left out of the tiles of an area card, since the button already stands for it. Option: `power_entity`.

### Look {#room-look}

Glass, blur and motion. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
