#!/usr/bin/env -S npx tsx
/**
 * seo-planner CLI. Commands:
 *   plan     Run the full pipeline and emit the plan + exports (+ Sheets sync).
 *   intake   Run only the intake/discovery module and print the interpretation.
 *   sheets   Re-sync an existing output/plan.json to Google Sheets.
 *   help     Usage.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlanInput } from './core/schemas.ts';
import type { PlanInput, PlanResult } from './core/types.ts';
import { runPlan } from './pipeline/run.ts';
import { loadConfig } from './config/env.ts';
import { CostController } from './core/cost.ts';
import { buildProviders } from './providers/registry.ts';
import { openStore } from './storage/store.ts';
import { syncToSheets } from './exporters/sheets.ts';
import { log } from './core/logger.ts';

function parseArgs(argv: string[]): { _: string[]; flags: Record<string, string | boolean> } {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key.startsWith('no-')) {
        flags[key.slice(3)] = false;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

function loadInput(flags: Record<string, string | boolean>): PlanInput {
  let raw: Record<string, unknown> = {};
  if (typeof flags.config === 'string') {
    if (!existsSync(flags.config)) throw new Error(`config file not found: ${flags.config}`);
    raw = JSON.parse(readFileSync(flags.config, 'utf8'));
  }
  // Flag overrides
  for (const k of ['idea', 'seedKeyword', 'broadTopic', 'nicheDescription', 'audience', 'monetization', 'geo', 'language', 'brandPositioning', 'contentStyle', 'siteType', 'exampleCompetitor'] as const) {
    if (typeof flags[k] === 'string') raw[k] = flags[k];
  }
  if (typeof flags.minArticles === 'string') raw.minArticles = Number(flags.minArticles);
  if (typeof flags.maxArticles === 'string') raw.maxArticles = Number(flags.maxArticles);
  if (typeof flags.competitors === 'string') raw.competitors = (flags.competitors as string).split(',').map((s) => s.trim());
  if (typeof flags.excludedTopics === 'string') raw.excludedTopics = (flags.excludedTopics as string).split(',').map((s) => s.trim());
  return parsePlanInput(raw);
}

function banner(title: string): void {
  process.stdout.write(`\n\x1b[1m\x1b[36m=== ${title} ===\x1b[0m\n`);
}

function printSummary(r: Awaited<ReturnType<typeof runPlan>>, outDir: string): void {
  const p = r.plan;
  banner('PLAN SUMMARY');
  const rows: [string, string | number][] = [
    ['Niche', p.intake.interpretedNiche],
    ['Mode', p.liveDataMode ? 'LIVE DATA' : 'STRUCTURAL (metrics null = LIVE_DATA_REQUIRED; never fabricated)'],
    ['Cannibalization-clean', p.cannibalizationClean ? 'YES ✅' : 'NO ⚠️'],
    ['Recommended total', `${p.articleCount.recommendedTotal} (tier ${p.articleCount.tier})`],
    ['Pages in plan', p.pages.length],
    ['First wave', p.articleCount.firstWaveSize],
    ['Categories / Clusters', `${p.taxonomy.categories.length} / ${p.clusters.length}`],
    ['Pillars / Hubs', `${p.pages.filter((x) => x.role === 'pillar').length} / ${p.pages.filter((x) => x.pageType === 'category-hub').length}`],
    ['Internal links', p.pages.reduce((a, x) => a + x.internalLinksOut.length, 0)],
    ['Briefs', p.briefs.length],
    ['Provider/LLM calls', `${p.cost.providerCalls}/${p.cost.llmCalls} (~$${p.cost.estimatedUsd})`],
  ];
  for (const [k, v] of rows) process.stdout.write(`  ${k.padEnd(24)} ${v}\n`);

  banner('PHASE DISTRIBUTION');
  for (const ph of p.kdByPhase.phases) {
    process.stdout.write(`  Phase ${ph.phase} (${ph.label}) KD ${ph.kdRange[0]}-${ph.kdRange[1]}: ${ph.pageCount} pages\n`);
  }

  banner('OUTPUTS');
  process.stdout.write(`  Output dir:        ${outDir}/\n`);
  process.stdout.write(`  Content map:       ${join(outDir, 'content-map.csv')} | ${join(outDir, 'content-map.json')}\n`);
  process.stdout.write(`  Reports:           ${join(outDir, 'reports')}/ (15 strategy docs)\n`);
  process.stdout.write(`  Astro manifest:    ${join(outDir, 'astro')}/\n`);
  process.stdout.write(`  Briefs:            ${join(outDir, 'briefs')}/ (${p.briefs.length} files)\n`);
  if (r.sheets) {
    process.stdout.write(`  Google Sheets:     ${r.sheets.dryRun ? 'DRY-RUN (no creds) — workbook mirrored to CSV tabs' : `https://docs.google.com/spreadsheets/d/${r.sheets.spreadsheetId}`}\n`);
    process.stdout.write(`  Tabs synced:       ${r.sheets.tabs.length} (changed pages: ${r.sheets.changedPages})\n`);
  }
  process.stdout.write('\n');
}

async function cmdPlan(flags: Record<string, string | boolean>): Promise<void> {
  const input = loadInput(flags);
  const outDir = (typeof flags.out === 'string' && flags.out) || 'output';
  mkdirSync(outDir, { recursive: true });
  const r = await runPlan({
    input,
    outDir,
    dryRunSheets: flags['dry-run-sheets'] === true,
    sync: flags.sync !== false,
  });
  printSummary(r, outDir);
}

async function cmdIntake(flags: Record<string, string | boolean>): Promise<void> {
  const input = loadInput(flags);
  const cfg = loadConfig();
  const cost = new CostController(cfg.cost);
  const providers = buildProviders(cfg, cost);
  const intake = await providers.intake.interpret(input);
  process.stdout.write(JSON.stringify(intake, null, 2) + '\n');
}

async function cmdSheets(flags: Record<string, string | boolean>): Promise<void> {
  const outDir = (typeof flags.out === 'string' && flags.out) || 'output';
  const planPath = join(outDir, 'plan.json');
  if (!existsSync(planPath)) throw new Error(`No plan at ${planPath}. Run "plan" first.`);
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as PlanResult;
  const cfg = loadConfig();
  const cost = new CostController(cfg.cost);
  const providers = buildProviders(cfg, cost, { forceDryRunSheets: flags['dry-run-sheets'] === true });
  const store = openStore(cfg.dbPath);
  const summary = await syncToSheets(providers.sheets, store, plan, {});
  store.close();
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

function help(): void {
  process.stdout.write(
    [
      'seo-planner — organic-traffic SEO planning for brand-new Astro sites',
      '',
      'Usage:',
      '  tsx src/cli.ts plan   --config examples/ai-tools-for-marketers.json --out output',
      '  tsx src/cli.ts plan   --idea "I want a site about AI tools for marketers" --siteType affiliate',
      '  tsx src/cli.ts intake --idea "I want a no-backlink site about personal finance for beginners"',
      '  tsx src/cli.ts sheets --out output            # re-sync existing plan to Sheets',
      '',
      'Common flags:',
      '  --config <path>        JSON PlanInput file',
      '  --idea "<text>"        site idea (required if no --config)',
      '  --out <dir>            output dir (default: output)',
      '  --siteType <type>      affiliate|lead-gen|saas-support|ads|newsletter|ecommerce|service-business|mixed',
      '  --competitors a,b      comma-separated competitor domains',
      '  --minArticles N        floor (>=200 enforced)  --maxArticles N  cap',
      '  --dry-run-sheets       force Sheets dry-run even if creds exist',
      '  --no-sync              skip Sheets sync entirely',
      '',
      'With no SEO API keys the system runs in STRUCTURAL MODE: full structure, null metrics flagged LIVE_DATA_REQUIRED, nothing fabricated.',
    ].join('\n') + '\n',
  );
}

async function main(): Promise<void> {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const cmd = _[0] ?? 'help';
  try {
    if (cmd === 'plan') await cmdPlan(flags);
    else if (cmd === 'intake') await cmdIntake(flags);
    else if (cmd === 'sheets') await cmdSheets(flags);
    else help();
  } catch (err) {
    log.error('command failed', { error: err instanceof Error ? err.message : String(err) });
    if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
    process.exit(1);
  }
}

void main();
