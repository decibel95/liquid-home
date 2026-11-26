# Cover card {#cover}

A full glass card for one cover: a big vertical position pill, a readout, and buttons to open, stop and close. Type: `custom:liquid-home-cover-card`. In the card picker it is called "Liquid Home cover card".

<img class="light-only" src="/media/cover-light.png" alt="The cover card in light glass" loading="lazy">
<img class="dark-only" src="/media/cover-dark.png" alt="The cover card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-cover-card
entity: cover.living_room_window
```

<img src="/media/cover-drag.webp" alt="Dragging the position pill up and back down" loading="lazy">

## Behavior {#cover-behavior}

### Kinds of cover {#cover-kinds}

The card shows only what the cover supports.

| Cover | What the card shows |
|-------|---------------------|
| Position cover | A position pill (0 % closed, 100 % open), and the Open, Stop and Close buttons the cover supports |
| Tilt cover (tilt only, no position) | A tilt pill, with Open tilt, Stop tilt and Close tilt |
| Position and tilt | The position pill with two mode buttons, Position and Tilt, that switch what the pill and the buttons control. The card starts in Position. The mode belongs to that card and is not saved |
| Toggle cover (no position, for example a garage door) | A pill that toggles the cover, and Open, Stop and Close buttons. The readout says `Open`, `Closed`, `Opening` or `Closing`, and `Tap to switch` |

- Each of Open, Stop and Close shows only when the cover supports it. A toggle cover without Stop (a garage door, for example) has no button row at all.
- Open is disabled when the cover is already fully open or is opening, and Close when it is fully closed or closing. A cover with `assumed_state` never has Open or Close disabled, because the card cannot know where it is.
- Stop is tinted while the cover moves.
- While a toggle cover moves, the pill is full and a tap stops it (when the cover supports Stop). Without Stop the pill is disabled while moving.
- The header has the device icon and the name, and no power button. Doors, garage doors and gates get a door icon; every other cover gets a blinds icon.
- An unavailable cover reads `--` with the line `Unavailable`, and its controls are disabled.
- Keyboard on the pill: arrow keys change the value by 1, Page Up and Page Down by 10, Home and End jump to 0 and 100.

### How changes are sent {#cover-writes}

A cover moves slowly, so the card does not send a value while you drag.

- **Pill:** drag the pill and let go. The card sends one `cover.set_cover_position` (in Tilt mode `cover.set_cover_tilt_position`) when you release, with the rounded value. If you let go where you started, nothing is sent. With the keyboard, one call goes out when you release the key, not for every key repeat.
- **Open, Stop, Close, toggle, tilt buttons and the tile icon:** sent at once. They also cancel any value the card still holds or is about to send.
- **Steps on the tile and the room card:** each tap moves the position 10 % from where the cover is going (the value you stepped to, else the held value, else the target while moving, else the position). Taps are collected: one call goes out 500 ms after the last tap, so three taps give one call. A tilt cover steps its tilt.
- The cover card, its sheet, the tile and the room card of one cover share one writer, so steps and drags from different cards end up in one queue.

### What stays on the pill {#cover-hold}

After you send a position, the pill keeps showing that position (the sent value) while the cover travels, so it does not jump back and forth. The readout and the line under the name follow the real position that Home Assistant reports. The hold ends when the first of these happens:

1. Home Assistant reports exactly the position you sent.
2. The cover moved and has stopped moving.
3. You send another command.
4. `write_hold` seconds pass after the **last movement**. Each reported change of the position starts the time again, so a cover that takes 30 s to travel keeps the hold the whole way.
5. The cover never started moving, Home Assistant has reported its state again, and 400 ms have passed since you sent the value.

While the pill and the real position differ, a screen reader hears the sent value and the real one, for example "40 %, now 25 %".

**A cover that rounds your request.** Some covers only stop at certain positions, for example every 10 %. You send 43, the cover goes to 40. When it arrives, the pill settles from 43 to 40: a few points of jump at the end of the travel. The card shows what the cover reports, so this is expected. Tilt has no moving state, so a tilt value stays on the pill until it is reported or you send another command, and settles `write_hold` seconds (default 10) after its last change at the latest.

## Options {#cover-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `cover` entity |
| `name` | entity name | Name in the header |
| `write_hold` | `10` | Seconds the sent position stays on the pill after the last movement, see [What stays on the pill](#cover-hold) |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming) |
| `config_version` | `1` | Written by the editor |

```yaml
type: custom:liquid-home-cover-card
entity: cover.living_room_window
name: Window
write_hold: 30
look:
  glass: dark
  blur: 40
  motion: subtle
```

## Editor groups {#cover-editor}

The visual editor has three tabs. The (?) link beside each opens the matching section here.

### Entity {#cover-entity}

The Setup tab. Pick the cover, and optionally give it a name. Empty uses the entity name. Options: `entity`, `name`.

### Controls {#cover-controls}

The Controls tab holds one setting, how long the sent position stays on the pill. See [Show sent value for](#cover-write-hold).

### Show sent value for {#cover-write-hold}

Seconds the sent position stays on the pill after the cover last moved. Raise it for a cover that is slow to report. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds. See [What stays on the pill](#cover-hold).

### Look {#cover-look}

Glass, blur and motion, shared by all Liquid Home cards. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
