/**
 * SERP ingestion + overlap analysis. In live mode, fetches SERPs for a shortlist
 * (cost-bounded) and computes a SERP-overlap signature per keyword used later for
 * cannibalization detection. In structural mode, no SERP data is produced (null);
 * SERP-weakness scoring falls back to clearly-flagged structural priors.
 */
import type { KeywordRecord, SerpData } from '../core/types.ts';
import type { SERPProvider, GeoLang } from '../providers/interfaces.ts';
import type { Store } from '../storage/store.ts';
import { log } from '../core/logger.ts';

export interface SerpIngestResult {
  serpByKeyword: Map<string, SerpData>;
  liveData: boolean;
}

/** Domain signature of a SERP (top domains) for overlap comparison. */
export function serpSignature(serp: SerpData | undefined): string[] {
  if (!serp) return [];
  return serp.results.slice(0, 10).map((r) => r.domain).filter(Boolean);
}

export async function ingestSerp(
  records: KeywordRecord[],
  serp: SERPProvider,
  geo: GeoLang,
  opts: { limit?: number; cache?: Pick<Store, 'getSerpCache' | 'saveSerpCache'> } = {},
): Promise<SerpIngestResult> {
  const serpByKeyword = new Map<string, SerpData>();
  if (!serp.available) {
    log.warn('STRUCTURAL MODE: SERP ingestion skipped (no SERP provider). No competitor SERP data fabricated.');
    return { serpByKeyword, liveData: false };
  }
  const limit = opts.limit ?? 300;
  // Fetch SERPs for the HIGHEST-VOLUME keywords first, so SERP-overlap clustering
  // covers the most important terms within the budget.
  const ordered = records.slice().sort((a, b) => (b.metrics.searchVolume ?? 0) - (a.metrics.searchVolume ?? 0));
  const shortlist = ordered.slice(0, limit);
  log.step(`Fetching SERPs for ${shortlist.length} keywords (by volume; cached where possible)`);
  // Concurrency for the network-bound fetches. SERP results are independent, so
  // fetching in parallel returns IDENTICAL data — only faster. Tunable via env.
  const concurrency = Math.max(1, Number(process.env.SEO_SERP_CONCURRENCY ?? 8));
  let cached = 0;
  let fetched = 0;
  let failed = 0;

  // Pass 1: serve cache hits first (no network).
  const toFetch: KeywordRecord[] = [];
  for (const rec of shortlist) {
    const key = `${geo.geo}:${rec.normalized}`;
    const hit = opts.cache?.getSerpCache(key);
    if (hit) {
      try {
        const data = JSON.parse(hit) as SerpData;
        rec.serp = data;
        serpByKeyword.set(rec.keyword, data);
        cached++;
        continue;
      } catch {
        /* fall through to refetch */
      }
    }
    toFetch.push(rec);
  }

  // Pass 2: fetch the misses in parallel chunks, with one retry on transient errors
  // so a hiccup never silently drops a keyword from the clustering.
  const fetchOne = async (rec: KeywordRecord): Promise<void> => {
    const key = `${geo.geo}:${rec.normalized}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await serp.getSerp(rec.keyword, geo);
        rec.serp = data;
        serpByKeyword.set(rec.keyword, data);
        opts.cache?.saveSerpCache(key, JSON.stringify(data));
        fetched++;
        return;
      } catch (err) {
        if (attempt === 1) {
          failed++;
          log.warn('serp fetch failed (after retry)', { keyword: rec.keyword, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  };
  for (let i = 0; i < toFetch.length; i += concurrency) {
    await Promise.all(toFetch.slice(i, i + concurrency).map(fetchOne));
    if (i > 0 && i % (concurrency * 50) === 0) log.info('SERP fetch progress', { done: i, remaining: toFetch.length - i });
  }

  log.info('SERP ingestion complete', { fetched, cached, failed, shortlist: shortlist.length, concurrency });
  return { serpByKeyword, liveData: true };
}
