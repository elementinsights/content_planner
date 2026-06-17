/**
 * Local persistence behind a single interface. Primary backend is the built-in
 * `node:sqlite` (no native compile). If unavailable (older Node), falls back to
 * a JSON file so the system always runs.
 *
 * Purpose: store the last-synced snapshot of each page (keyed by immutable Page
 * ID) so the Sheets layer can (a) upsert by Page ID, (b) sync only changed rows,
 * and (c) preserve human-edited protected fields across runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { log } from '../core/logger.ts';

const requireCjs = createRequire(import.meta.url);

export interface StoredPage {
  pageId: string;
  runId: string;
  contentHash: string;
  json: string;
  updatedAt: string;
}

export interface SyncLogEntry {
  runId: string;
  ts: string;
  action: string;
  tab: string;
  rows: number;
  status: 'ok' | 'error' | 'dry-run';
  message: string;
}

export interface ProtectedFields {
  pageId: string;
  humanReviewStatus?: string;
  editorNotes?: string;
  approvalStatus?: string;
  manualPriorityOverride?: string;
  manualCategoryOverride?: string;
  manualPublishPhaseOverride?: string;
  manualMarketingNotes?: string;
}

export interface Store {
  upsertPage(page: { pageId: string; runId: string; contentHash: string; json: string }): boolean;
  getPage(pageId: string): StoredPage | null;
  allPages(): StoredPage[];
  saveProtected(p: ProtectedFields): void;
  getProtected(pageId: string): ProtectedFields | null;
  logSync(entry: SyncLogEntry): void;
  syncHistory(): SyncLogEntry[];
  /** SERP cache (keyed by `${geo}:${keyword}`) so re-runs don't re-pay for SERPs. */
  getSerpCache(key: string): string | null;
  saveSerpCache(key: string, json: string): void;
  close(): void;
  backend: 'sqlite' | 'json';
}

