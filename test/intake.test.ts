import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deterministicInterpret, finalizeIntake } from '../src/intake/core.ts';
import type { AppConfig } from '../src/config/env.ts';

const cfg = { geoDefault: 'us', languageDefault: 'en' } as unknown as AppConfig;

test('deterministic intake produces niche, categories, and seeds', () => {
  const creative = deterministicInterpret({ idea: 'I want a site about AI tools for marketers', siteType: 'affiliate' }, cfg);
  assert.ok(creative.interpretedNiche.toLowerCase().includes('ai tools'));
  assert.ok(creative.categories.length >= 3 && creative.categories.length <= 5);
  assert.ok(creative.seedTopics.length >= 10);
  assert.ok(creative.seedKeywords.length >= 5);
});

test('detects YMYL for finance niches', () => {
  const creative = deterministicInterpret({ idea: 'personal finance for beginners' }, cfg);
  assert.ok(creative.ymylRiskFlags.length >= 1);
});

test('maps a known example domain to an implied niche', () => {
  const creative = deterministicInterpret({ idea: 'I want a site with topics like dollarsprout.com' }, cfg);
  assert.ok(creative.competitorDomains.includes('dollarsprout.com'));
  assert.ok(creative.interpretedNiche.toLowerCase().includes('finance'));
});

test('finalize adds API research plan, content types, and slugs', () => {
  const input = { idea: 'ai tools for marketers' };
  const intake = finalizeIntake(deterministicInterpret(input, cfg), input, cfg, 'deterministic');
  assert.ok(intake.apiResearchPlan.length > 0);
  assert.ok(intake.initialContentTypes.length > 5);
  assert.ok(intake.initialCategories.every((c) => c.slug.length > 0));
  assert.equal(intake.source, 'deterministic');
});
