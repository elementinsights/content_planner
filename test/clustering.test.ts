import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterKeywords, serpOverlapGroups } from '../src/clustering/cluster.ts';
import { emptyMetrics, type KeywordRecord, type IntakeResult, type SerpData } from '../src/core/types.ts';

function recWithSerp(kw: string, urls: string[], category = 'how-to', volume = 100): KeywordRecord {
  const serp: SerpData = {
    keyword: kw,
    results: urls.map((u, i) => ({ position: i + 1, url: u, domain: u, title: null, referringDomains: null, domainRating: null, pageType: null, isUgc: false })),
    features: [],
    medianReferringDomains: null,
    weakResultsRatio: null,
    source: 'dataforseo',
    liveData: true,
  };
  return { keyword: kw, normalized: kw, intent: 'informational', funnel: 'MOFU', modifier: 'spoke', sourceTopic: 't', category, metrics: { ...emptyMetrics(), searchVolume: volume, liveData: true }, serp };
}

const intake = {
  initialCategories: [
    { name: 'How-To', slug: 'how-to', rationale: '', intentMix: { informational: 1, commercial: 0 }, subcategories: ['Guides'], seedModifiers: [] },
  ],
} as unknown as IntakeResult;

function r(kw: string): KeywordRecord {
  return { keyword: kw, normalized: kw, intent: 'informational', funnel: 'MOFU', modifier: 'spoke', sourceTopic: 't', category: 'how-to', metrics: emptyMetrics() };
}

test('groups keywords sharing a core phrase into the same cluster', () => {
  const res = clusterKeywords(
    [r('how to email marketing'), r('email marketing guide'), r('email marketing tips'), r('seo audit checklist'), r('seo audit guide')],
    intake,
  );
  assert.ok(res.clusters.length >= 1);
  const c1 = res.clusterIdByKeyword.get('how to email marketing');
  const c2 = res.clusterIdByKeyword.get('email marketing tips');
  assert.equal(c1, c2);
  const c3 = res.clusterIdByKeyword.get('seo audit checklist');
  assert.notEqual(c1, c3);
});

test('assigns a hub keyword and an importance signal', () => {
  const res = clusterKeywords([r('email marketing'), r('email marketing guide'), r('email marketing tips')], intake);
  const cl = res.clusters[0];
  assert.ok(cl.hubKeyword);
  assert.ok(res.importanceByKeyword.get('email marketing') !== undefined);
});

test('serpOverlapGroups groups keywords sharing >=3 top URLs', () => {
  const shared = ['u1', 'u2', 'u3'];
  const A = recWithSerp('kw a', [...shared, 'd1', 'e1']);
  const B = recWithSerp('kw b', [...shared, 'd2', 'e2']);
  const C = recWithSerp('kw c', ['x', 'y', 'z', 'w', 'v']); // no overlap
  const g = serpOverlapGroups([A, B, C]);
  assert.ok(g.has('kw a') && g.has('kw b'));
  assert.equal(g.get('kw a'), g.get('kw b'));
  assert.ok(!g.has('kw c'));
});

test('serpOverlapGroups never crosses categories (keeps taxonomy coherent)', () => {
  const shared = ['u1', 'u2', 'u3', 'u4'];
  const A = recWithSerp('kw a', shared, 'how-to');
  const B = recWithSerp('kw b', shared, 'tools'); // identical SERP but different category
  const g = serpOverlapGroups([A, B]);
  assert.ok(!g.has('kw a') && !g.has('kw b')); // no cross-category edge -> singletons
});

test('hub keyword is the highest-volume member (Parent-Topic style)', () => {
  const v = (kw: string, vol: number): KeywordRecord => ({ keyword: kw, normalized: kw, intent: 'informational', funnel: 'MOFU', modifier: 'spoke', sourceTopic: 't', category: 'how-to', metrics: { ...emptyMetrics(), searchVolume: vol, liveData: true } });
  const res = clusterKeywords([v('email marketing guide', 200), v('email marketing tips', 900), v('how to email marketing', 100)], intake);
  const cl = res.clusters.find((c) => c.memberKeywords.length >= 2)!;
  assert.equal(cl.hubKeyword, 'email marketing tips');
});
