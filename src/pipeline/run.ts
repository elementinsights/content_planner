/**
 * End-to-end pipeline. Orchestrates: config -> providers -> intake -> keyword/SERP
 * /competitor ingestion -> clustering -> taxonomy -> article-count -> content map
 * (cannibalization-clean) -> internal links -> marketing -> briefs -> reports ->
 * exports -> Google Sheets sync. Returns the PlanResult + sheet summary.
 */
import { loadConfig } from '../config/env.ts';
import { CostController } from '../core/cost.ts';
import { DEFAULT_WEIGHTS } from '../config/weights.ts';
import { SITE_TYPE_HINTS } from '../config/defaults.ts';
import { buildProviders } from '../providers/registry.ts';
import { openStore } from '../storage/store.ts';
import { runId as makeRunId } from '../core/ids.ts';
import { log } from '../core/logger.ts';
import type { PlanInput, PlanResult } from '../core/types.ts';

import { ingestKeywords } from '../ingestion/keywords.ts';
import { filterRelevantKeywords } from '../intake/llmRelevance.ts';
import { completenessSeeds } from '../intake/completenessSeeds.ts';
import { uniq } from '../core/text.ts';
import { ingestSerp } from '../ingestion/serp.ts';
import { analyzeCompetitors } from '../ingestion/competitors.ts';
import { clusterKeywords } from '../clustering/cluster.ts';
import { refineClustersWithLLM } from '../clustering/llmClusterRefine.ts';
import { buildTaxonomy } from '../taxonomy/taxonomy.ts';
import { recommendArticleCount } from '../planning/pageCount.ts';
import { buildContentMap, selectTopPages, tallyPhases } from '../planning/contentMap.ts';
import { planInternalLinks } from '../planning/internalLinks.ts';
import { planMarketing } from '../planning/marketing.ts';
import { buildBriefs } from '../planning/briefs.ts';
import { buildKdByPhaseReport } from '../planning/kdByPhase.ts';
import { buildVolumeThresholdReport } from '../planning/volumeThresholds.ts';

import { buildWorkbook } from '../exporters/workbook.ts';
import { exportJson } from '../exporters/json.ts';
import { exportCsv } from '../exporters/csv.ts';
import { exportAstro } from '../exporters/astroManifest.ts';
import { exportBriefs } from '../exporters/markdownBriefs.ts';
import { exportReports } from '../exporters/reports.ts';
import { syncToSheets, type SheetsSyncSummary } from '../exporters/sheets.ts';

export interface RunOptions {
  input: PlanInput;
  outDir: string;
  dryRunSheets?: boolean;
  sync?: boolean;
}

export interface RunResult {
  plan: PlanResult;
  files: string[];
  sheets?: SheetsSyncSummary;
}

