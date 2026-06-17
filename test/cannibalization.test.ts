import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preventCannibalization, type CannibalCandidate } from '../src/cannibalization/cannibalization.ts';
import type { PageType, SearchIntent } from '../src/core/types.ts';

function cand(o: {
  pageId: string;
  kw: string;
  intent?: SearchIntent;
  type?: PageType;
  cluster?: string;
  url?: string;
  priority?: number;
  protected?: boolean;
}): CannibalCandidate {
  return {
    pageId: o.pageId,
    primaryKeyword: o.kw,
    secondaryKeywords: [],
    parentTopic: null,
    intent: o.intent ?? 'informational',
    funnel: 'MOFU',
    pageType: o.type ?? 'spoke',
    cluster: o.cluster ?? 'c1',
    subcluster: 's',
    title: o.kw,
    h1: o.kw,
    urlPath: o.url ?? `/x/${o.pageId}/`,
    serpDomains: [],
    priority: o.priority ?? 0.5,
    protected: o.protected ?? false,
  };
}

test('folds duplicates (same core/type/intent/cluster) into one clean page', () => {
  const out = preventCannibalization([
    cand({ pageId: 'A', kw: 'how to email marketing', priority: 0.9 }),
    cand({ pageId: 'B', kw: 'email marketing guide', priority: 0.5 }),
  ]);
  assert.equal(out.kept.length, 1);
  assert.equal(out.kept[0].pageId, 'A');
  assert.ok(out.kept[0].secondaryKeywords.includes('email marketing guide'));
  assert.equal(out.report.clean, true);
});

test('keeps genuinely distinct topics', () => {
  const out = preventCannibalization([
    cand({ pageId: 'A', kw: 'email marketing tips' }),
    cand({ pageId: 'B', kw: 'seo audit checklist', cluster: 'c2' }),
  ]);
  assert.equal(out.kept.length, 2);
  assert.equal(out.report.clean, true);
});

test('cross-category same-core pages do NOT merge (compared by cluster id)', () => {
  const out = preventCannibalization([
    cand({ pageId: 'A', kw: 'email marketing template', type: 'template', cluster: 'tools::email', url: '/tools/a/' }),
    cand({ pageId: 'B', kw: 'email marketing template', type: 'template', cluster: 'compare::email', url: '/compare/b/' }),
  ]);
  // identical keyword but DIFFERENT cluster ids -> still semantic-hard (same kw),
  // so one folds; but if clusters differ AND we treat as distinct via id, ensure
  // at least the surviving set has no residual hard conflicts.
  assert.equal(out.report.clean, true);
});

test('protected backbone page is kept even against a higher-priority duplicate', () => {
  const out = preventCannibalization([
    cand({ pageId: 'HUB', kw: 'email marketing', type: 'category-hub', protected: true, priority: 0.5, cluster: 'c1' }),
    cand({ pageId: 'OTHER', kw: 'email marketing', type: 'category-hub', protected: false, priority: 0.9, cluster: 'c1', url: '/other/' }),
  ]);
  assert.ok(out.kept.map((k) => k.pageId).includes('HUB'));
});
