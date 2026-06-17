/**
 * Composite scores built from subscores. All explainable, weight-driven blends.
 * Produces the full Scores object used for prioritization, phasing, page-type
 * suitability, internal-link importance, and content-marketing priority.
 */
import type { Scores, PageType, PageRole } from '../core/types.ts';
import type { SubscoreResult } from './subscores.ts';
import { weightedBlend, clamp01, type ScoringWeights } from '../config/weights.ts';

const PILLAR_SUIT: Record<PageType, number> = {
  pillar: 0.95, 'category-hub': 0.7, 'sub-hub': 0.45, spoke: 0.2, 'longtail-question': 0.05,
  glossary: 0.1, faq: 0.15, comparison: 0.3, commercial: 0.4, tool: 0.2, template: 0.15,
  checklist: 0.1, 'case-study': 0.2, support: 0.05,
};
const HUB_SUIT: Record<PageType, number> = {
  pillar: 0.6, 'category-hub': 0.95, 'sub-hub': 0.85, spoke: 0.25, 'longtail-question': 0.1,
  glossary: 0.1, faq: 0.3, comparison: 0.35, commercial: 0.5, tool: 0.2, template: 0.15,
  checklist: 0.15, 'case-study': 0.2, support: 0.1,
};
const SPOKE_SUIT: Record<PageType, number> = {
  pillar: 0.1, 'category-hub': 0.2, 'sub-hub': 0.4, spoke: 0.95, 'longtail-question': 0.9,
  glossary: 0.7, faq: 0.6, comparison: 0.7, commercial: 0.7, tool: 0.6, template: 0.6,
  checklist: 0.6, 'case-study': 0.7, support: 0.7,
};
const INTERNAL_LINK_IMPORTANCE: Record<PageType, number> = {
  pillar: 0.95, 'category-hub': 0.9, 'sub-hub': 0.75, spoke: 0.5, 'longtail-question': 0.4,
  glossary: 0.7, faq: 0.45, comparison: 0.6, commercial: 0.65, tool: 0.6, template: 0.55,
  checklist: 0.5, 'case-study': 0.45, support: 0.6,
};
// Click-resilience: how likely a searcher still CLICKS through vs. getting the
// answer from an AI Overview / featured snippet. Tools, comparisons, and buying
// guides keep their clicks; bare definitions / simple "what is X" lose them.
// Drives publishing priority so effort goes to pages that actually earn visits.
const CLICK_RESILIENCE: Record<PageType, number> = {
  pillar: 0.6, 'category-hub': 0.6, 'sub-hub': 0.55, spoke: 0.5, 'longtail-question': 0.25,
  glossary: 0.2, faq: 0.3, comparison: 0.9, commercial: 0.95, tool: 1, template: 0.9,
  checklist: 0.85, 'case-study': 0.8, support: 0.4,
};

export interface ScoreInputs {
  pageType: PageType;
  role: PageRole;
  clusterImportance: number; // 0..1 from cluster size/centrality
  clusterCompleteness: number; // 0..1
  internalLinkValue: number; // 0..1
  weights: ScoringWeights;
}

export function computeScores(sub: SubscoreResult, inp: ScoreInputs): Scores {
  const w = inp.weights;
  const noBacklinkOpportunity = weightedBlend(
    {
      inverseBacklinkDependency: 1 - sub.backlinkDependency,
      serpWeakness: sub.serpWeakness,
      topicalFit: sub.topicalAuthorityFit,
      businessValue: sub.businessValue,
      intentClarity: sub.intentClarity,
    },
    w.noBacklinkOpportunity,
  );

  const trafficPotential = sub.demand; // demand blend already folds TP/clicks when present

  const priority = weightedBlend(
    {
      noBacklinkOpportunity,
      demand: sub.demand,
      trafficPotential,
      businessValue: sub.businessValue,
      clusterImportance: inp.clusterImportance,
      internalLinkValue: inp.internalLinkValue,
      promotionValue: sub.promotionPotential,
      clickResilience: CLICK_RESILIENCE[inp.pageType],
    },
    w.priority,
  );

  const contentMarketing = weightedBlend(
    {
      promotionPotential: sub.promotionPotential,
      linkability: sub.promotionPotential,
      businessValue: sub.businessValue,
      audienceReach: sub.demand,
    },
    w.contentMarketing,
  );

  return {
    demand: round(sub.demand),
    trafficPotential: round(trafficPotential),
    serpWeakness: round(sub.serpWeakness),
    backlinkDependency: round(sub.backlinkDependency),
    noBacklinkOpportunity: round(noBacklinkOpportunity),
    topicalAuthorityFit: round(sub.topicalAuthorityFit),
    businessValue: round(sub.businessValue),
    contentMarketing: round(contentMarketing),
    promotionPotential: round(sub.promotionPotential),
    pillarSuitability: round(clamp01(PILLAR_SUIT[inp.pageType] * 0.7 + sub.businessValue * 0.15 + sub.demand * 0.15)),
    hubSuitability: round(clamp01(HUB_SUIT[inp.pageType] * 0.8 + inp.clusterImportance * 0.2)),
    spokeSuitability: round(clamp01(SPOKE_SUIT[inp.pageType] * 0.8 + noBacklinkOpportunity * 0.2)),
    internalLinkImportance: round(INTERNAL_LINK_IMPORTANCE[inp.pageType]),
    clusterCompleteness: round(inp.clusterCompleteness),
    freshnessRequirement: round(sub.freshnessRequirement),
    categoryFit: round(sub.categoryFit),
    publishingPhaseScore: 0, // assigned by the phase planner
    priority: round(priority),
  };
}

function round(x: number): number {
  return Math.round(clamp01(x) * 1000) / 1000;
}
