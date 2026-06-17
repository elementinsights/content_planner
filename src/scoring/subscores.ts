/**
 * Normalized 0..1 subscores. Every subscore is explainable and weight-driven.
 *
 * Null-metric handling: when live metrics/SERP are absent, subscores that REQUIRE
 * data (demand, serpWeakness, backlinkDependency) fall back to STRUCTURAL PRIORS
 * derived from page type / intent / funnel — these are planning priors, NOT
 * fabricated metrics (the metric fields themselves remain null and flagged).
 */
import type { KeywordRecord, PageType, SearchIntent, FunnelStage } from '../core/types.ts';
import { DEFAULT_WEIGHTS, weightedBlend, clamp01, type ScoringWeights } from '../config/weights.ts';
import { contentTokens } from '../core/text.ts';

export interface ScoreContext {
  subjectTokens: Set<string>;
  commercialBias: number; // 0..1 from site type
  weights: ScoringWeights;
}

export interface SubscoreResult {
  demand: number;
  serpWeakness: number;
  backlinkDependency: number;
  topicalAuthorityFit: number;
  businessValue: number;
  intentClarity: number;
  promotionPotential: number;
  freshnessRequirement: number;
  categoryFit: number;
  priorsUsed: string[]; // which subscores fell back to structural priors
}

function logNorm(v: number | null, cap: number): number | undefined {
  if (v === null || v === undefined || !Number.isFinite(v)) return undefined;
  if (v <= 0) return 0;
  return clamp01(Math.log10(1 + v) / Math.log10(1 + cap));
}

// Structural priors (planning defaults when no data) -------------------------
const DEMAND_PRIOR_BY_FUNNEL: Record<FunnelStage, number> = { TOFU: 0.45, MOFU: 0.5, BOFU: 0.55 };
const SERP_WEAKNESS_PRIOR_BY_TYPE: Record<PageType, number> = {
  pillar: 0.3, 'category-hub': 0.35, 'sub-hub': 0.45, spoke: 0.55, 'longtail-question': 0.72,
  glossary: 0.7, faq: 0.6, comparison: 0.45, commercial: 0.4, tool: 0.6, template: 0.66,
  checklist: 0.66, 'case-study': 0.6, support: 0.62,
};
const BACKLINK_DEP_PRIOR_BY_TYPE: Record<PageType, number> = {
  pillar: 0.78, 'category-hub': 0.7, 'sub-hub': 0.55, spoke: 0.4, 'longtail-question': 0.22,
  glossary: 0.25, faq: 0.3, comparison: 0.55, commercial: 0.6, tool: 0.45, template: 0.3,
  checklist: 0.3, 'case-study': 0.4, support: 0.28,
};
const BUSINESS_VALUE_BY_TYPE: Record<PageType, number> = {
  pillar: 0.6, 'category-hub': 0.6, 'sub-hub': 0.45, spoke: 0.4, 'longtail-question': 0.3,
  glossary: 0.2, faq: 0.3, comparison: 0.85, commercial: 0.95, tool: 0.7, template: 0.6,
  checklist: 0.55, 'case-study': 0.6, support: 0.25,
};
const FRESHNESS_BY_TYPE: Record<PageType, number> = {
  pillar: 0.8, 'category-hub': 0.55, 'sub-hub': 0.55, spoke: 0.5, 'longtail-question': 0.35,
  glossary: 0.25, faq: 0.55, comparison: 0.85, commercial: 0.85, tool: 0.6, template: 0.35,
  checklist: 0.4, 'case-study': 0.25, support: 0.3,
};
const PROMO_POTENTIAL_BY_TYPE: Record<PageType, number> = {
  pillar: 0.7, 'category-hub': 0.5, 'sub-hub': 0.4, spoke: 0.4, 'longtail-question': 0.35,
  glossary: 0.3, faq: 0.4, comparison: 0.7, commercial: 0.6, tool: 0.95, template: 0.9,
  checklist: 0.85, 'case-study': 0.9, support: 0.2,
};

function intentClarity(intent: SearchIntent, modifierKnown: boolean): number {
  const base = intent === 'transactional' ? 0.9 : intent === 'commercial' ? 0.8 : intent === 'navigational' ? 0.7 : 0.6;
  return clamp01(base + (modifierKnown ? 0.1 : 0));
}

