/**
 * Keyword-difficulty-by-phase planner. KD ranges per publishing phase are read
 * from config (not hardcoded). Per page, the recommended KD range can widen to
 * the phase's selective exception ONLY when SERP weakness + no-backlink
 * opportunity are high (strategic value), exactly per the brand-new-site policy.
 */
import type { KdByPhaseReport, Scores } from '../core/types.ts';
import { KD_BY_PHASE, type PhaseKdDef } from '../config/defaults.ts';

export function phaseDef(phase: number): PhaseKdDef {
  return KD_BY_PHASE.find((p) => p.phase === phase) ?? KD_BY_PHASE[KD_BY_PHASE.length - 1];
}

/** Per-page recommended KD range, widening to the exception band when justified. */
export function recommendedKdRange(phase: number, scores: Scores): [number, number] {
  const def = phaseDef(phase);
  const strategic = scores.serpWeakness >= 0.6 && scores.noBacklinkOpportunity >= 0.6;
  const hi = strategic ? def.selectiveExceptionUpTo : def.kdRange[1];
  return [def.kdRange[0], hi];
}

export function buildKdByPhaseReport(pagesPerPhase: Record<number, number>): KdByPhaseReport {
  return {
    phases: KD_BY_PHASE.map((p) => ({
      phase: p.phase,
      label: p.label,
      kdRange: p.kdRange,
      selectiveExceptionUpTo: p.selectiveExceptionUpTo,
      rationale: p.rationale,
      pageCount: pagesPerPhase[p.phase] ?? 0,
    })),
  };
}
