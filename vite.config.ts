import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  define: { __LH_VERSION__: JSON.stringify(pkg.version) },
  // One copy of Lit across liquid-core and this bundle (CI also checks `npm ls lit`).
  resolve: { dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'] },
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
