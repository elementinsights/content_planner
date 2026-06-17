/**
 * Search-volume-threshold planner. NO single global threshold. The recommended
 * minimum monthly volume is blended per row from page type, phase, intent — then
 * reduced by explicit strategic allowances (commercial intent, CPC, weak SERPs,
 * cluster/internal-link/asset roles). Every row gets a human-readable decision.
 */
import type { KeywordRecord, PageType, Scores, VolumeThresholdReport } from '../core/types.ts';
import {
  VOLUME_FLOOR_BY_PAGE_TYPE,
  VOLUME_FLOOR_BY_PHASE,
  VOLUME_FLOOR_BY_INTENT,
  LOW_VOLUME_ALLOWANCE_REASONS,
} from '../config/defaults.ts';

const ASSET_TYPES: PageType[] = ['tool', 'template', 'checklist', 'case-study', 'support', 'glossary'];

export interface ThresholdDecision {
  threshold: number;
  decision: string;
  allowanceReasons: string[];
}

export function recommendVolumeThreshold(
  rec: KeywordRecord,
  pageType: PageType,
  phase: number,
  scores: Scores,
): ThresholdDecision {
  const typeFloor = VOLUME_FLOOR_BY_PAGE_TYPE[pageType] ?? 30;
  const phaseFloor = VOLUME_FLOOR_BY_PHASE[phase] ?? 60;
  const intentFloor = VOLUME_FLOOR_BY_INTENT[rec.intent] ?? 30;
  let base = Math.round(typeFloor * 0.5 + phaseFloor * 0.3 + intentFloor * 0.2);

  const reasons: string[] = [];
  let threshold = base;

  if (ASSET_TYPES.includes(pageType)) {
    threshold = 0;
    reasons.push(pageType === 'glossary' ? 'necessary glossary/support role' : 'strong promotional or linkable-asset value');
  }
  if (rec.intent === 'commercial' || rec.intent === 'transactional') {
    threshold = Math.min(threshold, 10);
    reasons.push('high commercial intent');
  }
  if (scores.businessValue >= 0.7) {
    threshold = Math.min(threshold, 15);
    reasons.push('high business value');
  }
  if ((rec.metrics.cpc ?? 0) >= 3) {
    threshold = Math.min(threshold, 10);
    reasons.push('high CPC / monetizable');
  }
  if (scores.serpWeakness >= 0.6 && scores.backlinkDependency <= 0.4) {
    threshold = Math.round(threshold * 0.5);
    reasons.push('weak SERPs / low competition');
    reasons.push('low backlink dependency');
  }
  if (scores.internalLinkImportance >= 0.7) {
    threshold = Math.round(threshold * 0.6);
    reasons.push('internal-link importance');
  }
  if (scores.clusterCompleteness >= 0.6) {
    reasons.push('strong cluster-completeness value');
  }

  threshold = Math.max(0, threshold);
  const uniqueReasons = [...new Set(reasons)];

  const liveNote = rec.metrics.liveData
    ? `Actual volume ${rec.metrics.searchVolume ?? 'n/a'} ${rec.metrics.searchVolume !== null && rec.metrics.searchVolume < threshold ? 'is BELOW threshold but ' : 'meets threshold'}`
    : 'Volume is LIVE_DATA_REQUIRED (structural mode)';

  const decision = uniqueReasons.length
    ? `Base floor ${base} (type ${typeFloor}/phase ${phaseFloor}/intent ${intentFloor}) reduced to ${threshold} due to: ${uniqueReasons.join(', ')}. ${liveNote}.`
    : `Standard floor ${threshold} (type ${typeFloor}/phase ${phaseFloor}/intent ${intentFloor}); no special allowance. ${liveNote}.`;

  return { threshold, decision, allowanceReasons: uniqueReasons };
}

export function buildVolumeThresholdReport(): VolumeThresholdReport {
  return {
    note: 'Thresholds are dynamic per row (page type x phase x intent), then reduced by strategic allowances. No single global threshold is used.',
    byPageType: VOLUME_FLOOR_BY_PAGE_TYPE,
    byPhase: Object.fromEntries(Object.entries(VOLUME_FLOOR_BY_PHASE).map(([k, v]) => [`phase-${k}`, v])),
    lowVolumeAllowanceReasons: LOW_VOLUME_ALLOWANCE_REASONS,
  };
}
