/**
 * Content-map generator — the centerpiece. Turns the scored keyword universe into
 * the final PlannedPage[] with every required column:
 *   - assigns page type + pillar/hub/spoke role (caps pillars 1-3)
 *   - computes all subscores + composite scores
 *   - assigns publishing phase (KD/no-backlink aware)
 *   - plans Astro route/collection/filename/frontmatter
 *   - runs cannibalization PREVENTION -> clean kept set
 *   - selects the recommended total (>=200), keeping structural hubs/pillars
 *   - computes per-row volume-threshold decision, KD range, external sources
 */
import type {
  IntakeResult,
  KeywordRecord,
  Taxonomy,
  PlannedPage,
  PageType,
  PageRole,
  Scores,
  CannibalizationReport,
} from '../core/types.ts';
import type { ClusteringResult } from '../clustering/cluster.ts';
import type { ScoringWeights } from '../config/weights.ts';
import { emptyMetrics } from '../core/types.ts';
import { MAX_PILLARS } from '../config/defaults.ts';
import { slugify, titleCase, contentTokens } from '../core/text.ts';
import { pageId as makePageId } from '../core/ids.ts';
import { computeSubscores, type ScoreContext } from '../scoring/subscores.ts';
import { computeScores } from '../scoring/scores.ts';
import { planAstro } from './astroPlan.ts';
import { recommendVolumeThreshold } from './volumeThresholds.ts';
import { recommendedKdRange } from './kdByPhase.ts';
import { planExternalSources } from './externalSources.ts';
import { serpSignature } from '../ingestion/serp.ts';
import {
  preventCannibalization,
  type CannibalCandidate,
} from '../cannibalization/cannibalization.ts';
import { log } from '../core/logger.ts';

export interface ContentMapDeps {
  intake: IntakeResult;
  records: KeywordRecord[];
  clustering: ClusteringResult;
  taxonomy: Taxonomy;
  weights: ScoringWeights;
  commercialBias: number;
}

export interface ContentMapResult {
  /** ALL cannibalization-clean pages (pre-truncation). Use selectTopPages() to cut to target. */
  pages: PlannedPage[];
  cannibalizationReport: CannibalizationReport;
}

const SUB_HUB_MIN_CLUSTER_SIZE = 6;

function roleFor(pageType: PageType): PageRole {
  if (pageType === 'pillar') return 'pillar';
  if (pageType === 'category-hub') return 'hub';
  if (pageType === 'sub-hub') return 'sub-hub';
  if (pageType === 'glossary' || pageType === 'support' || pageType === 'faq') return 'support';
  return 'spoke';
}

/** Readiness for early publishing: high no-backlink opportunity + low link dependency. */
function readiness(scores: Scores): number {
  return scores.noBacklinkOpportunity * 0.6 + (1 - scores.backlinkDependency) * 0.4;
}

interface WorkingPage {
  rec: KeywordRecord;
  pageType: PageType;
  role: PageRole;
  scores: Scores;
  phase: number;
  clusterId: string;
  clusterName: string;
  subclusterName: string;
  categorySlug: string;
  categoryName: string;
  clusterSlug: string;
  astro: ReturnType<typeof planAstro>;
  priorsUsed: string[];
}

