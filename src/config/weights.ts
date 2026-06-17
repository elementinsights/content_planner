/**
 * Configurable scoring weights. Every composite score is a weighted blend of
 * normalized 0..1 subscores. Override any of these to retune the system without
 * touching scoring logic. Weights within each blend need not sum to 1 — the
 * scorer normalizes by the sum of the weights actually used.
 */

export interface ScoringWeights {
  demand: { localVolume: number; globalVolume: number; trafficPotential: number; trend: number; clicks: number; cpc: number };
  serpWeakness: { lowAuthorityPresence: number; lowReferringDomains: number; staleResults: number; ugcPresence: number; mismatchedIntent: number; weakPageTypeFit: number };
  backlinkDependency: { kd: number; medianReferringDomains: number; strongDomainPrevalence: number; linkIntensity: number };
  noBacklinkOpportunity: { inverseBacklinkDependency: number; serpWeakness: number; topicalFit: number; businessValue: number; intentClarity: number };
  priority: { noBacklinkOpportunity: number; demand: number; trafficPotential: number; businessValue: number; clusterImportance: number; internalLinkValue: number; promotionValue: number };
  contentMarketing: { promotionPotential: number; linkability: number; businessValue: number; audienceReach: number };
  pageCount: { universe: number; clusterDepth: number; serpOpportunity: number; businessValue: number; capacity: number };
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  demand: { localVolume: 0.35, globalVolume: 0.15, trafficPotential: 0.3, trend: 0.08, clicks: 0.07, cpc: 0.05 },
  serpWeakness: { lowAuthorityPresence: 0.28, lowReferringDomains: 0.22, staleResults: 0.12, ugcPresence: 0.18, mismatchedIntent: 0.1, weakPageTypeFit: 0.1 },
  backlinkDependency: { kd: 0.4, medianReferringDomains: 0.3, strongDomainPrevalence: 0.2, linkIntensity: 0.1 },
  noBacklinkOpportunity: { inverseBacklinkDependency: 0.34, serpWeakness: 0.26, topicalFit: 0.15, businessValue: 0.15, intentClarity: 0.1 },
  priority: { noBacklinkOpportunity: 0.26, demand: 0.18, trafficPotential: 0.16, businessValue: 0.16, clusterImportance: 0.1, internalLinkValue: 0.12, promotionValue: 0.06 },
  contentMarketing: { promotionPotential: 0.4, linkability: 0.3, businessValue: 0.2, audienceReach: 0.1 },
  pageCount: { universe: 0.3, clusterDepth: 0.25, serpOpportunity: 0.15, businessValue: 0.15, capacity: 0.15 },
};

/** Weighted average that normalizes by the sum of weights for the keys present. */
export function weightedBlend(
  parts: Record<string, number>,
  weights: Record<string, number>,
): number {
  let num = 0;
  let den = 0;
  for (const k of Object.keys(weights)) {
    const v = parts[k];
    if (v === undefined || Number.isNaN(v)) continue;
    num += clamp01(v) * weights[k];
    den += weights[k];
  }
  return den === 0 ? 0 : clamp01(num / den);
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
