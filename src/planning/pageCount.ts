/**
 * Dynamic article-count planner. Recommends the total number of pages (>=200)
 * and snaps it to a tier (200/300/500/700/1000) from explainable signals:
 * keyword-universe size, cluster depth, SERP opportunity, no-backlink feasibility,
 * business value, and publishing/marketing capacity. Produces the required
 * "why not more / why not fewer" justification and a page-type breakdown.
 */
import type { ArticleCountRecommendation, KeywordRecord, Cluster, PlanInput, PageType } from '../core/types.ts';
import { ARCHITECTURE_RATIOS, MIN_ARTICLES_FLOOR, MAX_PILLARS, MIN_PILLARS, PAGE_COUNT_TIERS } from '../config/defaults.ts';
import { DEFAULT_WEIGHTS, weightedBlend, clamp01 } from '../config/weights.ts';

function logNorm(v: number, cap: number): number {
  return clamp01(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + cap));
}

function snapTier(score: number): (typeof PAGE_COUNT_TIERS)[number] {
  if (score < 0.34) return 200;
  if (score < 0.5) return 300;
  if (score < 0.66) return 500;
  if (score < 0.8) return 700;
  return 1000;
}

export function recommendArticleCount(
  records: KeywordRecord[],
  clusters: Cluster[],
  input: PlanInput,
  opts: { commercialBias: number; liveDataMode: boolean; cleanCount: number },
): ArticleCountRecommendation {
  const rawCount = records.length;
  // Base the recommendation on DISTINCT, non-overlapping, cannibalization-clean
  // pages — not raw candidates (many of which collapse during dedup).
  const distinct = opts.cleanCount;
  const clusterSizes = clusters.map((c) => c.memberKeywords.length);
  const meaningfulClusters = clusterSizes.filter((s) => s >= 4).length;
  const avgDepth = clusterSizes.length ? clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length : 0;

  const commercialShare = records.filter((r) => r.intent === 'commercial' || r.intent === 'transactional').length / Math.max(1, distinct);
  const longtailShare = records.filter((r) => r.funnel === 'TOFU' || r.modifier === 'longtail-question').length / Math.max(1, distinct);

  // SERP opportunity: live -> from observed weakness; structural -> proxy from long-tail share.
  const liveSerp = records.filter((r) => r.serp?.liveData);
  const serpOpportunity = liveSerp.length
    ? liveSerp.reduce((a, r) => a + (r.serp!.weakResultsRatio ?? 0.5), 0) / liveSerp.length
    : clamp01(0.45 + longtailShare * 0.3);

  const capacityCap = input.maxArticles ?? null;
  const capacitySignal = capacityCap ? logNorm(capacityCap, 1000) : 0.55; // default: a sustainable mid capacity

  const signals: Record<string, number> = {
    universe: logNorm(distinct, 1200),
    clusterDepth: clamp01(avgDepth / 10) * 0.5 + clamp01(meaningfulClusters / 30) * 0.5,
    serpOpportunity,
    businessValue: clamp01(0.35 + commercialShare * 0.4 + opts.commercialBias * 0.25),
    capacity: capacitySignal,
  };

  const score = weightedBlend(signals, DEFAULT_WEIGHTS.pageCount);
  let tier = snapTier(score);

  // Bound by the clean distinct supply: we cannot plan more non-overlapping pages
  // than actually exist. Step the tier DOWN to the largest tier we can fill.
  const minArticles = Math.max(MIN_ARTICLES_FLOOR, input.minArticles ?? MIN_ARTICLES_FLOOR);
  let recommendedTotal: number = tier;
  if (recommendedTotal > distinct) {
    recommendedTotal =
      [...PAGE_COUNT_TIERS].reverse().find((t) => t <= distinct && t >= minArticles) ?? Math.max(minArticles, Math.min(distinct, tier));
  }
  recommendedTotal = Math.min(recommendedTotal, Math.max(minArticles, distinct));
  if (capacityCap) recommendedTotal = Math.min(recommendedTotal, capacityCap);
  recommendedTotal = Math.max(recommendedTotal, Math.min(minArticles, distinct));
  tier = nearestTier(recommendedTotal);
  if (distinct < MIN_ARTICLES_FLOOR) {
    // Not enough clean distinct pages to hit the floor — surface it (no padding/fabrication).
    // Caller should broaden seeds or enable live data.
  }

  const pageTypeBreakdown = computeBreakdown(recommendedTotal, clusters.length);
  const firstWaveSize = Math.min(100, Math.max(50, Math.round(recommendedTotal * 0.25)));

  const rationale: string[] = [
    `Keyword universe: ${rawCount} raw candidates -> ${distinct} DISTINCT, non-overlapping, cannibalization-clean pages${opts.liveDataMode ? ' (live-validated)' : ' (structural; metrics pending live validation)'}.`,
    `${clusters.length} topic clusters, ${meaningfulClusters} with >=4 members, avg depth ${avgDepth.toFixed(1)} -> supports a hub-and-spoke architecture.`,
    `SERP opportunity signal ${(serpOpportunity * 100).toFixed(0)}% (${opts.liveDataMode ? 'observed SERP weakness' : 'proxied from long-tail share — validate with live SERP'}).`,
    `Commercial share ${(commercialShare * 100).toFixed(0)}%, site commercial-bias ${(opts.commercialBias * 100).toFixed(0)}% -> business-value signal ${(signals.businessValue * 100).toFixed(0)}%.`,
    `Composite page-count score ${(score * 100).toFixed(0)}% -> tier ${tier}; bounded to ${recommendedTotal} by distinct candidates and capacity.`,
  ];

  return {
    recommendedTotal,
    tier,
    minArticles,
    signals: round(signals),
    rationale,
    whyNotFewer: whyNotFewer(recommendedTotal, minArticles, distinct, meaningfulClusters),
    whyNotMore: whyNotMore(recommendedTotal, distinct),
    pageTypeBreakdown,
    firstWaveSize,
    liveDataMode: opts.liveDataMode,
  };
}

