import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSubscores } from '../src/scoring/subscores.ts';
import { computeScores } from '../src/scoring/scores.ts';
import { DEFAULT_WEIGHTS } from '../src/config/weights.ts';
import { emptyMetrics, type KeywordRecord } from '../src/core/types.ts';

function rec(partial: Partial<KeywordRecord> = {}): KeywordRecord {
  return {
    keyword: 'email marketing tips',
    normalized: 'email marketing tips',
    intent: 'informational',
    funnel: 'MOFU',
    modifier: 'spoke',
    sourceTopic: 't',
    category: 'how-to',
    metrics: emptyMetrics(),
    ...partial,
  };
}
const ctx = { subjectTokens: new Set(['email', 'marketing']), commercialBias: 0.3, weights: DEFAULT_WEIGHTS };

test('null metrics fall back to structural priors (no fabrication)', () => {
  const s = computeSubscores(rec(), 'spoke', ctx);
  assert.ok(s.priorsUsed.includes('demand'));
  assert.ok(s.priorsUsed.includes('serpWeakness'));
  assert.ok(s.priorsUsed.includes('backlinkDependency'));
  for (const k of ['demand', 'serpWeakness', 'backlinkDependency', 'businessValue', 'topicalAuthorityFit'] as const) {
    const v = (s as unknown as Record<string, number>)[k];
    assert.ok(v >= 0 && v <= 1, `${k}=${v}`);
  }
});

test('live metrics avoid demand/backlink priors', () => {
  const r = rec({ metrics: { ...emptyMetrics(), searchVolume: 1000, keywordDifficulty: 5, liveData: true, source: 'ahrefs' } });
  const s = computeSubscores(r, 'spoke', ctx);
  assert.ok(!s.priorsUsed.includes('demand'));
  assert.ok(!s.priorsUsed.includes('backlinkDependency'));
});

test('composite scores are bounded and noBacklinkOpportunity > 0', () => {
  const sub = computeSubscores(rec(), 'spoke', ctx);
  const sc = computeScores(sub, { pageType: 'spoke', role: 'spoke', clusterImportance: 0.5, clusterCompleteness: 0.5, internalLinkValue: 0.5, weights: DEFAULT_WEIGHTS });
  for (const [k, v] of Object.entries(sc)) assert.ok(v >= 0 && v <= 1, `${k}=${v}`);
  assert.ok(sc.noBacklinkOpportunity > 0);
  assert.ok(sc.priority > 0);
});

test('commercial pages score higher business value than glossary', () => {
  const com = computeSubscores(rec({ intent: 'commercial' }), 'commercial', ctx);
  const glo = computeSubscores(rec(), 'glossary', ctx);
  assert.ok(com.businessValue > glo.businessValue);
});
