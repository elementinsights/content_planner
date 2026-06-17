/**
 * Google Sheets provider (real). Service-account auth via google-auth-library,
 * Sheets REST v4 via fetch. Creates spreadsheets/tabs, writes headers, and
 * upserts rows by an immutable id column while PRESERVING protected (human-edited)
 * columns. Writes the full owned-tab matrix each sync for correctness, and
 * reports changed-vs-unchanged counts for the sync log.
 */
import type { SpreadsheetProvider, UpsertResult } from '../interfaces.ts';
import type { CostController } from '../../core/cost.ts';
import { httpJson } from '../http.ts';
import { log } from '../../core/logger.ts';
import { getGoogleAccessToken, type ServiceAccountCreds } from '../google/auth.ts';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

function a1(tab: string, cell = 'A1'): string {
  return `'${tab.replace(/'/g, "''")}'!${cell}`;
}

export class GoogleSheetsProvider implements SpreadsheetProvider {
  readonly name = 'google-sheets';
  readonly available = true;
  readonly dryRun = false;
  constructor(
    private creds: ServiceAccountCreds,
    private cost: CostController,
    private spreadsheetIdOpt?: string,
  ) {}

  private async token(): Promise<string> {
    return getGoogleAccessToken(this.creds, SCOPES);
  }

  private async api<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = await this.token();
    return httpJson<T>(`${SHEETS}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      body,
      estUsd: 0,
      label: `sheets.${method}`,
      cost: this.cost,
    });
  }

  async ensureSpreadsheet(title: string): Promise<string> {
    if (this.spreadsheetIdOpt) return this.spreadsheetIdOpt;
    const res = await this.api<{ spreadsheetId: string }>('', 'POST', { properties: { title } });
    log.info('created spreadsheet', { spreadsheetId: res.spreadsheetId, title });
    this.spreadsheetIdOpt = res.spreadsheetId;
    return res.spreadsheetId;
  }

  async ensureTabs(spreadsheetId: string, tabs: string[]): Promise<void> {
    const meta = await this.api<{ sheets: { properties: { title: string } }[] }>(
      `/${spreadsheetId}?fields=sheets.properties.title`,
      'GET',
    );
    const existing = new Set((meta.sheets ?? []).map((s) => s.properties.title));
    const toAdd = tabs.filter((t) => !existing.has(t));
    if (toAdd.length === 0) return;
    await this.api(`/${spreadsheetId}:batchUpdate`, 'POST', {
      requests: toAdd.map((title) => ({ addSheet: { properties: { title } } })),
    });
    log.info('added tabs', { tabs: toAdd });
  }

  async writeHeaders(spreadsheetId: string, tab: string, headers: string[]): Promise<void> {
    await this.api(`/${spreadsheetId}/values/${encodeURIComponent(a1(tab))}?valueInputOption=RAW`, 'PUT', {
      values: [headers],
    });
  }

  async readTab(spreadsheetId: string, tab: string): Promise<string[][]> {
    try {
      const res = await this.api<{ values?: string[][] }>(
        `/${spreadsheetId}/values/${encodeURIComponent(a1(tab, 'A1:ZZ100000'))}`,
        'GET',
      );
      return res.values ?? [];
    } catch {
      return [];
    }
  }

  async upsertRows(
    spreadsheetId: string,
    tab: string,
    idColumn: string,
    headers: string[],
    rows: Record<string, unknown>[],
    protectedColumns: string[],
  ): Promise<UpsertResult> {
    const existing = await this.readTab(spreadsheetId, tab);
    const existingHeader = existing[0] ?? [];
    const idIdx = existingHeader.indexOf(idColumn);
    const protectedIdx = new Map<string, number>();
    for (const p of protectedColumns) {
      const i = existingHeader.indexOf(p);
      if (i >= 0) protectedIdx.set(p, i);
    }
    // Index existing rows by id for preservation + change detection.
    const existingById = new Map<string, string[]>();
    if (idIdx >= 0) {
      for (let r = 1; r < existing.length; r++) {
        const id = existing[r][idIdx];
        if (id) existingById.set(id, existing[r]);
      }
    }

    let written = 0;
    let skipped = 0;
    let preserved = 0;
    const matrix: string[][] = [headers];
    for (const row of rows) {
      const id = String(row[idColumn] ?? '');
      const prior = existingById.get(id);
      const out = headers.map((h) => {
        // Preserve protected human-edited columns if non-empty in the sheet.
        if (protectedColumns.includes(h) && prior) {
          const pi = protectedIdx.get(h);
          const priorVal = pi !== undefined ? prior[pi] : '';
          if (priorVal && priorVal.trim() !== '') {
            preserved++;
            return priorVal;
          }
        }
        const v = row[h];
        return v === null || v === undefined ? '' : String(v);
      });
      // Change detection (ignoring preserved cols already overlaid).
      if (prior && rowsEqual(prior, out)) skipped++;
      else written++;
      matrix.push(out);
    }

    await this.api(`/${spreadsheetId}/values/${encodeURIComponent(a1(tab, 'A1:ZZ100000'))}:clear`, 'POST', {});
    await this.api(`/${spreadsheetId}/values/${encodeURIComponent(a1(tab))}?valueInputOption=RAW`, 'PUT', {
      values: matrix,
    });
    log.info('sheet upsert', { tab, written, skipped, preserved });
    return { written, skipped, preserved };
  }
}

function rowsEqual(a: string[], b: string[]): boolean {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if ((a[i] ?? '') !== (b[i] ?? '')) return false;
  return true;
}
