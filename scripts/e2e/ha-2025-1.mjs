#!/usr/bin/env node
/**
 * Minimum-version smoke test (plan P18 and 2.12, local only): a throwaway Home Assistant 2025.1.4 container with the demo
 * integration and the Liquid Home bundle, a Playwright check that the cards render (light, cover, fan, tile, room, badge)
 * and a check that the HA card editor opens for each of them, with no Liquid Home console error. Demo lights, covers and
 * fans (modern template lights do not exist in 2025.1).
 *
 * Usage: node scripts/e2e/ha-2025-1.mjs <up | onboard | run | down | all>
 *   up       write the config dir, start the container on 127.0.0.1:8125 and wait until HA answers
 *   onboard  create a throwaway local user through the onboarding REST API, install the resource and the dashboard
 *   run      open the dashboard in Chromium, check the four cards and the four editors, write the report
 *   down     stop and remove the container and the config dir
 *   all      up, onboard, run, and always down
 *
 * Environment: LH_HA_DIR (config dir, default <tmpdir>/lh-ha-2025.1; holds the throwaway credentials in .e2e-user.json,
 * never printed), LH_HA_PORT (default 8125), LH_HA_REPORT (report file, default <config dir>/report.json, copy it
 * out before `down`), LH_HA_DIST (the build directory to serve as the resource, default <repo>/dist; use a scratch
 * build such as `npx vite build --outDir <scratch>`), LH_HA_SHOTS (directory for the dashboard and editor screenshots,
 * default the config dir). Needs docker and a built liquid-home.js (npm run build). Nothing is sent anywhere except to 127.0.0.1.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGE = 'ghcr.io/home-assistant/home-assistant:2025.1.4@sha256:a8aab945aec2f43eb1b1fde4d19e25ef952fab9c10f49e40d3b3ce7d24cedc19';
const NAME = 'lh-ha-2025-1';
const PORT = Number(process.env.LH_HA_PORT || 8125);
const DIR = resolve(process.env.LH_HA_DIR || join(tmpdir(), 'lh-ha-2025.1'));
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = `${BASE}/`;
const USER_FILE = join(DIR, '.e2e-user.json');
const RESOURCE_URL = '/local/liquid-home/liquid-home.js';
const SHOTS = resolve(process.env.LH_HA_SHOTS || DIR);
const LIGHTS = {
  bed: 'light.bed_light',
  ceiling: 'light.ceiling_lights',
  kitchen: 'light.kitchen_lights',
  office: 'light.office_rgbw_lights',
  livingRoom: 'light.living_room_rgbww_lights',
  entrance: 'light.entrance_color_white_lights',
};
const COVERS = { hall: 'cover.hall_window', living: 'cover.living_room_window', kitchen: 'cover.kitchen_window', pergola: 'cover.pergola_roof' };
const FANS = { living: 'fan.living_room_fan', ceiling: 'fan.ceiling_fan', preset: 'fan.preset_only_limited_fan' };

const docker = (args, opts = {}) => spawnSync('docker', args, { encoding: 'utf8', ...opts });
const log = (...a) => console.log('[ha-2025.1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function containerExists() {
  return docker(['ps', '-a', '--filter', `name=^${NAME}$`, '--format', '{{.Names}}']).stdout.trim() === NAME;
}

async function up() {
  if (containerExists()) throw new Error(`Container ${NAME} already exists. Run "down" first.`);
  const dist = resolve(process.env.LH_HA_DIST || join(ROOT, 'dist'));
  if (!existsSync(join(dist, 'liquid-home.js'))) throw new Error(`${dist}/liquid-home.js is missing. Run "npm run build" first (or set LH_HA_DIST).`);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, 'configuration.yaml'), 'default_config:\ndemo:\nlogger:\n  default: warning\n');
  // A fresh config dir is mandatory: onboarding only runs on an instance that has none.
  const r = docker(['run', '-d', '--name', NAME, '-p', `127.0.0.1:${PORT}:8123`, '-v', `${DIR}:/config`, '-v', `${dist}:/config/www/liquid-home:ro`, IMAGE]);
  if (r.status !== 0) throw new Error(`docker run failed: ${r.stderr}`);
  log(`container started, waiting for ${BASE}`);
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/api/onboarding`);
      if (res.ok) return log('HA answers');
    } catch {
      /* not up yet */
    }
    await sleep(2000);
  }
  throw new Error(`HA did not answer on ${BASE} within 240 s. docker logs ${NAME}`);
}

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function tokenFor(authCode) {
  const res = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: authCode, client_id: CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  return res.json();
}