export function buildContentMap(deps: ContentMapDeps): ContentMapResult {
  const { intake, records, clustering, taxonomy, weights, commercialBias } = deps;
  const subjectTokens = new Set(contentTokens(intake.interpretedNiche));
  const ctx: ScoreContext = { subjectTokens, commercialBias, weights };
  const isYmyl = intake.ymylRiskFlags.length > 0;

  const nameBySlug = new Map(taxonomy.categories.map((c) => [c.slug, c.name]));
  const clusterCompletenessById = new Map<string, number>();

  // --- 1. Identify pillars, category-hubs, and sub-hubs -----------------
  // Distinct roles: pillars (1-2 flagship guides, root URL) are SEPARATE from
  // category-hubs (one landing page per category). Sub-hubs only for deep clusters.
  const clusterMeta = new Map<string, { catSlug: string }>();
  for (const rec of records) {
    const cid = clustering.clusterIdByKeyword.get(rec.keyword);
    if (cid && !clusterMeta.has(cid)) clusterMeta.set(cid, { catSlug: rec.category });
  }
  for (const cl of deps.clustering.clusters) clusterCompletenessById.set(cl.id, cl.completeness);

  const clustersBySize = deps.clustering.clusters.slice().sort((a, b) => b.memberKeywords.length - a.memberKeywords.length);
  const usedClusters = new Set<string>();
  const pillarKeywords = new Set<string>();
  const categoryHubKeywords = new Set<string>();
  const hubKeywords = new Set<string>();

  // Category-hub FIRST: ONE per category — its largest cluster. Guarantees every
  // top-level category has a landing/hub page (pillars cannot starve a category).
  const catBest = new Map<string, { hub: string; size: number; id: string }>();
  for (const cl of clustersBySize) {
    if (!cl.hubKeyword) continue;
    const catSlug = clusterMeta.get(cl.id)?.catSlug ?? 'fundamentals';
    const cur = catBest.get(catSlug);
    if (!cur || cl.memberKeywords.length > cur.size) catBest.set(catSlug, { hub: cl.hubKeyword, size: cl.memberKeywords.length, id: cl.id });
  }
  for (const v of catBest.values()) {
    categoryHubKeywords.add(v.hub);
    usedClusters.add(v.id);
  }

  // Pillars: the 1-2 largest clusters that are NOT already a category hub.
  const pillarBudget = Math.min(MAX_PILLARS, 2);
  for (const cl of clustersBySize) {
    if (pillarKeywords.size >= pillarBudget) break;
    if (usedClusters.has(cl.id) || !cl.hubKeyword) continue;
    if (cl.memberKeywords.length >= 8) {
      pillarKeywords.add(cl.hubKeyword);
      usedClusters.add(cl.id);
    }
  }

  // Sub-hubs: remaining clusters with enough depth.
  for (const cl of deps.clustering.clusters) {
    if (usedClusters.has(cl.id) || !cl.hubKeyword) continue;
    if (cl.memberKeywords.length >= SUB_HUB_MIN_CLUSTER_SIZE) hubKeywords.add(cl.hubKeyword);
  }

  // --- 2. Build working pages with scores -------------------------------
  const working: WorkingPage[] = [];
  for (const rec of records) {
    let pageType: PageType = (rec.modifier as PageType) ?? 'spoke';
    if (pillarKeywords.has(rec.keyword)) pageType = 'pillar';
    else if (categoryHubKeywords.has(rec.keyword)) pageType = 'category-hub';
    else if (hubKeywords.has(rec.keyword)) pageType = 'sub-hub';
    // Intent-driven typing: a generic informational hint with real commercial/
    // transactional intent (e.g. from DataForSEO) becomes a commercial page.
    else if ((rec.intent === 'commercial' || rec.intent === 'transactional') && (pageType === 'spoke' || pageType === 'longtail-question')) {
      pageType = 'commercial';
    }
    const role = roleFor(pageType);

    const cid = clustering.clusterIdByKeyword.get(rec.keyword);
    const clusterImportance = clustering.importanceByKeyword.get(rec.keyword) ?? 0.3;
    const clusterCompleteness = cid ? (clusterCompletenessById.get(cid) ?? 0.3) : 0.3;
    const sub = computeSubscores(rec, pageType, ctx);
    const scores = computeScores(sub, {
      pageType,
      role,
      clusterImportance,
      clusterCompleteness,
      internalLinkValue: clusterImportance,
      weights,
    });
    const phase = 1; // placeholder; assigned by the quantile pass after pillar elevation
    const categorySlug = rec.category;
    const categoryName = nameBySlug.get(categorySlug) ?? titleCase(categorySlug);
    const clusterName = clustering.clusterNameByKeyword.get(rec.keyword) ?? `${categoryName} essentials`;
    const subclusterName = clustering.subclusterByKeyword.get(rec.keyword) ?? titleCase(rec.intent);
    const clusterSlug = slugify(clusterName);
    const astro = planAstro({ primaryKeyword: rec.keyword, pageType, role, categorySlug, clusterSlug, subject: intake.interpretedNiche });
    working.push({ rec, pageType, role, scores, phase, clusterId: cid ?? '', clusterName, subclusterName, categorySlug, categoryName, clusterSlug, astro, priorsUsed: sub.priorsUsed });
  }

  // --- 3. Publishing phase by readiness quantile (provisional; finalized post-truncation) ---
  // ~30% easiest -> Phase 1, ~35% -> Phase 2, ~25% -> Phase 3, ~10% hardest -> Phase 4.
  // Pillars publish last; hubs no earlier than phase 3/2 (they need supporting spokes).
  const byReadiness = working.slice().sort((a, b) => readiness(b.scores) - readiness(a.scores));
  const n = byReadiness.length || 1;
  byReadiness.forEach((w, i) => {
    const q = i / n;
    let ph = q < 0.3 ? 1 : q < 0.65 ? 2 : q < 0.9 ? 3 : 4;
    if (w.role === 'pillar') ph = 4;
    else if (w.pageType === 'category-hub') ph = Math.max(ph, 3);
    else if (w.pageType === 'sub-hub') ph = Math.max(ph, 2);
    w.phase = ph;
  });

  // --- 4. Cannibalization prevention ------------------------------------
  const byPageId = new Map<string, WorkingPage>();
  const candidates: CannibalCandidate[] = working.map((w) => {
    const pid = makePageId(w.rec.keyword, w.pageType);
    byPageId.set(pid, w);
    return {
      pageId: pid,
      primaryKeyword: w.rec.keyword,
      secondaryKeywords: [],
      parentTopic: w.rec.metrics.parentTopic,
      intent: w.rec.intent,
      funnel: w.rec.funnel,
      pageType: w.pageType,
      subcluster: w.subclusterName,
      title: w.astro.recommendedTitle,
      h1: w.astro.recommendedH1,
      urlPath: w.astro.urlPath,
      serpDomains: serpSignature(w.rec.serp),
      // Compare by unique cluster ID (display names can collide across categories).
      cluster: w.clusterId || w.clusterName,
      // Boost backbone so pillars/hubs always WIN cannibalization (never merged away).
      priority: w.scores.priority + (w.role === 'pillar' ? 1 : w.pageType === 'category-hub' ? 0.9 : w.pageType === 'sub-hub' ? 0.5 : 0),
      protected: w.role === 'pillar' || w.pageType === 'category-hub',
    };
  });
  const outcome = preventCannibalization(candidates);
  log.info('cannibalization complete', { kept: outcome.kept.length, ...outcome.report });

  // --- 5. Finalize ALL clean pages (truncation to target happens later) --
  const pages: PlannedPage[] = [];
  for (const cand of outcome.kept) {
    const w = byPageId.get(cand.pageId)!;
    const status = outcome.statusById.get(cand.pageId) ?? { status: 'clean' as const, resolution: null, uniqueIntentNote: '' };
    pages.push(finalizePage(cand, w, status, { intake, isYmyl }));
  }
  pages.sort((a, b) => a.publishingPhase - b.publishingPhase || b.priorityScore - a.priorityScore);

  const report = { ...outcome.report, finalPages: pages.length };
  return { pages, cannibalizationReport: report };
}

