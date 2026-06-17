import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, jaccard, diceCoefficient, setOverlap } from '../src/core/text.ts';
import { corePhrase } from '../src/clustering/cluster.ts';

test('slugify normalizes and strips', () => {
  assert.equal(slugify('Best AI Tools for Marketers!'), 'best-ai-tools-for-marketers');
  assert.equal(slugify('  héllo  World '), 'hello-world');
  assert.equal(slugify("Email Marketing 101: A Guide"), 'email-marketing-101-a-guide');
});

test('jaccard: identical vs disjoint', () => {
  assert.equal(jaccard('email marketing', 'email marketing'), 1);
  assert.ok(jaccard('email marketing', 'seo audit') < 0.2);
});

test('dice: similar titles score high', () => {
  assert.ok(diceCoefficient('best crm software', 'best crm software tool') > 0.7);
  assert.ok(diceCoefficient('apples', 'oranges') < 0.3);
});

test('corePhrase strips modifier tokens but keeps topic nouns', () => {
  assert.equal(corePhrase('how to email marketing'), 'email marketing');
  // "tools" is part of the topic, not a modifier -> kept (distinct from bare "email marketing")
  assert.equal(corePhrase('best email marketing tools'), 'email marketing tools');
  assert.equal(corePhrase('email marketing definition'), 'email marketing');
});

test('setOverlap is symmetric fraction', () => {
  assert.equal(setOverlap(['a', 'b'], ['b', 'c']), 0.5);
  assert.equal(setOverlap(['a'], ['x', 'y']), 0);
});
