import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendArticleCount } from '../src/planning/pageCount.ts';
import { emptyMetrics, type KeywordRecord, type Cluster } from '../src/core/types.ts';

function recs(n: number): KeywordRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    keyword: `k${i}`,
    normalized: `k${i}`,
    intent: 'informational' as const,
    funnel: 'MOFU' as const,
    modifier: 'spoke',
    sourceTopic: 't',
    category: 'how-to',
    metrics: emptyMetrics(),
  }));
}
const clusters: Cluster[] = [
  { id: 'c1', name: 'C1', category: 'How-To', subcategory: '', intent: 'informational', pillarKeyword: null, hubKeyword: 'k0', memberKeywords: ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'], subclusters: {}, completeness: 0.5 },
];

test('enforces the 200 floor', () => {
  const r = recommendArticleCount(recs(50), clusters, { idea: 'x' }, { commercialBias: 0.3, liveDataMode: false, cleanCount: 50 });
  assert.equal(r.minArticles, 200);
});

test('snaps to a tier and produces both justifications', () => {
  const r = recommendArticleCount(recs(800), clusters, { idea: 'x' }, { commercialBias: 0.5, liveDataMode: false, cleanCount: 520 });
  assert.ok([200, 300, 500, 700, 1000].includes(r.tier));
  assert.ok(r.recommendedTotal >= 200 && r.recommendedTotal <= 520);
  assert.ok(r.whyNotMore.length > 30);
  assert.ok(r.whyNotFewer.length > 30);
  assert.ok(Object.keys(r.pageTypeBreakdown).length > 5);
});

test('recommendation never exceeds the clean distinct supply', () => {
  const r = recommendArticleCount(recs(2000), clusters, { idea: 'x' }, { commercialBias: 0.6, liveDataMode: false, cleanCount: 310 });
  assert.ok(r.recommendedTotal <= 310);
});

test('respects an explicit maxArticles cap', () => {
  const r = recommendArticleCount(recs(2000), clusters, { idea: 'x', maxArticles: 250 }, { commercialBias: 0.6, liveDataMode: false, cleanCount: 800 });
  assert.ok(r.recommendedTotal <= 250);
});