function nowIso(): string {
  // Date is allowed at app runtime (this is not a Workflow script).
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// node:sqlite backend
// ---------------------------------------------------------------------------
function trySqlite(dbPath: string): Store | null {
  let DatabaseSync: unknown;
  try {
    // Synchronous require via createRequire so the file parses even on runtimes
    // that lack node:sqlite (the require throws and we fall back to JSON).
    ({ DatabaseSync } = requireCjs('node:sqlite'));
  } catch {
    return null;
  }
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    const Ctor = DatabaseSync as new (p: string) => any;
    const db = new Ctor(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        page_id TEXT PRIMARY KEY, run_id TEXT, content_hash TEXT, json TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS protected_fields (
        page_id TEXT PRIMARY KEY, human_review_status TEXT, editor_notes TEXT,
        approval_status TEXT, manual_priority_override TEXT, manual_category_override TEXT,
        manual_publish_phase_override TEXT, manual_marketing_notes TEXT
      );
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, ts TEXT, action TEXT,
        tab TEXT, rows INTEGER, status TEXT, message TEXT
      );
      CREATE TABLE IF NOT EXISTS serp_cache (
        key TEXT PRIMARY KEY, json TEXT, ts TEXT
      );
    `);
    return {
      backend: 'sqlite',
      upsertPage(page) {
        const existing = db.prepare('SELECT content_hash FROM pages WHERE page_id=?').get(page.pageId) as
          | { content_hash: string }
          | undefined;
        const changed = !existing || existing.content_hash !== page.contentHash;
        db.prepare(
          `INSERT INTO pages(page_id,run_id,content_hash,json,updated_at)
           VALUES(?,?,?,?,?)
           ON CONFLICT(page_id) DO UPDATE SET run_id=excluded.run_id,
             content_hash=excluded.content_hash, json=excluded.json, updated_at=excluded.updated_at`,
        ).run(page.pageId, page.runId, page.contentHash, page.json, nowIso());
        return changed;
      },
      getPage(pageId) {
        const r = db.prepare('SELECT page_id,run_id,content_hash,json,updated_at FROM pages WHERE page_id=?').get(pageId) as any;
        return r ? { pageId: r.page_id, runId: r.run_id, contentHash: r.content_hash, json: r.json, updatedAt: r.updated_at } : null;
      },
      allPages() {
        const rows = db.prepare('SELECT page_id,run_id,content_hash,json,updated_at FROM pages').all() as any[];
        return rows.map((r) => ({ pageId: r.page_id, runId: r.run_id, contentHash: r.content_hash, json: r.json, updatedAt: r.updated_at }));
      },
      saveProtected(p) {
        db.prepare(
          `INSERT INTO protected_fields(page_id,human_review_status,editor_notes,approval_status,
             manual_priority_override,manual_category_override,manual_publish_phase_override,manual_marketing_notes)
           VALUES(?,?,?,?,?,?,?,?)
           ON CONFLICT(page_id) DO UPDATE SET human_review_status=excluded.human_review_status,
             editor_notes=excluded.editor_notes, approval_status=excluded.approval_status,
             manual_priority_override=excluded.manual_priority_override,
             manual_category_override=excluded.manual_category_override,
             manual_publish_phase_override=excluded.manual_publish_phase_override,
             manual_marketing_notes=excluded.manual_marketing_notes`,
        ).run(
          p.pageId, p.humanReviewStatus ?? null, p.editorNotes ?? null, p.approvalStatus ?? null,
          p.manualPriorityOverride ?? null, p.manualCategoryOverride ?? null,
          p.manualPublishPhaseOverride ?? null, p.manualMarketingNotes ?? null,
        );
      },
      getProtected(pageId) {
        const r = db.prepare('SELECT * FROM protected_fields WHERE page_id=?').get(pageId) as any;
        return r
          ? {
              pageId: r.page_id, humanReviewStatus: r.human_review_status, editorNotes: r.editor_notes,
              approvalStatus: r.approval_status, manualPriorityOverride: r.manual_priority_override,
              manualCategoryOverride: r.manual_category_override,
              manualPublishPhaseOverride: r.manual_publish_phase_override,
              manualMarketingNotes: r.manual_marketing_notes,
            }
          : null;
      },
      logSync(e) {
        db.prepare('INSERT INTO sync_log(run_id,ts,action,tab,rows,status,message) VALUES(?,?,?,?,?,?,?)').run(
          e.runId, e.ts, e.action, e.tab, e.rows, e.status, e.message,
        );
      },
      syncHistory() {
        const rows = db.prepare('SELECT run_id,ts,action,tab,rows,status,message FROM sync_log ORDER BY id DESC LIMIT 500').all() as any[];
        return rows.map((r) => ({ runId: r.run_id, ts: r.ts, action: r.action, tab: r.tab, rows: r.rows, status: r.status, message: r.message }));
      },
      getSerpCache(key) {
        const r = db.prepare('SELECT json FROM serp_cache WHERE key=?').get(key) as { json: string } | undefined;
        return r?.json ?? null;
      },
      saveSerpCache(key, json) {
        db.prepare('INSERT INTO serp_cache(key,json,ts) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, ts=excluded.ts').run(key, json, nowIso());
      },
      close() {
        db.close();
      },
    };
  } catch (err) {
    log.warn('node:sqlite init failed; falling back to JSON store', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// JSON fallback backend
// ---------------------------------------------------------------------------
function jsonStore(dbPath: string): Store {
  const path = dbPath.replace(/\.db$/, '') + '.json';
  mkdirSync(dirname(path), { recursive: true });
  interface Shape {
    pages: Record<string, StoredPage>;
    protected: Record<string, ProtectedFields>;
    syncLog: SyncLogEntry[];
    serpCache: Record<string, { json: string; ts: string }>;
  }
  const data: Shape = existsSync(path)
    ? { serpCache: {}, ...JSON.parse(readFileSync(path, 'utf8')) }
    : { pages: {}, protected: {}, syncLog: [], serpCache: {} };
  const flush = () => writeFileSync(path, JSON.stringify(data, null, 2));
  return {
    backend: 'json',
    upsertPage(page) {
      const existing = data.pages[page.pageId];
      const changed = !existing || existing.contentHash !== page.contentHash;
      data.pages[page.pageId] = { ...page, updatedAt: nowIso() };
      flush();
      return changed;
    },
    getPage: (id) => data.pages[id] ?? null,
    allPages: () => Object.values(data.pages),
    saveProtected(p) {
      data.protected[p.pageId] = { ...data.protected[p.pageId], ...p };
      flush();
    },
    getProtected: (id) => data.protected[id] ?? null,
    logSync(e) {
      data.syncLog.unshift(e);
      data.syncLog = data.syncLog.slice(0, 500);
      flush();
    },
    syncHistory: () => data.syncLog,
    getSerpCache: (key) => data.serpCache[key]?.json ?? null,
    saveSerpCache(key, json) {
      data.serpCache[key] = { json, ts: nowIso() };
      flush();
    },
    close() {},
  };
}

export function openStore(dbPath: string): Store {
  const sqlite = trySqlite(dbPath);
  if (sqlite) {
    log.debug('storage backend: node:sqlite', { dbPath });
    return sqlite;
  }
  const js = jsonStore(dbPath);
  log.debug('storage backend: json', { path: dbPath });
  return js;
}

/** Stable content hash for change detection (djb2). */
export function contentHash(obj: unknown): string {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}
