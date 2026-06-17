/**
 * Google Sheets sync. Builds the workbook and upserts every required tab via the
 * SpreadsheetProvider (real or dry-run). Upserts the Content Map by immutable
 * Page ID, preserving protected human-edited columns, and records a sync history
 * in the local store (with retry/backoff handled inside the provider's HTTP).
 */
import type { SpreadsheetProvider } from '../providers/interfaces.ts';
import type { PlanResult } from '../core/types.ts';
import type { Store } from '../storage/store.ts';
import { buildWorkbook, REQUIRED_TABS } from './workbook.ts';
import { contentHash } from '../storage/store.ts';
import { log } from '../core/logger.ts';

export interface SheetsSyncSummary {
  spreadsheetId: string;
  dryRun: boolean;
  tabs: { tab: string; written: number; skipped: number; preserved: number; status: string }[];
  changedPages: number;
}

export async function syncToSheets(
  provider: SpreadsheetProvider,
  store: Store,
  plan: PlanResult,
  opts: { title?: string } = {},
): Promise<SheetsSyncSummary> {
  const tabs = buildWorkbook(plan);
  const title = opts.title ?? `SEO Plan — ${plan.intake.interpretedNiche} (${plan.generatedAtIso.slice(0, 10)})`;
  const nowIso = plan.generatedAtIso;

  log.step(`Syncing ${tabs.length} tabs to Google Sheets${provider.dryRun ? ' (DRY-RUN)' : ''}`);
  const spreadsheetId = await provider.ensureSpreadsheet(title);
  await provider.ensureTabs(spreadsheetId, REQUIRED_TABS.concat(tabs.map((t) => t.name)).filter((v, i, a) => a.indexOf(v) === i));

  const summary: SheetsSyncSummary = { spreadsheetId, dryRun: provider.dryRun, tabs: [], changedPages: 0 };

  // Track changed pages for the local store (change detection across runs).
  for (const page of plan.pages) {
    const changed = store.upsertPage({
      pageId: page.pageId,
      runId: plan.runId,
      contentHash: contentHash(page),
      json: JSON.stringify(page),
    });
    if (changed) summary.changedPages++;
  }

  for (const tab of tabs) {
    const idColumn = tab.idColumn ?? tab.headers[0];
    try {
      const res = await provider.upsertRows(spreadsheetId, tab.name, idColumn, tab.headers, tab.rows, tab.protectedColumns ?? []);
      const status = provider.dryRun ? 'dry-run' : 'ok';
      summary.tabs.push({ tab: tab.name, ...res, status });
      store.logSync({ runId: plan.runId, ts: nowIso, action: 'upsert', tab: tab.name, rows: tab.rows.length, status, message: `written=${res.written} skipped=${res.skipped} preserved=${res.preserved}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.tabs.push({ tab: tab.name, written: 0, skipped: 0, preserved: 0, status: 'error' });
      store.logSync({ runId: plan.runId, ts: nowIso, action: 'upsert', tab: tab.name, rows: tab.rows.length, status: 'error', message });
      log.error('sheet tab sync failed', { tab: tab.name, error: message });
    }
  }

  log.info('Sheets sync complete', { spreadsheetId, dryRun: provider.dryRun, changedPages: summary.changedPages });
  return summary;
}