export async function runPlan(opts: RunOptions): Promise<RunResult> {
  const { input, outDir } = opts;
  const cfg = loadConfig();
  const cost = new CostController(cfg.cost);
  const providers = buildProviders(cfg, cost, { forceDryRunSheets: opts.dryRunSheets });
  const store = openStore(cfg.dbPath);
  const geo = { geo: input.geo ?? cfg.geoDefault, language: input.language ?? cfg.languageDefault };
  const commercialBias = SITE_TYPE_HINTS[input.siteType ?? 'mixed'].commercialBias;
  const generatedAtIso = new Date().toISOString();
  const runId = makeRunId(input.idea, generatedAtIso);

  log.step('Phase 1 — Intake / discovery');
  const intake = await providers.intake.interpret(input);
  log.info('intake complete', { niche: intake.interpretedNiche, seedTopics: intake.seedTopics.length, categories: intake.initialCategories.length });

  log.step('Phase 1b — LLM completeness audit (gap-finding seed expansion)');
  const gapSeeds = await completenessSeeds(intake, cfg, cost);
  if (gapSeeds.length) {
    intake.seedTopics = uniq([...intake.seedTopics, ...gapSeeds]);
    intake.seedKeywords = uniq([...intake.seedKeywords, ...gapSeeds]);
    log.info('seed set expanded by completeness audit', { seedKeywords: intake.seedKeywords.length, seedTopics: intake.seedTopics.length });
  }

  log.step('Phase 5 — Keyword ingestion + expansion');
  let records = await ingestKeywords(intake, providers, geo);

  log.step('Phase 5b — LLM topical-relevance gate (drops off-topic keywords before the expensive steps)');
  records = await filterRelevantKeywords(records, intake, cfg, cost);

  log.step('Phase 6 — SERP ingestion (live only; powers SERP-overlap clustering)');
  const serpBudget = Number(process.env.SEO_SERP_BUDGET ?? 300);
  await ingestSerp(records, providers.serp, geo, { limit: serpBudget, cache: store });

  log.step('Phase 7 — Competitor research + gap analysis');
  const competitors = await analyzeCompetitors(intake, providers, geo);

  log.step('Phase 10 — Clustering');
  const clustering = clusterKeywords(records, intake);
  log.info('clustering complete', { clusters: clustering.clusters.length });

  log.step('Phase 10b — LLM cluster refinement (names + best-pillar selection)');
  await refineClustersWithLLM(clustering, records, intake, cfg, cost);

  log.step('Phase 8 — Category / taxonomy');
  const taxonomy = buildTaxonomy(intake, clustering.clusters);

  log.step('Phase 11/12/16 — Content map (scoring + cannibalization-clean)');
  const cm = buildContentMap({ intake, records, clustering, taxonomy, weights: DEFAULT_WEIGHTS, commercialBias });

  log.step('Phase 15 — Dynamic article-count recommendation');
  const articleCount = recommendArticleCount(records, clustering.clusters, input, { commercialBias, liveDataMode: cfg.liveDataMode, cleanCount: cm.pages.length });
  log.info('article count', { recommendedTotal: articleCount.recommendedTotal, tier: articleCount.tier, cleanPages: cm.pages.length });

  // Truncate the clean set to the recommended total (keeps hubs/pillars + top spokes).
  const pages = selectTopPages(cm.pages, articleCount.recommendedTotal);
  const cannibalizationReport = { ...cm.cannibalizationReport, finalPages: pages.length };

  log.step('Phase 17 — Internal-link planning');
  planInternalLinks(pages);

  log.step('Phase 20 — Content marketing planning');
  const marketing = planMarketing(pages, providers.marketing);

  log.step('Phase 19 — Brief generation');
  const briefs = buildBriefs(pages, intake);

  const pagesPerPhase = tallyPhases(pages);
  const kdByPhase = buildKdByPhaseReport(pagesPerPhase);
  const volumeThresholdReport = buildVolumeThresholdReport();

  const plan: PlanResult = {
    runId,
    generatedAtIso,
    input,
    intake,
    taxonomy,
    clusters: clustering.clusters,
    articleCount,
    pages,
    briefs,
    marketing,
    cannibalizationReport,
    kdByPhase,
    volumeThresholdReport,
    cost: cost.summary(),
    liveDataMode: cfg.liveDataMode,
    cannibalizationClean: cm.cannibalizationReport.clean,
  };

  log.step('Phases 21-23 — Exports');
  const tabs = buildWorkbook(plan);
  const files: string[] = [
    ...exportJson(outDir, plan),
    ...exportCsv(outDir, tabs),
    ...(await exportAstro(outDir, plan.pages)),
    ...exportBriefs(outDir, briefs, plan.pages),
    ...exportReports(outDir, plan, competitors),
  ];

  let sheets: SheetsSyncSummary | undefined;
  if (opts.sync !== false) {
    log.step('Phase 21 — Google Sheets sync');
    sheets = await syncToSheets(providers.sheets, store, plan, {});
  }

  cost.report();
  store.close();
  return { plan, files, sheets };
}
