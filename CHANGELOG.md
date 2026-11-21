# Changelog

All notable changes to Liquid Home. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

<!-- #region entries -->
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