function nearestTier(total: number): ArticleCountRecommendation['tier'] {
  let best: ArticleCountRecommendation['tier'] = 200;
  let bestD = Infinity;
  for (const t of PAGE_COUNT_TIERS) {
    const d = Math.abs(t - total);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function computeBreakdown(total: number, categoryCount: number): Record<PageType, number> {
  const types = Object.keys(ARCHITECTURE_RATIOS) as PageType[];
  const ratioSum = types.reduce((a, t) => a + ARCHITECTURE_RATIOS[t], 0);
  const out = {} as Record<PageType, number>;
  for (const t of types) out[t] = Math.round((ARCHITECTURE_RATIOS[t] / ratioSum) * total);
  // Hard caps / structural constraints
  out.pillar = Math.min(MAX_PILLARS, Math.max(MIN_PILLARS, out.pillar));
  out['category-hub'] = Math.max(3, Math.min(5, categoryCount || out['category-hub']));
  // Reconcile to exact total by adjusting spokes (the elastic bucket).
  const current = types.reduce((a, t) => a + out[t], 0);
  out.spoke = Math.max(0, out.spoke + (total - current));
  return out;
}

function whyNotFewer(total: number, min: number, distinct: number, meaningfulClusters: number): string {
  return [
    `Fewer than ${min} would leave clusters incomplete: ${meaningfulClusters} clusters need full hub+spoke+support coverage to build topical authority a brand-new, no-backlink site depends on.`,
    `${distinct} distinct, non-overlapping candidate intents exist; under-planning wastes weak-SERP long-tail opportunities that are the only realistic early wins.`,
    `200 is the floor for a credible topical map; below it, internal linking and cluster completeness are too thin to rank.`,
  ].join(' ');
}

function whyNotMore(total: number, distinct: number): string {
  if (total >= 700) {
    return `${total}+ is justified ONLY because the niche yields that many distinct, non-overlapping, strategically valuable intents (${distinct} candidates) with enough cluster depth and SERP opportunity to avoid thin/duplicate pages. Each page must still pass the cannibalization gate and a per-row volume-threshold decision.`;
  }
  return [
    `700+ would be excessive here: it would force thin, overlapping, or zero-value pages beyond the ${distinct} genuinely distinct candidate intents, raising cannibalization risk and maintenance/refresh burden.`,
    `A brand-new, no-backlink site must pace topical-authority growth; flooding ${total > 300 ? total : 'the site'} past demand dilutes crawl budget and internal-link equity.`,
    `Quality + cluster completeness beat raw volume: we expand to a higher tier later only if live data proves additional non-overlapping demand.`,
  ].join(' ');
}

function round(obj: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Math.round(v * 1000) / 1000;
  return out;
}
