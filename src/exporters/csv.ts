/**
 * CSV exporter. Writes the full content map and every workbook tab to CSV so the
 * plan is reviewable without Google auth.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkbookTab } from './workbook.ts';
import { log } from '../core/logger.ts';

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tabToCsv(tab: WorkbookTab): string {
  const lines = [tab.headers.map(esc).join(',')];
  for (const row of tab.rows) {
    lines.push(tab.headers.map((h) => esc((row as Record<string, unknown>)[h])).join(','));
  }
  return lines.join('\n');
}

export function exportCsv(outDir: string, tabs: WorkbookTab[]): string[] {
  const dir = join(outDir, 'csv');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const tab of tabs) {
    const file = join(dir, `${tab.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`);
    writeFileSync(file, tabToCsv(tab));
    files.push(file);
  }
  // Canonical content map at top level for convenience.
  const contentMap = tabs.find((t) => t.name === 'Content Map');
  if (contentMap) {
    const top = join(outDir, 'content-map.csv');
    writeFileSync(top, tabToCsv(contentMap));
    files.push(top);
  }
  log.info('CSV export complete', { files: files.length, dir });
  return files;
}
