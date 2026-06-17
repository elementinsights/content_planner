import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { openStore, contentHash } from '../src/storage/store.ts';

test('store upserts by Page ID, detects changes, preserves protected fields, logs sync', () => {
  const path = `data/test-${process.pid}.db`;
  const s = openStore(path);
  try {
    const changed1 = s.upsertPage({ pageId: 'P-1', runId: 'r1', contentHash: contentHash({ a: 1 }), json: '{}' });
    assert.equal(changed1, true);

    const changed2 = s.upsertPage({ pageId: 'P-1', runId: 'r1', contentHash: contentHash({ a: 1 }), json: '{}' });
    assert.equal(changed2, false); // identical content -> unchanged

    const changed3 = s.upsertPage({ pageId: 'P-1', runId: 'r2', contentHash: contentHash({ a: 2 }), json: '{}' });
    assert.equal(changed3, true); // content changed

    s.saveProtected({ pageId: 'P-1', humanReviewStatus: 'approved', editorNotes: 'looks good' });
    const prot = s.getProtected('P-1');
    assert.equal(prot?.humanReviewStatus, 'approved');
    assert.equal(prot?.editorNotes, 'looks good');

    s.logSync({ runId: 'r1', ts: '2026-01-01T00:00:00Z', action: 'upsert', tab: 'Content Map', rows: 1, status: 'ok', message: 'ok' });
    assert.ok(s.syncHistory().length >= 1);
    assert.ok(['sqlite', 'json'].includes(s.backend));

    // SERP cache (so re-runs don't re-pay for SERP calls)
    assert.equal(s.getSerpCache('us:missing'), null);
    s.saveSerpCache('us:foo', '{"results":[]}');
    assert.equal(s.getSerpCache('us:foo'), '{"results":[]}');
  } finally {
    s.close();
    for (const ext of ['', '.json', '-journal', '-wal', '-shm']) {
      try { rmSync(path + ext); } catch { /* ignore */ }
    }
  }
});