/** One websocket command round trip with an access token. */
async function ws(token, commands) {
  const sock = new WebSocket(`ws://127.0.0.1:${PORT}/api/websocket`);
  const results = [];
  await new Promise((resolveDone, reject) => {
    let id = 0;
    let i = 0;
    const timer = setTimeout(() => reject(new Error('websocket timeout')), 30000);
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token: token }));
      else if (msg.type === 'auth_ok' || msg.type === 'result') {
        if (msg.type === 'result') {
          if (!msg.success) return reject(new Error(`ws ${JSON.stringify(commands[i - 1].type)}: ${JSON.stringify(msg.error)}`));
          results.push(msg.result);
        }
        if (i >= commands.length) {
          clearTimeout(timer);
          return resolveDone();
        }
        sock.send(JSON.stringify({ id: ++id, ...commands[i++] }));
      } else if (msg.type === 'auth_invalid') reject(new Error('websocket auth invalid'));
    };
    sock.onerror = () => reject(new Error('websocket error'));
  });
  sock.close();
  return results;
}

function dashboardConfig() {
  const look = { glass: 'dark' };
  return {
    title: 'Liquid Home smoke',
    views: [
      {
        title: 'Smoke',
        path: 'smoke',
        badges: [
          { type: 'custom:liquid-home-badge', entity: LIGHTS.kitchen, tap_action: 'sheet', look },
          { type: 'custom:liquid-home-badge', entity: FANS.living, tap_action: 'sheet', look },
        ],
        // The order matters: the editor check addresses the cards by index (see CARDS).
        cards: [
          { type: 'custom:liquid-home-light-card', entity: LIGHTS.ceiling, look },
          { type: 'custom:liquid-home-tile', entity: LIGHTS.office, look },
          { type: 'custom:liquid-home-room', title: 'Demo room', entities: [LIGHTS.bed, LIGHTS.ceiling, LIGHTS.kitchen, LIGHTS.livingRoom], look },
          { type: 'custom:liquid-home-cover-card', entity: COVERS.hall, look },
          { type: 'custom:liquid-home-fan-card', entity: FANS.living, look },
          { type: 'custom:liquid-home-tile', entity: COVERS.living, tap_action: 'sheet', look },
          { type: 'custom:liquid-home-room', title: 'Mixed room', domains: ['light', 'cover', 'fan'], entities: [LIGHTS.bed, COVERS.kitchen, COVERS.pergola, FANS.ceiling, FANS.preset], look },
        ],
      },
    ],
  };
}

async function onboard() {
  const username = `lhsmoke${randomBytes(3).toString('hex')}`;
  const password = randomBytes(18).toString('base64url');
  const { auth_code } = await post('/api/onboarding/users', { client_id: CLIENT_ID, name: 'Liquid Home smoke', username, password, language: 'en' });
  const tokens = await tokenFor(auth_code);
  writeFileSync(USER_FILE, JSON.stringify({ username, password, tokens, created: new Date().toISOString() }), { mode: 0o600 });
  const t = tokens.access_token;
  for (const step of ['core_config', 'analytics']) await post(`/api/onboarding/${step}`, {}, t);
  await post('/api/onboarding/integration', { client_id: CLIENT_ID, redirect_uri: CLIENT_ID }, t);
  log('onboarding done (throwaway user stored in the config dir, not printed)');
  await ws(t, [
    { type: 'lovelace/resources/create', res_type: 'module', url: RESOURCE_URL },
    { type: 'lovelace/config/save', config: dashboardConfig() },
  ]);
  log(`resource ${RESOURCE_URL} and the dashboard installed`);
}