const isBackbone = (p: PlannedPage): boolean =>
  p.role === 'pillar' || p.pageType === 'category-hub' || p.pageType === 'sub-hub';

const readinessPage = (p: PlannedPage): number =>
  p.scores.noBacklinkOpportunity * 0.6 + (1 - p.scores.backlinkDependency) * 0.4;

/**
 * Truncate the clean page set to the recommended total, always keeping the
 * structural backbone (pillars + category/sub hubs) and the highest-priority
 * spokes. Then (re)assigns publishing phases by readiness quantile ON THE FINAL
 * SET so the cadence (~30/35/25/10) and phase-dependent fields are correct.
 */
export function selectTopPages(pages: PlannedPage[], target: number): PlannedPage[] {
  let final: PlannedPage[];
  if (pages.length <= target) {
    final = pages.slice();
  } else {
    const required = pages.filter(isBackbone);
    const others = pages.filter((p) => !isBackbone(p)).sort((a, b) => b.priorityScore - a.priorityScore);
    final = required.length >= target ? required.slice(0, target) : [...required, ...others.slice(0, target - required.length)];
  }
  assignPhasesToFinal(final);
  final.sort((a, b) => a.publishingPhase - b.publishingPhase || b.priorityScore - a.priorityScore);
  return final;
}

