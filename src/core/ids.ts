/**
 * Stable, immutable identifier generation.
 * Page IDs must be deterministic across runs so Google Sheets can match rows
 * by Page ID and preserve human-edited fields.
 */
import { slugify } from './text.ts';

/** djb2 hash -> base36, short and stable. */
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Deterministic Page ID derived from the canonical identity of a page
 * (primary keyword + page type). Stable across re-runs => safe upsert key.
 */
export function pageId(primaryKeyword: string, pageType: string): string {
  return `P-${hash(`${slugify(primaryKeyword)}::${pageType}`).padStart(7, '0').slice(0, 7)}`;
}

export function clusterId(name: string): string {
  return `C-${hash(slugify(name)).padStart(6, '0').slice(0, 6)}`;
}

export function runId(seed: string, isoTimestamp: string): string {
  return `R-${hash(`${seed}::${isoTimestamp}`).slice(0, 8)}`;
}
