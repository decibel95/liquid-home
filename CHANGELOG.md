# Changelog

All notable changes to Liquid Home. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

<!-- #region entries -->
## 0.4.0

### Added
- **Media card** for media players: the artwork blurred behind the glass, play and pause, previous and next, a volume pill with mute, a position bar you can drag, and lists for Source and Sound mode.
- Media players in the tile, the badge and the room card. A room shows them when you add `media_player` to `domains`.
- Shuffle and repeat in the sheet of a media player, next to the history button.

### Fixed
- A tile whose entity changes to another kind of device while its sheet is open now shows the right card.
- The value on a tile no longer touches the step buttons at 100%.

## 0.3.0

### Added
- **Cover card**: a glass card for one cover with a position pill and Open, Stop and Close buttons. It also handles tilt, covers that only toggle (a garage door) and covers that report no position.
- **Fan card**: a glass card for one fan with a speed pill that snaps to the speeds of the fan, power, oscillate and direction buttons, and a preset chip (hide it with `controls.presets`).
- Covers and fans in the tile, the badge and the room card. A room shows lights only unless you pick more with `domains`.
- A history button in the sheet of covers and fans, as for lights.
- An "Open in Home Assistant" button in the README, to add Liquid Home to your Home Assistant in one click.

### Changed
- The light card header shows a small device icon next to the name.
- The room card header reads "3 of 5 active" when the room has covers or fans. Rooms with only lights still read "3 of 5 on".

### Fixed
- A long badge name no longer makes the page wider than the screen on a narrow phone. It is cut short with an ellipsis, and `name` shortens it.

## 0.2.2

### Changed
- A shorter README: screenshots, how to install, and a link to the documentation. All card options now live on the documentation site. The cards themselves are unchanged.

## 0.2.1

### Changed
- A full README with screenshots of every card, installation steps for the Home Assistant Marketplace, HACS and a manual install, and every card option. The cards themselves are unchanged.

## 0.2.0

### Added
- The light sheet has a history button next to the close button. It closes the sheet and opens the Home Assistant history for that light.
- Liquid Home now ships the Inter font with the card, so cards look the same on every device. No internet connection needed.
- Manual installs: copy the new files `liquid-inter.woff2` and `liquid-inter-OFL.txt` from the release into the same folder as `liquid-home.js`. With HACS this happens on its own.

## 0.1.1

This is the first release of Liquid Home. Version 0.1.0 was tagged but never released because of a build setup problem.

The first version of Liquid Home: glass cards for your Home Assistant lights.

### Added
- **Light card**: a glass card for one light. It shows only what your light supports.
- Brightness, white (colour temperature) and colour modes, with buttons to switch between them. Pick the modes you want with `controls.modes`.
- Effects: a chip to choose a light effect, when the light has any (hide it with `controls.effects`).
- Values you send stay on screen while Home Assistant catches up, so the control does not jump back. Set how long with `write_hold`.
- **Tile**: a compact glass row for one light, with a power button, the status and brightness steppers. Tap the name to open the light card, the standard Home Assistant dialog, or nothing (`tap_action`).
- **Badge**: a small pill with the light's icon, name and value, or only a round icon with `icon_only`. Tap opens the standard Home Assistant dialog by default (`tap_action`).
- **Room card**: all the lights of a room in one card, with a power button for the whole room, a tile per light and quick controls for the selected light. Fill it from a Home Assistant area or from your own list of lights, and leave lights out with `exclude`.
- A visual editor for every card, so you never have to write YAML.
- Available in English, Dutch, German, French, Spanish and Italian. The cards follow your Home Assistant language.
- Light and dark glass that follows your Home Assistant theme, with options for the glass, the blur and the motion (`look`).
- Install with HACS as a custom repository, or by hand. Requires Home Assistant 2025.1.0 or newer.
<!-- #endregion entries -->