/** Quantile phase assignment + refresh of phase-dependent fields on the final set. */
function assignPhasesToFinal(pages: PlannedPage[]): void {
  const byReadiness = pages.slice().sort((a, b) => readinessPage(b) - readinessPage(a));
  const n = byReadiness.length || 1;
  byReadiness.forEach((p, i) => {
    const q = i / n;
    let ph = q < 0.3 ? 1 : q < 0.65 ? 2 : q < 0.9 ? 3 : 4;
    if (p.role === 'pillar') ph = 4;
    else if (p.pageType === 'category-hub') ph = Math.max(ph, 3);
    else if (p.pageType === 'sub-hub') ph = Math.max(ph, 2);
    p.publishingPhase = ph;
    (p.frontmatter as Record<string, unknown>).publishPhase = ph;
    p.recommendedKdRange = recommendedKdRange(ph, p.scores);
    const vt = recommendVolumeThreshold(pageToRecLite(p), p.pageType, ph, p.scores);
    p.recommendedMinVolumeThreshold = vt.threshold;
    p.volumeThresholdDecision = vt.decision;
  });
}

/** Reconstruct a minimal KeywordRecord from a finalized page for threshold recompute. */
function pageToRecLite(p: PlannedPage): KeywordRecord {
  return {
    keyword: p.primaryKeyword,
    normalized: p.primaryKeyword,
    intent: p.searchIntent,
    funnel: p.funnelStage,
    modifier: null,
    sourceTopic: '',
    category: '',
    metrics: {
      ...emptyMetrics(),
      searchVolume: p.searchVolume,
      globalVolume: p.globalVolume,
      trafficPotential: p.trafficPotential,
      cpc: p.cpc,
      clicks: p.clicks,
      keywordDifficulty: p.keywordDifficulty,
      parentTopic: p.parentTopic,
      liveData: p.liveData,
    },
  };
}

export function tallyPhases(pages: PlannedPage[]): Record<number, number> {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of pages) out[p.publishingPhase] = (out[p.publishingPhase] ?? 0) + 1;
  return out;
}

