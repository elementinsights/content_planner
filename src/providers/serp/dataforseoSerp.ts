/**
 * DataForSEO SERP adapter (live SERP layer). Pulls Google organic results +
 * SERP features. Per-result referring-domain counts are NOT fetched here (that
 * needs a per-URL backlinks call); the optional `enrichReferringDomains` hook in
 * ingestion can backfill those from an SEODataProvider. UGC/weakness detection
 * is computed from the result set, never invented.
 */
import type { SERPProvider, GeoLang } from '../interfaces.ts';
import type { SerpData, SerpResultItem } from '../../core/types.ts';
import type { CostController } from '../../core/cost.ts';
import { httpJson } from '../http.ts';
import { log } from '../../core/logger.ts';
import { dfsAuthHeader, locationCode, languageCode } from '../seo/dataforseoCommon.ts';

const BASE = 'https://api.dataforseo.com';

const UGC_DOMAINS = [
  'reddit.com', 'quora.com', 'youtube.com', 'medium.com', 'facebook.com', 'pinterest.com',
  'linkedin.com', 'stackexchange.com', 'stackoverflow.com', 'wikihow.com', 'tumblr.com',
];

function isUgc(domain: string): boolean {
  return UGC_DOMAINS.some((d) => domain.endsWith(d)) || /forum|community|board/.test(domain);
}

export class DataForSeoSerpProvider implements SERPProvider {
  readonly name = 'dataforseo-serp';
  readonly available = true;
  constructor(
    private login: string,
    private password: string,
    private cost: CostController,
  ) {}

  async getSerp(keyword: string, opts: GeoLang): Promise<SerpData> {
    try {
      const res = await httpJson<any>(`${BASE}/v3/serp/google/organic/live/advanced`, {
        method: 'POST',
        headers: { authorization: dfsAuthHeader(this.login, this.password) },
        body: [
          {
            keyword,
            location_code: locationCode(opts.geo),
            language_code: languageCode(opts.language),
            depth: 10,
          },
        ],
        estUsd: 0.03,
        label: 'dfs.serp',
        cost: this.cost,
      });
      const items = res?.tasks?.[0]?.result?.[0]?.items ?? [];
      const features = new Set<string>();
      const results: SerpResultItem[] = [];
      for (const it of items) {
        if (it.type && it.type !== 'organic') {
          features.add(String(it.type));
          continue;
        }
        const domain = String(it.domain ?? '');
        results.push({
          position: Number(it.rank_absolute ?? it.rank_group ?? results.length + 1),
          url: String(it.url ?? ''),
          domain,
          title: it.title ?? null,
          referringDomains: null,
          domainRating: null,
          pageType: null,
          isUgc: isUgc(domain),
        });
      }
      const ugcCount = results.filter((r) => r.isUgc).length;
      return {
        keyword,
        results,
        features: [...features],
        medianReferringDomains: null,
        weakResultsRatio: results.length ? ugcCount / results.length : null,
        source: 'dataforseo',
        liveData: true,
      };
    } catch (err) {
      log.warn('dfs.getSerp failed -> empty serp', { keyword, error: err instanceof Error ? err.message : String(err) });
      return { keyword, results: [], features: [], medianReferringDomains: null, weakResultsRatio: null, source: 'dataforseo', liveData: false };
    }
  }
}
