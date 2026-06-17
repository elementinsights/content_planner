import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_TABS, CONTENT_MAP_HEADERS, PROTECTED_COLUMNS } from '../src/exporters/workbook.ts';
import { tabToCsv } from '../src/exporters/csv.ts';

test('all required Sheets tabs are declared', () => {
  for (const t of [
    'Dashboard', 'Content Map', 'Page Candidates', 'Keyword Metrics', 'Search Volume Thresholds', 'Clusters',
    'Categories', 'Internal Links', 'External Sources', 'Briefs', 'Content Marketing Plan', 'Publishing Roadmap',
    'Cannibalization Clean Report', 'Article Count Recommendation', 'Keyword Difficulty By Phase',
    'Post-Launch Performance', 'Settings', 'Sync Log', 'Error Log',
  ]) {
    assert.ok(REQUIRED_TABS.includes(t), `missing tab: ${t}`);
  }
});

test('Content Map includes protected human-edited columns', () => {
  for (const c of PROTECTED_COLUMNS) assert.ok(CONTENT_MAP_HEADERS.includes(c), `missing protected col: ${c}`);
  // and key planning columns
  for (const c of ['Page ID', 'Primary Keyword', 'Cannibalization Status', 'Suggested URL Path'.replace('Suggested ', ''), 'Astro Route', 'Rec Min Volume Threshold', 'Volume Threshold Decision']) {
    assert.ok(CONTENT_MAP_HEADERS.includes(c), `missing col: ${c}`);
  }
});

test('CSV escapes commas, quotes, and newlines', () => {
  const csv = tabToCsv({ name: 'T', headers: ['a', 'b'], rows: [{ a: 'x,y', b: 'he said "hi"' }] });
  assert.match(csv, /"x,y"/);
  assert.match(csv, /"he said ""hi"""/);
});
