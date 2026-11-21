import '../src/index';
import { createHarness } from './harness';
import { LIGHT_FIXTURES } from '../test/fixtures/lights';
import type { SlotMount } from './slots/types';
import { mount as light } from './slots/light';
import { mount as tile } from './slots/tile';
import { mount as badge } from './slots/badge';
import { mount as room } from './slots/room';
import { mount as editors } from './editors';

const log = document.getElementById('log')!;
let logged = 0;
const write = (line: string) => {
  log.textContent = (logged++ === 0 ? '' : `${log.textContent}\n`) + line;
  log.scrollTop = log.scrollHeight;
};

// Language: the switcher and ?lang=nl set hass.locale.language and hass.language, as Home Assistant does.
const LANGUAGES = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const langSelect = document.getElementById('lang') as HTMLSelectElement;
const initialLang = new URLSearchParams(location.search).get('lang');
langSelect.value = LANGUAGES.includes(initialLang ?? '') ? initialLang! : 'en';

const harness = createHarness({
  language: langSelect.value,
  onCall(domain, service, data) {
    write(`${new Date().toLocaleTimeString()}  ${domain}.${service} ${JSON.stringify(data)}`);
  },
});
langSelect.addEventListener('change', () => harness.setLanguage(langSelect.value));

const slots: [string, SlotMount][] = [
  ['light', light],
  ['tile', tile],
  ['badge', badge],
  ['room', room],
];
// The editor demo (P15): its section is made here, after the room card's.
const editorSection = document.createElement('section');
editorSection.className = 'slot';
editorSection.id = 'slot-editors';
const editorHeading = document.createElement('h2');
editorHeading.textContent = 'Editors';
document.getElementById('slot-room')!.after(editorHeading, editorSection);
slots.push(['editors', editors]);

for (const [name, mount] of slots) {
  mount({
    container: document.getElementById(`slot-${name}`)!,
    hass: harness.hass,
    ids: harness.ids,
    onHass: harness.onHass,
    log: write,
  });
}

// The derived fixtures, listed so a slot author can see which states exist.
const list = document.getElementById('fixtures')!;
for (const [name, make] of Object.entries(LIGHT_FIXTURES)) {
  const s = make();
  const li = document.createElement('li');
  li.textContent = `${name}: ${s.entity_id} (${s.state}, derived)`;
  list.append(li);
}
