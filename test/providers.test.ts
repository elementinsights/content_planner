import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullSeoProvider } from '../src/providers/seo/nullSeo.ts';
import { NullSerpProvider } from '../src/providers/serp/nullSerp.ts';
import { DryRunSheetsProvider } from '../src/providers/spreadsheet/dryRunSheets.ts';
import { MarketingProvider } from '../src/providers/marketing/marketingProvider.ts';
import type { PlannedPage } from '../src/core/types.ts';

test('null SEO provider returns null metrics (never fabricates)', async () => {
  const p = new NullSeoProvider();
  const m = await p.getKeywordMetrics(['a', 'b'], { geo: 'us', language: 'en' });
  assert.equal(m.get('a')?.searchVolume, null);
  assert.equal(m.get('a')?.keywordDifficulty, null);
  assert.equal(m.get('a')?.liveData, false);
  assert.equal(await (await p.getKeywordIdeas(['x'], { geo: 'us', language: 'en' })).length, 0);
});

test('null SERP provider returns empty, non-live SERP', async () => {
  const s = new NullSerpProvider();
  const r = await s.getSerp('x', { geo: 'us', language: 'en' });
  assert.equal(r.results.length, 0);
  assert.equal(r.liveData, false);
});

test('dry-run Sheets provider reports counts with no network', async () => {
  const s = new DryRunSheetsProvider();
  assert.equal(s.dryRun, true);
  const id = await s.ensureSpreadsheet('t');
  assert.ok(id);
  const r = await s.upsertRows(id, 'Tab', 'Page ID', ['Page ID'], [{ 'Page ID': 'P-1' }], []);
  assert.equal(r.written, 1);
});

test('marketing provider produces non-spammy, structured plans', () => {
  const page = { pageId: 'P-1', primaryKeyword: 'best crm', pageType: 'comparison', role: 'spoke', searchIntent: 'commercial', funnelStage: 'MOFU', cluster: 'crm', recommendedTitle: 'Best CRM', contentMarketingPriority: 0.7, freshnessRequirement: 'High' } as unknown as PlannedPage;
  const m = new MarketingProvider().planForPage(page);
  assert.ok(m.promotionChannels.length > 0);
  assert.ok(m.measurementPlan.length > 0);
  assert.ok(!JSON.stringify(m).toLowerCase().includes('buy links'));
});
