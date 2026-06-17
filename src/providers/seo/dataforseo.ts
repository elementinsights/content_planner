/**
 * DataForSEO adapter (SECONDARY / supplemental SEO intelligence).
 * Roles: search volume + trend supplement, KD via Labs, keyword ideas, backup.
 * Used to fill metrics Ahrefs did not provide, or as the sole live source if
 * Ahrefs is absent. Maps defensively; returns null on anything unreadable.
 */
import type { SEODataProvider, GeoLang, KeywordIdea, CompetitorPage } from '../interfaces.ts';
import { emptyMetrics, type KeywordMetrics, type SearchIntent } from '../../core/types.ts';
import type { CostController } from '../../core/cost.ts';
import { httpJson } from '../http.ts';
import { log } from '../../core/logger.ts';
import { dfsAuthHeader, locationCode, languageCode, numOrNull } from './dataforseoCommon.ts';

const BASE = 'https://api.dataforseo.com';

function mapIntent(v: unknown): SearchIntent | null {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('transactional')) return 'transactional';
  if (s.includes('commercial')) return 'commercial';
  if (s.includes('navigational')) return 'navigational';
  if (s.includes('informational')) return 'informational';
  return null;
}

/** Pure mapper: DataForSEO Labs relevant_pages -> CompetitorPage[] (testable). */
export function mapDfsRelevantPages(res: any): CompetitorPage[] {
  const items = res?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .map((it: any) => ({
      url: String(it.page_address ?? ''),
      estimatedTraffic: numOrNull(it.metrics?.organic?.etv),
      topKeyword: null,
      referringDomains: null,
      pageType: null,
    }))
    .filter((p: CompetitorPage) => p.url);
}

/** Pure mapper: DataForSEO Labs ranked_keywords -> KeywordIdea[] (testable). */
export function mapDfsRankedKeywords(res: any): KeywordIdea[] {
  const items = res?.tasks?.[0]?.result?.[0]?.items ?? [];
  const out: KeywordIdea[] = [];
  for (const it of items) {
    const kd = it.keyword_data ?? {};
    const kw = String(kd.keyword ?? '');
    if (!kw) continue;
    out.push({
      keyword: kw,
      metrics: {
        ...emptyMetrics(),
        searchVolume: numOrNull(kd.keyword_info?.search_volume),
        cpc: numOrNull(kd.keyword_info?.cpc),
        keywordDifficulty: numOrNull(kd.keyword_properties?.keyword_difficulty),
        source: 'dataforseo',
        liveData: true,
      },
    });
  }
  return out;
}

export class DataForSeoProvider implements SEODataProvider {
  readonly name = 'dataforseo';
  readonly available = true;
  constructor(
    private login: string,
    private password: string,
    private cost: CostController,
  ) {}
  /** Intents discovered alongside metrics, exposed for ingestion to reuse. */
  readonly intents = new Map<string, SearchIntent>();

  private headers() {
    return { authorization: dfsAuthHeader(this.login, this.password) };
  }

  async getKeywordMetrics(keywords: string[], opts: GeoLang): Promise<Map<string, KeywordMetrics>> {
    const out = new Map<string, KeywordMetrics>();
    for (let i = 0; i < keywords.length; i += 700) {
      const batch = keywords.slice(i, i + 700);
      try {
        const res = await httpJson<any>(`${BASE}/v3/keywords_data/google_ads/search_volume/live`, {
          method: 'POST',
          headers: this.headers(),
          body: [{ keywords: batch, location_code: locationCode(opts.geo), language_code: languageCode(opts.language) }],
          estUsd: 0.05,
          label: 'dfs.search_volume',
          cost: this.cost,
        });
        const items = res?.tasks?.[0]?.result ?? [];
        for (const it of items) {
          const kw = String(it.keyword ?? '');
          if (!kw) continue;
          out.set(kw, {
            ...emptyMetrics(),
            searchVolume: numOrNull(it.search_volume),
            cpc: numOrNull(it.cpc),
            source: 'dataforseo',
            liveData: true,
          });
        }
      } catch (err) {
        log.warn('dfs.getKeywordMetrics batch failed', { error: err instanceof Error ? err.message : String(err) });
      }
      for (const kw of batch) if (!out.has(kw)) out.set(kw, { ...emptyMetrics(), source: 'dataforseo' });
    }
    return out;
  }

