/**
 * Dry-run Sheets provider — DEFAULT when no Google credentials are present (or
 * when --dry-run is passed). Performs no network writes; logs intended
 * operations and returns counts. The full workbook is still emitted to disk as
 * CSV/JSON by the exporters, so humans can review every tab without Google auth.
 */
import type { SpreadsheetProvider, UpsertResult } from '../interfaces.ts';
import { log } from '../../core/logger.ts';

export class DryRunSheetsProvider implements SpreadsheetProvider {
  readonly name = 'google-sheets(dry-run)';
  readonly available = true;
  readonly dryRun = true;

  async ensureSpreadsheet(title: string): Promise<string> {
    log.info('[dry-run] would create/use spreadsheet', { title });
    return 'DRY-RUN-SPREADSHEET-ID';
  }
  async ensureTabs(_id: string, tabs: string[]): Promise<void> {
    log.info('[dry-run] would ensure tabs', { count: tabs.length });
  }
  async writeHeaders(_id: string, tab: string, headers: string[]): Promise<void> {
    log.debug('[dry-run] would write headers', { tab, cols: headers.length });
  }
  async upsertRows(
    _id: string,
    tab: string,
    _idColumn: string,
    _headers: string[],
    rows: Record<string, unknown>[],
    _protectedColumns: string[] = [],
  ): Promise<UpsertResult> {
    log.info('[dry-run] would upsert rows', { tab, rows: rows.length });
    return { written: rows.length, skipped: 0, preserved: 0 };
  }
  async readTab(): Promise<string[][]> {
    return [];
  }
}
