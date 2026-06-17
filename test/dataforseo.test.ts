import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDfsRankedKeywords, mapDfsRelevantPages } from '../src/providers/seo/dataforseo.ts';

test('mapDfsRankedKeywords maps competitor keywords (no fabrication)', () => {
  const res = {
    tasks: [{ result: [{ items: [
      { keyword_data: { keyword: 'best crm', keyword_info: { search_volume: 5000, cpc: 8 }, keyword_properties: { keyword_difficulty: 30 } } },
      { keyword_data: { keyword: 'crm pricing', keyword_info: { search_volume: 800, cpc: 12 }, keyword_properties: { keyword_difficulty: 18 } } },
      { keyword_data: { keyword: '' } }, // dropped
    ] }] }],
  };
  const out = mapDfsRankedKeywords(res);
  assert.equal(out.length, 2);
  assert.equal(out[0].keyword, 'best crm');
  assert.equal(out[0].metrics.searchVolume, 5000);
  assert.equal(out[0].metrics.keywordDifficulty, 30);
  assert.equal(out[0].metrics.liveData, true);
  assert.equal(out[0].metrics.source, 'dataforseo');
});

test('mapDfsRelevantPages maps competitor top pages', () => {
  const res = {
    tasks: [{ result: [{ items: [
      { page_address: 'https://x.com/crm-guide', metrics: { organic: { etv: 1234, count: 50 } } },
      { page_address: '', metrics: { organic: { etv: 0 } } }, // dropped (no url)
    ] }] }],
  };
  const out = mapDfsRelevantPages(res);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://x.com/crm-guide');
  assert.equal(out[0].estimatedTraffic, 1234);
  assert.equal(out[0].referringDomains, null); // Labs doesn't provide -> null, not faked
});

test('mappers handle empty/missing responses gracefully', () => {
  assert.deepEqual(mapDfsRankedKeywords({}), []);
  assert.deepEqual(mapDfsRelevantPages({ tasks: [] }), []);
});
