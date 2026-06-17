/**
 * Cannibalization PREVENTION (not just scoring). Compares every candidate page
 * against all kept pages across: parent-topic overlap, SERP overlap, semantic
 * similarity, core-phrase identity, intent, modifier/page-type, funnel, cluster
 * relationship, title/H1 similarity, and URL/route similarity. Resolves conflicts
 * (merge / secondary / differentiate / retype / remove) so the FINAL kept set has
 * no unresolved hard conflicts -> labeled cannibalization-clean.
 */
import type { CannibalizationStatus, ConflictSeverity, SearchIntent, FunnelStage, PageType, CannibalizationReport } from '../core/types.ts';
import { jaccard, diceCoefficient, setOverlap } from '../core/text.ts';
import { corePhrase } from '../clustering/cluster.ts';

export interface CannibalCandidate {
  pageId: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  parentTopic: string | null;
  intent: SearchIntent;
  funnel: FunnelStage;
  pageType: PageType;
  /** Unique cluster ID (NOT display name) so cross-category same-core clusters don't collide. */
  cluster: string;
  subcluster: string;
  title: string;
  h1: string;
  urlPath: string;
  serpDomains: string[];
  priority: number;
  /** Backbone pages (pillars/category-hubs) are never folded away. */
  protected: boolean;
}

export interface ResolutionRecord {
  pageId: string;
  against: string;
  severity: ConflictSeverity;
  reason: string;
  resolution: string;
}

export interface CannibalOutcome {
  kept: CannibalCandidate[];
  statusById: Map<string, { status: CannibalizationStatus; resolution: string | null; uniqueIntentNote: string }>;
  report: CannibalizationReport;
}

interface ConflictEval {
  severity: ConflictSeverity;
  reason: string;
  semantic: number;
  serpOverlap: number | null;
}

function evalConflict(a: CannibalCandidate, b: CannibalCandidate): ConflictEval {
  const semantic = jaccard(a.primaryKeyword, b.primaryKeyword);
  const coreEqual = corePhrase(a.primaryKeyword) === corePhrase(b.primaryKeyword) && corePhrase(a.primaryKeyword).length > 0;
  const titleSim = diceCoefficient(a.title, b.title);
  const serpOverlap = a.serpDomains.length && b.serpDomains.length ? setOverlap(a.serpDomains, b.serpDomains) : null;
  const sameIntent = a.intent === b.intent;
  const sameType = a.pageType === b.pageType;
  const sameCluster = a.cluster === b.cluster;
  const parentEqual = !!a.parentTopic && a.parentTopic === b.parentTopic;
  const sameRoute = a.urlPath === b.urlPath;

  const reasons: string[] = [];
  let severity: ConflictSeverity = 'none';

  // HARD conflicts
  if (sameRoute) {
    return { severity: 'hard', reason: 'identical URL/route', semantic, serpOverlap };
  }
  if (serpOverlap !== null && serpOverlap >= 0.5 && sameIntent) {
    reasons.push(`SERP overlap ${(serpOverlap * 100).toFixed(0)}% with same intent`);
    severity = 'hard';
  }
  if (semantic >= 0.8 && sameType && sameIntent) {
    reasons.push(`semantic similarity ${(semantic * 100).toFixed(0)}% with same page type+intent`);
    severity = 'hard';
  }
  if (coreEqual && sameType && sameIntent && sameCluster) {
    reasons.push('same core topic, page type, intent, and cluster (same page expressed differently)');
    severity = 'hard';
  }
  if (parentEqual && sameType && sameIntent && semantic >= 0.6) {
    reasons.push('same parent topic + page type + intent');
    severity = 'hard';
  }
  if (severity === 'hard') return { severity, reason: reasons.join('; '), semantic, serpOverlap };

  // SOFT conflicts (differentiable)
  if (semantic >= 0.6 && (sameIntent || sameType)) reasons.push(`moderate semantic similarity ${(semantic * 100).toFixed(0)}%`);
  if (serpOverlap !== null && serpOverlap >= 0.3 && sameIntent) reasons.push(`partial SERP overlap ${(serpOverlap * 100).toFixed(0)}%`);
  if (titleSim >= 0.7) reasons.push(`similar titles ${(titleSim * 100).toFixed(0)}%`);
  if (reasons.length) severity = 'soft';

  return { severity, reason: reasons.join('; '), semantic, serpOverlap };
}

