import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deterministicInterpret, finalizeIntake } from '../src/intake/core.ts';
import { expandSeeds } from '../src/intake/seedExpansion.ts';
import { clusterKeywords } from '../src/clustering/cluster.ts';
import { buildTaxonomy } from '../src/taxonomy/taxonomy.ts';
import { buildContentMap, selectTopPages } from '../src/planning/contentMap.ts';
import { planInternalLinks } from '../src/planning/internalLinks.ts';
import { DEFAULT_WEIGHTS } from '../src/config/weights.ts';
import type { AppConfig } from '../src/config/env.ts';

const cfg = { geoDefault: 'us', languageDefault: 'en' } as unknown as AppConfig;

test('structural pipeline yields a cannibalization-clean 200+ page plan with no fabricated metrics', () => {
  const input = { idea: 'I want a site about AI tools for marketers', siteType: 'affiliate' as const, minArticles: 200 };
  const intake = finalizeIntake(deterministicInterpret(input, cfg), input, cfg, 'deterministic');
  const records = expandSeeds(intake);
  assert.ok(records.length > 400, `expansion produced ${records.length}`);

  const clustering = clusterKeywords(records, intake);
  const taxonomy = buildTaxonomy(intake, clustering.clusters);
  assert.ok(taxonomy.categories.length >= 3 && taxonomy.categories.length <= 5);

  const cm = buildContentMap({ intake, records, clustering, taxonomy, weights: DEFAULT_WEIGHTS, commercialBias: 0.45 });
  assert.equal(cm.cannibalizationReport.clean, true);

  const pages = selectTopPages(cm.pages, 200);
  assert.ok(pages.length >= 200, `only ${pages.length} pages`);

  // Every page is fully assigned (identity + taxonomy + astro).
  for (const p of pages) {
    assert.ok(p.pageId.startsWith('P-'));
    assert.ok(p.primaryKeyword.length > 0);
    assert.ok(p.topCategory && p.cluster && p.pageType && p.role);
    assert.ok(p.urlPath.startsWith('/'));
    assert.ok(p.astroCollection.startsWith('src/content/'));
    assert.ok(p.markdownFilename.endsWith('.md') || p.markdownFilename.endsWith('.mdx'));
    assert.ok(p.recommendedMinVolumeThreshold >= 0 && p.volumeThresholdDecision.length > 0);
    assert.ok(p.recommendedKdRange[0] <= p.recommendedKdRange[1]);
  }

  // Structural mode: NO fabricated metrics; everything flagged.
  assert.ok(pages.every((p) => p.searchVolume === null && p.keywordDifficulty === null));
  assert.ok(pages.every((p) => p.dataFlags.includes('LIVE_DATA_REQUIRED')));

  // Every category has a hub; pillars capped 1-3.
  const hubCats = new Set(pages.filter((p) => p.pageType === 'category-hub').map((p) => p.topCategory));
  assert.equal(hubCats.size, taxonomy.categories.length);
  const pillars = pages.filter((p) => p.role === 'pillar').length;
  assert.ok(pillars >= 1 && pillars <= 3, `pillars=${pillars}`);

  // Internal links connect the graph.
  planInternalLinks(pages);
  const totalLinks = pages.reduce((a, p) => a + p.internalLinksOut.length, 0);
  assert.ok(totalLinks > pages.length, `links=${totalLinks}`);

  // No duplicate URLs.
  const urls = pages.map((p) => p.urlPath);
  assert.equal(new Set(urls).size, urls.length);
});
