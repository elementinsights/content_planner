/**
 * JSON exporter. Emits the full plan and a content-map.json (the PlannedPage[]).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanResult } from '../core/types.ts';
import { log } from '../core/logger.ts';

export function exportJson(outDir: string, plan: PlanResult): string[] {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];

  const planFile = join(outDir, 'plan.json');
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
  files.push(planFile);

  const mapFile = join(outDir, 'content-map.json');
  writeFileSync(mapFile, JSON.stringify(plan.pages, null, 2));
  files.push(mapFile);

  log.info('JSON export complete', { files });
  return files;
}
