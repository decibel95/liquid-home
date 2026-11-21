# Adding or fixing a translation

The cards ship their strings in two places, both bundled into the single `dist/liquid-home.js`, so there is nothing to fetch at runtime:

- `src/i18n/locales/<language>.json`: product strings shared by all cards.
- `src/cards/<card>/i18n/<language>.json`: strings of one card (light, tile, badge, room).

Shared strings that every Liquid card needs (liquid-core) come from the library; product strings win over them, and card strings win over product strings.

## Fix a string

Edit the value in the language file. Keep the `{placeholders}` as they are (`{name}`, `{n}`, `{value}`), you
may move them within the sentence. Run `npm test`, it checks that every language has exactly the keys of `en.json`
and the same placeholders per key.

## Add a language

1. Copy every `en.json` (the product file and the one in each card `i18n` folder) to `<code>.json` next to it, with the two letter code of the language (for example `pl.json`). Home Assistant's own language codes are used; a regional variant such as `nl-BE` falls back to `nl` by itself.
2. Translate the values. Do not change the keys.
3. Add one import line and one entry per file: `src/i18n/index.ts` (product) and `src/cards/<card>/i18n/index.ts` (each card), and the language code in `LANGUAGES`.
4. Run `npm run typecheck`, `npm test` and `npm run build`.
5. Look at it: `npm run dev`, then pick the language in the switcher (or open `/dev/?lang=pl`).

## Guidelines

- Keep the copy short and plain, like the English. Many strings sit in narrow places (mode buttons, chips,
  44px rows). Long words are cut with an ellipsis, so prefer a short word.
- Use the terms Home Assistant itself uses in your language (area, floor, entity, automation, script).
- Colour modes, effect names and light states are read from Home Assistant first (`hass.localize`); our keys are only the fallback.
- Do not use the em-dash character; use a comma, a colon or parentheses. The tests check this.
- Config keys, entity ids and YAML stay English. Only UI text is translated.
- Configuration errors (`setConfig`) and the card picker names and descriptions stay English on purpose: there is no `hass` at that point, and they are for the person writing the config.
- Proper nouns and units stay as they are.