  async getKeywordIdeas(seeds: string[], opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]> {
    const ideas: KeywordIdea[] = [];
    try {
      const res = await httpJson<any>(`${BASE}/v3/dataforseo_labs/google/keyword_ideas/live`, {
        method: 'POST',
        headers: this.headers(),
        body: [
          {
            keywords: seeds.slice(0, 20),
            location_code: locationCode(opts.geo),
            language_code: languageCode(opts.language),
            limit: opts.limit ?? 700,
          },
        ],
        estUsd: 0.1,
        label: 'dfs.keyword_ideas',
        cost: this.cost,
      });
      const items = res?.tasks?.[0]?.result?.[0]?.items ?? [];
      for (const it of items) {
        const kw = String(it.keyword ?? '');
        if (!kw) continue;
        const intent = mapIntent(it.search_intent_info?.main_intent);
        if (intent) this.intents.set(kw, intent);
        ideas.push({
          keyword: kw,
          metrics: {
            ...emptyMetrics(),
            searchVolume: numOrNull(it.keyword_info?.search_volume),
            cpc: numOrNull(it.keyword_info?.cpc),
            keywordDifficulty: numOrNull(it.keyword_properties?.keyword_difficulty),
            source: 'dataforseo',
            liveData: true,
          },
        });
      }
    } catch (err) {
      log.warn('dfs.getKeywordIdeas failed', { error: err instanceof Error ? err.message : String(err) });
    }
    return ideas;
  }

  async getReferringDomains(targetUrl: string): Promise<number | null> {
    try {
      const res = await httpJson<any>(`${BASE}/v3/backlinks/summary/live`, {
        method: 'POST',
        headers: this.headers(),
        body: [{ target: targetUrl, internal_list_limit: 1 }],
        estUsd: 0.02,
        label: 'dfs.backlinks_summary',
        cost: this.cost,
      });
      return numOrNull(res?.tasks?.[0]?.result?.[0]?.referring_domains);
    } catch {
      return null;
    }
  }

  /** Competitor top pages via DataForSEO Labs relevant_pages (gap analysis). */
  async getCompetitorTopPages(domain: string, opts: GeoLang & { limit?: number }): Promise<CompetitorPage[]> {
    try {
      const res = await httpJson<any>(`${BASE}/v3/dataforseo_labs/google/relevant_pages/live`, {
        method: 'POST',
        headers: this.headers(),
        body: [{ target: domain, location_code: locationCode(opts.geo), language_code: languageCode(opts.language), limit: opts.limit ?? 50 }],
        estUsd: 0.1,
        label: 'dfs.relevant_pages',
        cost: this.cost,
      });
      return mapDfsRelevantPages(res);
    } catch (err) {
      log.warn('dfs.getCompetitorTopPages failed', { domain, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /** Competitor ranking keywords via DataForSEO Labs ranked_keywords (gap fuel). */
  async getCompetitorOrganicKeywords(domain: string, opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]> {
    try {
      const res = await httpJson<any>(`${BASE}/v3/dataforseo_labs/google/ranked_keywords/live`, {
        method: 'POST',
        headers: this.headers(),
        body: [
          {
            target: domain,
            location_code: locationCode(opts.geo),
            language_code: languageCode(opts.language),
            limit: opts.limit ?? 200,
            order_by: ['keyword_data.keyword_info.search_volume,desc'],
          },
        ],
        estUsd: 0.1,
        label: 'dfs.ranked_keywords',
        cost: this.cost,
      });
      const ideas = mapDfsRankedKeywords(res);
      // Capture intent classification for reuse by ingestion, when present.
      const items = res?.tasks?.[0]?.result?.[0]?.items ?? [];
      for (const it of items) {
        const kw = String(it.keyword_data?.keyword ?? '');
        const intent = mapIntent(it.keyword_data?.search_intent_info?.main_intent);
        if (kw && intent) this.intents.set(kw, intent);
      }
      return ideas;
    } catch (err) {
      log.warn('dfs.getCompetitorOrganicKeywords failed', { domain, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
}
