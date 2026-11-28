# Media card {#media}

A full glass card for one media player: the artwork blurred behind the glass, the track, a position bar, a big vertical volume pill and playback buttons. Type: `custom:liquid-home-media-card`. In the card picker it is called "Liquid Home media card".

<img class="light-only" src="/media/media-light.png" alt="The media card in light glass" loading="lazy">
<img class="dark-only" src="/media/media-dark.png" alt="The media card in dark glass" loading="lazy">

```yaml
type: custom:liquid-home-media-card
entity: media_player.kitchen
```

<img src="/media/media-seek.webp" alt="Dragging the position bar forward and letting go" loading="lazy">

## Behavior {#media-behavior}

### What the card shows {#media-shows}

The card shows only what the player supports.

| Part | When it shows |
|------|---------------|
| Header | The speaker icon (tinted while the player plays or buffers, or while an on/off-only player is on), the name, a line with the state (`Playing`, `Paused`, `Buffering`, `Idle`, `Standby`, `Off`, `On`, `Unavailable` or `Unknown`) and a History button |
| Now playing | The title (two lines at most), a second line with the artist (for a TV show: the series with season and episode, for a channel: the channel) and a third line with the app or the source. An idle or standby player reads `Nothing playing` |
| Position bar | The player is playing, paused or buffering and reports a duration and a position. A player that only switches on and off never has one. Times read `m:ss`, or `h:mm:ss` from one hour. Without a duration there is no bar and no times |
| Volume pill and readout | The player can set its volume. The readout reads the percentage, or `Muted` while muted |
| Previous, Play or Pause, Next, Mute, Power | Each button only when the player supports it. Previous and Next show only while a track is playing, paused or buffering. Mute needs the player to support it. It is not shown in standby |
| Source and Sound mode chips | The player has a list of each, see [Source and Sound mode](#media-lists) |

- A player that is grouped with others reads `Playing, grouped with 2` on the state line. The card does not list the names.
- A player that can only change the volume in steps (no volume level) gets two round buttons, Volume up and Volume down, instead of the pill, and no readout.
- A player that only switches on and off gets a switch pill, the readout `On` or `Off` and the line `Tap to switch`, and no button row.
- A player without any volume control has no pill and no readout.
- A player that is off is plain glass with one Power button. An unavailable player reads `--` and `Unavailable` with its controls dimmed. A player in `standby` looks like an idle one, without volume or Mute.
- Stop, Shuffle and Repeat are not on the card. Shuffle and Repeat are in the sheet, see [Shuffle and repeat](#media-sheet).
- Keyboard on the volume pill: arrow keys change the value by 2, Page Up and Page Down by 10, Home and End jump to 0 and 100.
- The History button opens the Home Assistant history of the player. In a sheet the card hides its own History button, because the sheet has one.

### Artwork {#media-artwork}

The cover (`entity_picture` of the player) is drawn blurred and darkened behind the glass. It is part of the one glass surface of the card, not a second layer.

- The artwork shows while the player is playing, paused or buffering and reports a picture. In every other state, and for a player without `entity_picture`, the card is plain glass.
- When the track changes, the new cover fades in over the old one in 0.8 s.
- The card loads the image only while it is on screen. If the image has not loaded after 3 s, or fails, the card shows plain glass and does not try that address again until the picture changes or the card is shown again (for example after the dashboard reconnects).
- The artwork blur is fixed. `look.blur` does not change it.
- On light glass the artwork is a faint tint, see [Theming](/theming#theming-artwork).

### How the volume is sent {#media-writes}

- **Pill:** the card sends `media_player.volume_set` while you drag: the first value at once, then at most one call every 300 ms, and the final value when you let go. The value is a whole percent. A value equal to the one last sent is not sent again.
- **Steps on the tile and the room card:** each tap moves the volume 5 % from where it is going, between 0 and 100. Taps are collected the same way as a drag. A player that only has volume steps gets one `volume_up` or `volume_down` call per tap and no hold.
- **Mute:** sent at once and shown at once. If the call fails, the card shows the old state again.
- The card, its sheet, the tile and the room card of one player share one writer, so their changes end up in one queue.

### What stays on the pill {#media-hold}

After you send a volume, the pill keeps showing the sent value until Home Assistant reports a volume, the call fails, or `write_hold` seconds pass (default 10). Mute, Play and Pause, Source, Sound mode, Shuffle and Repeat are held the same way: the button or chip shows your choice until Home Assistant reports it, the call fails (the card shows the old state again) or `write_hold` passes.

### Position bar and the ticker {#media-seek}

- **Drag:** drag the bar and let go. The card sends nothing while you drag and one `media_player.media_seek` at release, with the position in whole seconds. While you drag, the time on the left shows the target. Let go where you started and nothing is sent.
- **Keyboard:** arrow keys move 5 s, Page Up and Page Down 10 % of the duration, Home goes to the start and End to the end. One call goes out when you release the key.
- **After a seek:** the bar keeps the position you sent and keeps moving, until Home Assistant reports a position within 2 s of it, the call fails, you seek again, you tap Next or Previous, or `write_hold` passes.
- **Read-only bar:** a player without Seek shows the bar but it cannot be dragged. The bar is also frozen while the player buffers.
- **The ticker:** while a track plays, the bar advances once a second, with the time labels. The card runs this timer only while the player is playing, the page is visible, the card is on screen and you are not dragging. Otherwise no timer runs. The card does not correct for a clock that differs from Home Assistant's, as Home Assistant's own cards do not either.

### Play, pause and Buffering {#media-playpause}

- The Play or Pause button follows what the player is doing: while playing it sends `media_pause`, while paused, idle or on it sends `media_play`. The button and the state line change at once. If the call fails, the card shows the old state again. If Home Assistant does not answer, its state wins after `write_hold` seconds.
- Play is disabled in standby and while the player buffers. Without Play and Pause support the buttons are not shown.
- **Next and Previous** are sent at once. The card then shows `Buffering`, with Play and Pause disabled and the position frozen, until the first of these happens:
  1. The track changes: the title, the content id or the picture differs.
  2. The state leaves playing or buffering.
  3. The player restarts the same track: Home Assistant reports a fresh position (a newer `media_position_updated_at`) under 3 s. This is what Previous does on many players in the first seconds of a track, where the track stays the same.
  4. The call fails.
  5. `write_hold` seconds pass.
- A Next or Previous tap in the first 3 s of a track can end the Buffering early, when the player still reports the old track once more.

### Source and Sound mode {#media-lists}

- The Source chip shows when the player supports selecting a source and reports a non-empty `source_list`. The Sound mode chip shows with `sound_mode_list` the same way. Two chips share one row.
- Tap a chip to open its list inside the card. The list is part of the same glass, not a popup. Arrow keys, Home and End move through the rows, Enter or Space picks one, Escape closes the list and returns to the chip.
- Picking a row sends `media_player.select_source` or `media_player.select_sound_mode` once, and shows the choice until Home Assistant reports it. Picking the value that is already shown sends nothing.
- A value that is not in the list (a source the player does not list) is shown as it is.
- Hide a chip with `controls.sources: false` or `controls.sound_modes: false`.

### Shuffle and repeat in the sheet {#media-sheet}

In the sheet of a media player (from the tile, the badge with `tap_action: sheet`, or the room card) the header has Shuffle and Repeat buttons before History and Close.

- Shuffle shows only when the player supports it, and is pressed while shuffle is on.
- Repeat shows only when the player supports it. Each tap goes from off to all, from all to one, and from one to off. The label reads `Repeat off`, `Repeat all` or `Repeat one`, and the button is pressed unless repeat is off.
- Both are hidden while the player is off, unavailable or unknown.

## Options {#media-options}

| Option | Default | Description |
|--------|---------|-------------|
| `entity` | required | A `media_player` entity |
| `name` | entity name | Name in the header |
| `controls.sources` | `true` | Shows the Source chip when the player has sources |
| `controls.sound_modes` | `true` | Shows the Sound mode chip when the player has sound modes |
| `write_hold` | `10` | Seconds a sent volume, position or choice stays shown without an answer, see [What stays on the pill](#media-hold) |
| `look` | | `glass`, `blur` and `motion`, see [Theming](/theming). The artwork blur does not follow `look.blur` |
| `config_version` | `1` | Written by the editor |

```yaml
type: custom:liquid-home-media-card
entity: media_player.living_room
name: TV
controls:
  sound_modes: false
write_hold: 30
look:
  glass: dark
  motion: subtle
```

## Editor groups {#media-editor-groups}

The visual editor has three tabs: Setup, Controls and Look. The (?) link beside each opens the matching section here.

### Entity {#media-entity}

The Setup tab. Pick the media player, and optionally give it a name. Empty uses the entity name. Options: `entity`, `name`.

### Controls {#media-controls}

The Controls tab. Two switches, Sources and Sound modes, show or hide the chips. A switch is off and reads "Not supported by this media player" when the player has no list of that kind. The tab also holds the write hold, see [Show sent value for](#media-write-hold). Options: `controls.sources`, `controls.sound_modes`.

### Show sent value for {#media-write-hold}

Seconds a sent volume, position or choice stays shown while Home Assistant has not answered. Raise it for a player that is slow to report. Choices: 10 s, 30 s, 60 s. Option: `write_hold`, in seconds. See [What stays on the pill](#media-hold).

### Look {#media-look}

Glass, blur and motion, shared by all Liquid Home cards. Options: `look.glass`, `look.blur`, `look.motion`. See [Theming](/theming).