export function computeSubscores(rec: KeywordRecord, pageType: PageType, ctx: ScoreContext): SubscoreResult {
  const w = ctx.weights;
  const priorsUsed: string[] = [];
  const m = rec.metrics;

  // --- Demand ---
  const demandParts: Record<string, number> = {};
  const lv = logNorm(m.searchVolume, 50000);
  const gv = logNorm(m.globalVolume, 200000);
  const tp = logNorm(m.trafficPotential, 50000);
  const cl = logNorm(m.clicks, 30000);
  const cpc = logNorm(m.cpc, 20);
  if (lv !== undefined) demandParts.localVolume = lv;
  if (gv !== undefined) demandParts.globalVolume = gv;
  if (tp !== undefined) demandParts.trafficPotential = tp;
  if (cl !== undefined) demandParts.clicks = cl;
  if (cpc !== undefined) demandParts.cpc = cpc;
  if (m.trend !== null) demandParts.trend = clamp01((m.trend + 1) / 2);
  let demand: number;
  if (Object.keys(demandParts).length > 0) {
    demand = weightedBlend(demandParts, w.demand);
  } else {
    demand = clamp01(DEMAND_PRIOR_BY_FUNNEL[rec.funnel] + (rec.intent === 'commercial' ? 0.05 : 0));
    priorsUsed.push('demand');
  }

  // --- SERP weakness ---
  let serpWeakness: number;
  if (rec.serp && rec.serp.liveData && rec.serp.results.length > 0) {
    const ugc = rec.serp.weakResultsRatio ?? 0;
    const lowRd = rec.serp.medianReferringDomains !== null ? clamp01(1 - logNorm(rec.serp.medianReferringDomains, 500)!) : 0.5;
    serpWeakness = weightedBlend(
      { lowAuthorityPresence: ugc, lowReferringDomains: lowRd, staleResults: 0.5, ugcPresence: ugc, mismatchedIntent: 0.4, weakPageTypeFit: 0.4 },
      w.serpWeakness,
    );
  } else {
    serpWeakness = SERP_WEAKNESS_PRIOR_BY_TYPE[pageType];
    priorsUsed.push('serpWeakness');
  }

  // --- Backlink dependency ---
  let backlinkDependency: number;
  const kdNorm = m.keywordDifficulty !== null ? clamp01(m.keywordDifficulty / 100) : undefined;
  if (kdNorm !== undefined || (rec.serp && rec.serp.medianReferringDomains !== null)) {
    const medRd = rec.serp?.medianReferringDomains ?? null;
    backlinkDependency = weightedBlend(
      {
        kd: kdNorm ?? 0.4,
        medianReferringDomains: medRd !== null ? logNorm(medRd, 500)! : 0.4,
        strongDomainPrevalence: 0.4,
        linkIntensity: kdNorm ?? 0.4,
      },
      w.backlinkDependency,
    );
  } else {
    backlinkDependency = BACKLINK_DEP_PRIOR_BY_TYPE[pageType];
    priorsUsed.push('backlinkDependency');
  }

  // --- Topical authority fit (token overlap with subject; on-topic by construction) ---
  const toks = new Set(contentTokens(rec.keyword));
  let overlap = 0;
  for (const t of toks) if (ctx.subjectTokens.has(t)) overlap++;
  const topicalAuthorityFit = clamp01(0.55 + (toks.size ? (overlap / toks.size) * 0.45 : 0));

  // --- Business value ---
  let bv = BUSINESS_VALUE_BY_TYPE[pageType];
  if (rec.intent === 'commercial' || rec.intent === 'transactional') bv = clamp01(bv + 0.05 + ctx.commercialBias * 0.1);
  if (cpc !== undefined) bv = clamp01(bv * 0.7 + cpc * 0.3);
  const businessValue = bv;

  return {
    demand,
    serpWeakness,
    backlinkDependency,
    topicalAuthorityFit,
    businessValue,
    intentClarity: intentClarity(rec.intent, rec.modifier !== null),
    promotionPotential: PROMO_POTENTIAL_BY_TYPE[pageType],
    freshnessRequirement: FRESHNESS_BY_TYPE[pageType],
    categoryFit: topicalAuthorityFit,
    priorsUsed,
  };
}

export const DEFAULT_SCORE_WEIGHTS = DEFAULT_WEIGHTS;