function finalizePage(
  cand: CannibalCandidate,
  w: WorkingPage,
  status: { status: PlannedPage['cannibalizationStatus']; resolution: string | null; uniqueIntentNote: string },
  opts: { intake: IntakeResult; isYmyl: boolean },
): PlannedPage {
  const { rec, pageType, role, scores, phase, astro } = w;
  const m = rec.metrics;
  const vt = recommendVolumeThreshold(rec, pageType, phase, scores);
  const kd = recommendedKdRange(phase, scores);
  const ext = planExternalSources({ pageType, intent: rec.intent, isYmyl: opts.isYmyl, primaryKeyword: rec.keyword });

  const liveData = m.liveData;
  const dataFlags: string[] = [];
  if (!liveData) dataFlags.push('LIVE_DATA_REQUIRED');
  if (w.priorsUsed.length) dataFlags.push(`STRUCTURAL_PRIORS:${w.priorsUsed.join('+')}`);

  const serpLive = !!rec.serp?.liveData;
  const topCompetingUrls = serpLive ? rec.serp!.results.slice(0, 5).map((r) => r.url) : [];
  const serpFeatureSummary = serpLive ? (rec.serp!.features.join(', ') || 'organic-only') : 'LIVE_DATA_REQUIRED';
  const competingPageType = serpLive ? inferCompetingType(rec.serp!.results.map((r) => r.url)) : 'LIVE_DATA_REQUIRED';

  const volumeToTpRatio = m.searchVolume !== null && m.trafficPotential ? Number((m.searchVolume / m.trafficPotential).toFixed(2)) : null;

  const uniquePageIntent =
    `${titleCase(pageType)} serving ${rec.funnel}/${rec.intent} intent for "${rec.keyword}" within the ${w.clusterName} cluster.` +
    (status.uniqueIntentNote ? ` ${status.uniqueIntentNote}` : '');

  const frontmatter: Record<string, unknown> = {
    title: astro.recommendedTitle,
    description: `${titleCase(rec.keyword)} — ${astro.recommendedContentFormat.split('(')[0].trim()}.`,
    slug: astro.slug,
    draft: true,
    category: w.categoryName,
    subcategory: w.subclusterName,
    cluster: w.clusterName,
    subcluster: w.subclusterName,
    pageType,
    pillarHubSpokeRole: role,
    searchIntent: rec.intent,
    funnelStage: rec.funnel,
    primaryKeyword: rec.keyword,
    secondaryKeywords: cand.secondaryKeywords,
    parentTopic: m.parentTopic,
    searchVolume: m.searchVolume,
    trafficPotential: m.trafficPotential,
    keywordDifficulty: m.keywordDifficulty,
    priorityScore: scores.priority,
    internalLinks: [] as string[], // filled by internal-link planner export
    externalSources: ext.suggestedDomains.slice(0, 3),
    publishPhase: phase,
    marketingAngle: '',
    humanReviewStatus: 'pending',
    lastReviewed: null,
  };

  return {
    pageId: cand.pageId,
    primaryKeyword: rec.keyword,
    secondaryKeywords: cand.secondaryKeywords,
    parentTopic: m.parentTopic,
    topCategory: w.categoryName,
    subcategory: w.subclusterName,
    cluster: w.clusterName,
    subcluster: w.subclusterName,
    pageType,
    role,
    searchIntent: rec.intent,
    funnelStage: rec.funnel,
    businessValue: scores.businessValue,
    recommendedMinVolumeThreshold: vt.threshold,
    volumeThresholdDecision: vt.decision,
    searchVolume: m.searchVolume,
    globalVolume: m.globalVolume,
    trafficPotential: m.trafficPotential,
    volumeToTpRatio,
    cpc: m.cpc,
    clicks: m.clicks,
    recommendedKdRange: kd,
    noBacklinkOpportunityScore: scores.noBacklinkOpportunity,
    keywordDifficulty: m.keywordDifficulty,
    serpWeaknessScore: scores.serpWeakness,
    serpFeatureSummary,
    topCompetingUrls,
    competingPageType,
    backlinkDependencyScore: scores.backlinkDependency,
    competitorReferringDomains: rec.serp?.medianReferringDomains ?? null,
    competitorDomainStrength: null,
    recommendedContentFormat: astro.recommendedContentFormat,
    recommendedTitle: astro.recommendedTitle,
    recommendedH1: astro.recommendedH1,
    slug: astro.slug,
    urlPath: astro.urlPath,
    astroRoute: astro.astroRoute,
    astroCollection: astro.astroCollection,
    markdownFilename: astro.markdownFilename,
    frontmatter,
    category: w.categoryName,
    tags: astro.tags,
    internalLinksIn: [],
    internalLinksOut: [],
    anchorText: [],
    externalSourcePlan: ext,
    freshnessRequirement: ext.freshnessRequirement,
    uniquePageIntent,
    cannibalizationStatus: status.status,
    conflictResolution: status.resolution,
    priorityScore: scores.priority,
    publishingPhase: phase,
    contentMarketingPriority: scores.contentMarketing,
    promotionChannels: [],
    humanReviewStatus: 'pending',
    sheetRowStatus: 'new',
    notes: `source:${rec.sourceTopic}${dataFlags.length ? ' | ' + dataFlags.join(' | ') : ''}`,
    scores,
    liveData,
    dataFlags,
  };
}

function inferCompetingType(urls: string[]): string {
  const s = urls.join(' ').toLowerCase();
  if (/best|top|review|vs|alternative/.test(s)) return 'comparison/commercial';
  if (/how-to|guide|what-is|tips/.test(s)) return 'informational guide';
  if (/template|checklist|tool|calculator/.test(s)) return 'tool/template';
  return 'mixed';
}