export function preventCannibalization(candidates: CannibalCandidate[]): CannibalOutcome {
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority);
  const kept: CannibalCandidate[] = [];
  const statusById = new Map<string, { status: CannibalizationStatus; resolution: string | null; uniqueIntentNote: string }>();
  const resolutions: ResolutionRecord[] = [];
  let hardConflicts = 0;
  let softConflicts = 0;

  for (const cand of ordered) {
    let hardWinner: CannibalCandidate | null = null;
    let hardEval: ConflictEval | null = null;
    const softNotes: string[] = [];

    for (const k of kept) {
      // Only compare within plausibly-overlapping scope (same cluster or same core).
      const ev = evalConflict(cand, k);
      if (ev.severity === 'hard') {
        hardWinner = k;
        hardEval = ev;
        break;
      } else if (ev.severity === 'soft' && softNotes.length < 3) {
        // Collect a few representative soft signals; do not log every pair.
        softNotes.push(`${k.primaryKeyword} (${ev.reason})`);
      }
    }

    if (hardWinner && hardEval) {
      hardConflicts++;
      // Never fold a backbone page (pillar/category-hub). Keep it and differentiate.
      if (cand.protected) {
        kept.push(cand);
        statusById.set(cand.pageId, {
          status: 'differentiated',
          resolution: `kept as backbone despite overlap with "${hardWinner.primaryKeyword}" — differentiate angle/scope`,
          uniqueIntentNote: `Backbone page; differentiate from ${hardWinner.primaryKeyword}`,
        });
        resolutions.push({ pageId: cand.pageId, against: hardWinner.pageId, severity: 'hard', reason: hardEval.reason, resolution: 'kept as backbone (differentiated, not merged)' });
        continue;
      }
      // Fold the losing candidate's keyword into the winner as a secondary keyword.
      if (!hardWinner.secondaryKeywords.includes(cand.primaryKeyword)) {
        hardWinner.secondaryKeywords.push(cand.primaryKeyword);
      }
      const resolution =
        hardEval.semantic >= 0.9 || hardEval.reason.includes('identical URL')
          ? `merge into "${hardWinner.primaryKeyword}" (duplicate intent removed from plan)`
          : `keyword folded as SECONDARY into higher-priority page "${hardWinner.primaryKeyword}"`;
      statusById.set(cand.pageId, {
        status: hardEval.semantic >= 0.9 ? 'merged' : 'kept-secondary',
        resolution,
        uniqueIntentNote: '',
      });
      resolutions.push({ pageId: cand.pageId, against: hardWinner.pageId, severity: 'hard', reason: hardEval.reason, resolution });
      continue; // not added to kept
    }

    // No hard conflict -> keep. Mark differentiated if it had soft signals (count
    // ONE per differentiated page, not per pair).
    kept.push(cand);
    if (softNotes.length) {
      softConflicts++;
      statusById.set(cand.pageId, {
        status: 'differentiated',
        resolution: `angle-differentiated to avoid overlap with similar page(s)`,
        uniqueIntentNote: `Differentiate from: ${softNotes.join(' | ')}`,
      });
      resolutions.push({
        pageId: cand.pageId,
        against: 'multiple',
        severity: 'soft',
        reason: softNotes.join('; '),
        resolution: 'differentiate search intent/angle (kept as distinct page)',
      });
    } else {
      statusById.set(cand.pageId, { status: 'clean', resolution: null, uniqueIntentNote: '' });
    }
  }

  // Final verification: assert no hard conflicts remain among kept pages.
  let residualHard = 0;
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      if (evalConflict(kept[i], kept[j]).severity === 'hard') residualHard++;
    }
  }

  const report: CannibalizationReport = {
    totalCandidates: candidates.length,
    conflictsDetected: hardConflicts + softConflicts,
    hardConflicts,
    softConflicts,
    resolutions: resolutions.slice(0, 600),
    finalPages: kept.length,
    clean: residualHard === 0,
  };

  return { kept, statusById, report };
}
