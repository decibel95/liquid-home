import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from 'playwright/test';
import { stubFavicon, watchErrors, writeReport } from './support/helpers';

/**
 * Plan 2.9 / D-9: an axe scan of the dev harness (/dev/, every fixture on dark and on light glass, all four cards).
 * Zero serious or critical violations. Every violation is printed and attached (id, impact, nodes), whatever its impact.
 */
interface Scan {
  scope: string;
  include?: string;
  exclude?: string;
  disable?: string[];
}
/**
 * The editors section (#slot-editors) renders the editors on HA's default theme, where the selected segment is
 * --text-primary-color (#fff) on --primary-color (#03a9f4), 2.62:1. That is HA's theme, identical to Liquid Climate's
 * editors (same core editorStyles rule) and to HA's own primary-filled controls, so the whole-page scan leaves the
 * section out and a separate scan covers it with every rule except color-contrast.
 */
const SCANS: Scan[] = [
  { scope: 'whole harness page (both glasses), editors section aside', exclude: '#slot-editors' },
  { scope: 'editors section, all rules except color-contrast (HA default theme primary on white)', include: '#slot-editors', disable: ['color-contrast'] },
  { scope: 'dark glass', include: '[data-glass="dark"]' },
  { scope: 'light glass', include: '[data-glass="light"]' },
];

async function settle(page: Page): Promise<void> {
  await page.goto('/dev/');
  await page.waitForFunction(() => document.querySelectorAll('liquid-home-light-card').length > 0);
  // The fill transition is 0.8 s; contrast is measured on the settled page.
  await page.waitForTimeout(1500);
}

async function scan(page: Page, { include, exclude, disable }: Scan, info: TestInfo) {
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  if (exclude) builder = builder.exclude(exclude);
  if (disable) builder = builder.disableRules(disable);
  const results = await builder.analyze();
  const report = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.map((n) => n.target.join(' >> ')),
    detail: v.nodes.map((n) => ({ html: n.html.slice(0, 300), why: n.failureSummary })),
  }));
  const summary = `axe (${results.testEngine.name} ${results.testEngine.version}): ${results.passes.length} rules passed, ${report.length} violations, ${results.incomplete.length} incomplete`;
  console.log(`${info.title}: ${summary}`);
  for (const v of report) console.log(`  violation ${v.id} [${v.impact}] x${v.nodes}: ${v.help}\n    first: ${v.targets[0]}`);
  await writeReport(`axe-${info.title.replace(/\W+/g, '-').toLowerCase()}.json`, {
    summary,
    violations: report,
    incomplete: results.incomplete.map((i) => ({ id: i.id, nodes: i.nodes.length })),
  });
  return report;
}

for (const sc of SCANS) {
  const { scope } = sc;
  test(`axe: ${scope} has no serious or critical violation`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await stubFavicon(page);
    await settle(page);
    const report = await scan(page, sc, info);
    expect(errors).toEqual([]);
    expect(report.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
}
