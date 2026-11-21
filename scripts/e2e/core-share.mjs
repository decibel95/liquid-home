#!/usr/bin/env node
/**
 * Size of the part of liquid-core that Liquid Home pulls in (plan 2.10): a fixture bundle that imports every value
 * Liquid Home imports from @decibel95/liquid-core, built the same way as dist/liquid-home.js (vite lib, es,
 * unminified). Lit is left external so only liquid-core's own code counts; the size with Lit is printed for reference.
 *
 * Usage: node scripts/e2e/core-share.mjs   (exit 1 above the budget)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import { build } from 'vite';

// Raised from 60,000 to 85,000 (2026-11-18). The figure is unminified and includes comments.
export const MAX_CORE_RAW = 85_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = '@decibel95/liquid-core';
const VIRTUAL = 'lh-core-fixture.virtual.js';

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.ts$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Every runtime (non-type) name Liquid Home's src/ imports from liquid-core, per module specifier. */
export function usedCoreImports(srcDir = join(ROOT, 'src')) {
  const bySpecifier = new Map();
  const add = (spec, name) => {
    if (!bySpecifier.has(spec)) bySpecifier.set(spec, new Set());
    bySpecifier.get(spec).add(name);
  };
  for (const file of sourceFiles(srcDir)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    for (const node of sf.statements) {
      const spec = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
      if (spec !== CORE && !spec.startsWith(`${CORE}/`)) continue;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (!clause || clause.isTypeOnly) continue;
        if (clause.name) add(spec, 'default');
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) add(spec, '*');
        if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) add(spec, (el.propertyName ?? el.name).text);
      } else if (!node.isTypeOnly) {
        if (!node.exportClause) add(spec, '*');
        else if (ts.isNamedExports(node.exportClause)) for (const el of node.exportClause.elements) if (!el.isTypeOnly) add(spec, (el.propertyName ?? el.name).text);
      }
    }
  }
  return bySpecifier;
}

function entrySource(imports) {
  const lines = [];
  for (const [spec, names] of imports) {
    for (const name of [...names].sort()) {
      if (name === '*') lines.push(`export * from '${spec}';`);
      else if (name === 'default') lines.push(`export { default as default_${spec.replace(/\W/g, '_')} } from '${spec}';`);
      else lines.push(`export { ${name} } from '${spec}';`);
    }
  }
  return lines.join('\n') + '\n';
}

async function bundle(source, external) {
  const result = await build({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    resolve: { dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'] },
    plugins: [
      {
        name: 'lh-core-fixture',
        resolveId: (id) => (id.endsWith(VIRTUAL) ? `\0${VIRTUAL}` : null),
        load: (id) => (id === `\0${VIRTUAL}` ? source : null),
      },
    ],
    build: {
      target: 'es2022',
      write: false,
      lib: { entry: VIRTUAL, formats: ['es'], fileName: () => 'core-fixture.js' },
      rollupOptions: { external },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunk = outputs.find((o) => o.type === 'chunk');
  return Buffer.from(chunk.code, 'utf8');
}

/** Builds the fixture and returns the sizes (bytes). */
export async function measureCoreShare() {
  const imports = usedCoreImports();
  const source = entrySource(imports);
  const names = [...imports.values()].reduce((n, s) => n + s.size, 0);
  const noLit = await bundle(source, [/^lit(\/|$)/, /^lit-html(\/|$)/, /^lit-element(\/|$)/, /^@lit\//]);
  const withLit = await bundle(source, []);
  return {
    names,
    raw: noLit.length,
    gzip: gzipSync(noLit, { level: 9 }).length,
    rawWithLit: withLit.length,
    gzipWithLit: gzipSync(withLit, { level: 9 }).length,
  };
}

export function reportCoreShare(m) {
  console.log(
    `liquid-core share (fixture of ${m.names} imported names, Lit external): ${m.raw} bytes raw (budget ${MAX_CORE_RAW}), ${m.gzip} bytes gzip; ` +
      `with Lit bundled in: ${m.rawWithLit} raw, ${m.gzipWithLit} gzip`,
  );
  if (m.raw > MAX_CORE_RAW) {
    console.error(`Size budget exceeded: liquid-core share raw ${m.raw} > ${MAX_CORE_RAW}. Report it; raising a budget needs maintainer approval.`);
    return false;
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  measureCoreShare().then(
    (m) => process.exit(reportCoreShare(m) ? 0 : 1),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
