import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
import pkg from './package.json';

const require = createRequire(import.meta.url);

/**
 * The Inter font and its licence (from liquid-core) go next to dist/liquid-home.js, byte for byte. src/register.ts
 * loads the font from there at runtime; the release attaches all three files (OFL condition 2: the licence travels
 * with the font). On the dev server src/register.ts resolves the font to /src/liquid-inter.woff2, served from core.
 *
 * Contract with src/register.ts: the dev route below is '/src/' + the file name that register.ts resolves
 * ('./liquid-inter.woff2' next to src/register.ts), which must be a key of FONT_ASSETS. test/font.test.ts checks it.
 */
export const FONT_ASSETS = {
  'liquid-inter.woff2': '@decibel95/liquid-core/fonts/liquid-inter.woff2',
  'liquid-inter-OFL.txt': '@decibel95/liquid-core/fonts/OFL.txt',
} as const;

function fontAssets(): Plugin {
  return {
    name: 'lh-font-assets',
    configureServer(server) {
      server.middlewares.use('/src/liquid-inter.woff2', (_req, res) => {
        // Route name = register.ts's './liquid-inter.woff2' (see the contract at FONT_ASSETS).
        res.setHeader('Content-Type', 'font/woff2');
        res.end(readFileSync(require.resolve(FONT_ASSETS['liquid-inter.woff2'])));
      });
    },
    generateBundle() {
      for (const [fileName, from] of Object.entries(FONT_ASSETS)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(require.resolve(from)) });
      }
    },
  };
}

/**
 * Release form of the bundle (plan 2.13 option B): whitespace and ordinary comments out (licence comments stay), nothing else. Vite's lib ES build
 * already shortens identifiers and syntax and only skips whitespace, so esbuild's minifyWhitespace (Vite's own
 * copy, no extra dependency) is the whole difference. scripts/e2e/core-share.mjs builds without this config, so
 * the liquid-core share stays measured unminified.
 */
function minifyWhitespace(): Plugin {
  return {
    name: 'lh-minify-whitespace',
    apply: 'build',
    async generateBundle(_options, bundle) {
      // After every renderChunk hook: Vite's own transpile step prints the code again with whitespace.
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        const out = await transformWithEsbuild(item.code, item.fileName, { minifyWhitespace: true, format: 'esm', target: 'es2022' });
        item.code = out.code;
      }
    },
  };
}

export default defineConfig({
  define: { __LH_VERSION__: JSON.stringify(pkg.version) },
  // One copy of Lit across liquid-core and this bundle (CI also checks `npm ls lit`).
  resolve: { dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'] },
  plugins: [fontAssets(), minifyWhitespace()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'liquid-home.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
