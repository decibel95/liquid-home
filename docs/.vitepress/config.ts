import { defineConfig } from 'vitepress';
import { DOCS_URL } from '../../src/const';

// The path of DOCS_URL (src/const.ts, the editor help links), so the help links and the built site cannot
// drift apart. DOCS_BASE only overrides it for a preview at another path, e.g. DOCS_BASE=/ npm run docs:build.
const base = process.env.DOCS_BASE || new URL(DOCS_URL).pathname.replace(/\/?$/, '/');

export default defineConfig({
  title: 'Liquid Home',
  description: 'Glass cards for Home Assistant lights, covers and fans: light, cover and fan cards, tile, badge and room card.',
  base,
  cleanUrls: true,
  lastUpdated: false,
  appearance: true,
  themeConfig: {
    nav: [
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Cards', link: '/cards/light' },
      { text: 'Features', link: '/theming' },
      { text: 'Help', link: '/troubleshooting' },
    ],
    sidebar: [
      { text: 'Introduction', items: [{ text: 'Getting started', link: '/getting-started' }] },
      {
        text: 'Cards',
        items: [
          { text: 'Light card', link: '/cards/light' },
          { text: 'Cover card', link: '/cards/cover' },
          { text: 'Fan card', link: '/cards/fan' },
          { text: 'Tile', link: '/cards/tile' },
          { text: 'Badge', link: '/cards/badge' },
          { text: 'Room card', link: '/cards/room' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Theming', link: '/theming' },
          { text: 'Languages', link: '/languages' },
        ],
      },
      {
        text: 'Help',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    footer: { message: 'Released under the MIT license.' },
  },
  vite: {
    // The cards use legacy (experimentalDecorators) Lit decorators and class fields set by Lit:
    // the same esbuild settings as the root tsconfig.json.
    esbuild: {
      target: 'es2022',
      tsconfigRaw: {
        compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
      },
    },
    build: { target: 'es2022' },
    server: { fs: { allow: ['..'] } },
  },
});