/** Runs in the page: finds an element by tag through open shadow roots. */
const deepFind = `(tag) => { const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.localName === tag) return el; if (el.shadowRoot) { const f = walk(el.shadowRoot); if (f) return f; } } return null; }; return walk(document); }`;

async function run() {
  const { chromium } = await import('playwright');
  const user = JSON.parse(readFileSync(USER_FILE, 'utf8'));
  const fresh = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: user.tokens.refresh_token, client_id: CLIENT_ID }),
  }).then((r) => r.json());
  const hassTokens = { ...user.tokens, access_token: fresh.access_token, expires_in: fresh.expires_in, expires: Date.now() + fresh.expires_in * 1000, hassUrl: BASE, clientId: CLIENT_ID };

  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: 'dark' });
  await context.addInitScript((tokens) => localStorage.setItem('hassTokens', JSON.stringify(tokens)), hassTokens);
  const page = await context.newPage();
  const events = [];
  const mark = (phase) => (events.push({ phase }), phase);
  let phase = mark('load');
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && events.push({ phase, kind: m.type(), text: m.text().slice(0, 300), url: m.location().url }));
  page.on('pageerror', (e) => events.push({ phase, kind: 'pageerror', text: `${e.name}: ${e.message}`.slice(0, 300), stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') }));

  const report = { ha: '2025.1.4', cards: {}, editors: {} };
  await page.goto(`${BASE}/lovelace/smoke`, { waitUntil: 'load' });
  const find = (tag) => page.evaluateHandle(`(${deepFind})(${JSON.stringify(tag)})`);
  const tags = { light: 'liquid-home-light-card', tile: 'liquid-home-tile', room: 'liquid-home-room', badge: 'liquid-home-badge', cover: 'liquid-home-cover-card', fan: 'liquid-home-fan-card' };
  for (const [key, tag] of Object.entries(tags)) {
    try {
      await page.waitForFunction(`(() => { const el = (${deepFind})(${JSON.stringify(tag)}); return !!el && !!el.shadowRoot && el.shadowRoot.querySelector('button, [role="slider"]'); })()`, null, { timeout: 30000 });
      report.cards[key] = await page.evaluate(`(() => { const el = (${deepFind})(${JSON.stringify(tag)}); const r = el.getBoundingClientRect(); const glass = [...el.shadowRoot.querySelectorAll('*')].find((e) => getComputedStyle(e).backdropFilter !== 'none'); return { rendered: true, width: Math.round(r.width), height: Math.round(r.height), glass: glass ? getComputedStyle(glass).backdropFilter : null }; })()`);
    } catch (err) {
      report.cards[key] = { rendered: false, error: String(err.message).split('\n')[0] };
    }
  }
  await page.waitForTimeout(1500);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, 'dashboard.png'), fullPage: true });
  report.dashboardEvents = events.filter((e) => e.kind).length;

  // Editors: edit mode, then the edit button of each card and of the badge.
  phase = mark('edit mode');
  const editors = [];
  try {
    await page.evaluate(`(() => { const root = (${deepFind})('hui-root'); root.lovelace.setEditMode(true); })()`);
    await page.waitForTimeout(1500);
    const edit = async (name, what) => {
      phase = mark(`editor ${name}`);
      const before = events.length;
      let outcome;
      try {
        await page.evaluate(what);
        await page.waitForFunction(`(() => { const d = (${deepFind})('hui-dialog-edit-card') || (${deepFind})('hui-dialog-edit-badge'); return !!d && !!d.shadowRoot; })()`, null, { timeout: 15000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(SHOTS, `editor-${name}.png`) });
        outcome = await page.evaluate(`(() => { const f = ${deepFind}; const editorTag = ['liquid-home-light-card-editor','liquid-home-tile-editor','liquid-home-room-editor','liquid-home-badge-editor','liquid-home-cover-card-editor','liquid-home-fan-card-editor'].find((t) => f(t)); const yaml = !!f('ha-code-editor'); const err = f('hui-card-editor-error') || f('hui-error-card'); return { dialogOpened: true, liquidHomeEditorElement: editorTag || null, yamlEditorShown: yaml, errorCard: !!err }; })()`);
      } catch (err) {
        outcome = { dialogOpened: false, error: String(err.message).split('\n')[0] };
      }
      outcome.newConsoleOrPageErrors = events.slice(before).filter((e) => e.kind === 'pageerror' || e.kind === 'error').length;
      editors.push({ card: name, ...outcome });
      await page.evaluate(`(() => { const d = (${deepFind})('hui-dialog-edit-card') || (${deepFind})('hui-dialog-edit-badge'); d?.closeDialog?.(); d?.close?.(); })()`).catch(() => {});
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    };
    // [name, tag, index of the card in the dashboard]: light 0, tile 1, room 2, cover 3, fan 4 (cover tile 5, mixed room 6 render only).
    for (const [name, tag, index] of [['light', tags.light, 0], ['tile', tags.tile, 1], ['room', tags.room, 2], ['cover', tags.cover, 3], ['fan', tags.fan, 4]]) {
      await edit(name, `(() => { const host = (${deepFind})(${JSON.stringify(tag)}); host.dispatchEvent(new CustomEvent('ll-edit-card', { bubbles: true, composed: true, detail: { path: [0, ${index}] } })); })()`);
    }
    await edit('badge', `(() => { const host = (${deepFind})('liquid-home-badge'); host.dispatchEvent(new CustomEvent('ll-edit-badge', { bubbles: true, composed: true, detail: { path: [0, 0] } })); })()`);
  } catch (err) {
    report.editorSetupError = String(err.message).split('\n')[0];
  }
  report.editors = editors;
  await browser.close();

  const liquid = (e) => /liquid-home/i.test(`${e.url ?? ''} ${e.text ?? ''} ${e.stack ?? ''}`);
  report.consoleProblems = events.filter((e) => e.kind);
  report.liquidHomeProblems = report.consoleProblems.filter(liquid);
  const out = process.env.LH_HA_REPORT || join(DIR, 'report.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  log(`report: ${out}`);
  console.log(JSON.stringify({ cards: report.cards, editors: report.editors, liquidHomeProblems: report.liquidHomeProblems.length, otherConsoleProblems: report.consoleProblems.length - report.liquidHomeProblems.length, editorSetupError: report.editorSetupError }, null, 1));
  const missing = Object.values(report.cards).some((c) => !c.rendered);
  if (missing || report.liquidHomeProblems.length) process.exitCode = 1;
}

function down() {
  if (containerExists()) {
    docker(['rm', '-f', NAME]);
    log('container removed');
  }
  if (existsSync(DIR)) {
    // Files written by the container are owned by root: remove them from inside a container, then the directory.
    docker(['run', '--rm', '--entrypoint', 'sh', '-v', `${DIR}:/c`, IMAGE, '-c', 'rm -rf /c/* /c/.[!.]* 2>/dev/null; true']);
    spawnSync('rm', ['-rf', DIR]);
    log(`config dir ${existsSync(DIR) ? 'COULD NOT BE REMOVED: ' : 'removed: '}${DIR}`);
  }
}

const command = process.argv[2];
try {
  if (command === 'up') await up();
  else if (command === 'onboard') await onboard();
  else if (command === 'run') await run();
  else if (command === 'down') down();
  else if (command === 'all') {
    try {
      await up();
      await onboard();
      await run();
    } finally {
      if (!process.env.LH_HA_KEEP) down();
    }
  } else {
    console.error('Usage: node scripts/e2e/ha-2025-1.mjs <up | onboard | run | down | all>');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`[ha-2025.1] ${err.message}`);
  process.exitCode = 1;
}
