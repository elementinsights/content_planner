/**
 * Ahrefs adapter (PRIMARY SEO intelligence). Implements Ahrefs API v3.
 *
 * IMPORTANT: Ahrefs API access tiers and exact field names vary by plan. The
 * endpoint paths + `select` fields below are written against the documented v3
 * shape and should be confirmed against your subscription. The adapter maps
 * defensively and returns `null` for anything it cannot read — it NEVER invents
 * metrics. If your plan lacks an endpoint, that capability simply stays null and
 * the system falls back to structural priors (clearly flagged).
 */
import type { SEODataProvider, GeoLang, KeywordIdea, CompetitorPage } from '../interfaces.ts';
import { emptyMetrics, type KeywordMetrics } from '../../core/types.ts';
import type { CostController } from '../../core/cost.ts';
import { httpJson } from '../http.ts';
import { log } from '../../core/logger.ts';

const BASE = 'https://api.ahrefs.com';

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

export class AhrefsProvider implements SEODataProvider {
  readonly name = 'ahrefs';
  readonly available = true;
  constructor(
    private apiKey: string,
    private cost: CostController,
  ) {}

  private headers() {
    return { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' };
  }

  private mapRow(row: Record<string, unknown>): KeywordMetrics {
    return {
      searchVolume: numOrNull(row.volume ?? row.search_volume),
      globalVolume: numOrNull(row.global_volume ?? row.volume_global),
      trafficPotential: numOrNull(row.traffic_potential ?? row.traffic),
      cpc: numOrNull(row.cpc),
      clicks: numOrNull(row.clicks),
      keywordDifficulty: numOrNull(row.difficulty ?? row.keyword_difficulty),
      parentTopic: strOrNull(row.parent_topic ?? (row.parent as Record<string, unknown>)?.keyword),
      trend: null,
      source: 'ahrefs',
      liveData: true,
    };
  }

  async getKeywordMetrics(keywords: string[], opts: GeoLang): Promise<Map<string, KeywordMetrics>> {
    const out = new Map<string, KeywordMetrics>();
    const select = 'keyword,volume,difficulty,cpc,clicks,parent_topic,global_volume,traffic_potential';
    for (let i = 0; i < keywords.length; i += 100) {
      const batch = keywords.slice(i, i + 100);
      const url = `${BASE}/v3/keywords-explorer/overview?country=${encodeURIComponent(opts.geo)}&select=${encodeURIComponent(select)}&keywords=${encodeURIComponent(batch.join(','))}`;
      try {
        const res = await httpJson<Record<string, unknown>>(url, {
          headers: this.headers(),
          estUsd: 0.01,
          label: 'ahrefs.overview',
          cost: this.cost,
        });
        const rows = (res.keywords ?? res.metrics ?? res.data ?? []) as Record<string, unknown>[];
        for (const row of rows) {
          const kw = strOrNull(row.keyword);
          if (kw) out.set(kw, this.mapRow(row));
        }
      } catch (err) {
        log.warn('ahrefs.getKeywordMetrics batch failed -> null metrics for batch', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      for (const kw of batch) if (!out.has(kw)) out.set(kw, { ...emptyMetrics(), source: 'ahrefs' });
    }
    return out;
  }

  async getKeywordIdeas(seeds: string[], opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]> {
    const ideas: KeywordIdea[] = [];
    const limit = opts.limit ?? 1000;
    for (const seed of seeds) {
      const url = `${BASE}/v3/keywords-explorer/matching-terms?country=${encodeURIComponent(opts.geo)}&keywords=${encodeURIComponent(seed)}&limit=${Math.min(limit, 1000)}&select=keyword,volume,difficulty,cpc,clicks,parent_topic,traffic_potential`;
      try {
        const res = await httpJson<Record<string, unknown>>(url, {
          headers: this.headers(),
          estUsd: 0.02,
          label: 'ahrefs.matching-terms',
          cost: this.cost,
        });
        const rows = (res.keywords ?? res.terms ?? res.data ?? []) as Record<string, unknown>[];
        for (const row of rows) {
          const kw = strOrNull(row.keyword);
          if (kw) ideas.push({ keyword: kw, metrics: this.mapRow(row) });
        }
      } catch (err) {
        log.warn('ahrefs.getKeywordIdeas failed for seed', { seed, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return ideas;
  }

  async getCompetitorTopPages(domain: string, opts: GeoLang & { limit?: number }): Promise<CompetitorPage[]> {
    const url = `${BASE}/v3/site-explorer/top-pages?target=${encodeURIComponent(domain)}&country=${encodeURIComponent(opts.geo)}&limit=${opts.limit ?? 100}&select=url,traffic,top_keyword,refdomains`;
    try {
      const res = await httpJson<Record<string, unknown>>(url, {
        headers: this.headers(),
        estUsd: 0.05,
        label: 'ahrefs.top-pages',
        cost: this.cost,
      });
      const rows = (res.pages ?? res.data ?? []) as Record<string, unknown>[];
      return rows.map((r) => ({
        url: strOrNull(r.url) ?? '',
        estimatedTraffic: numOrNull(r.traffic),
        topKeyword: strOrNull(r.top_keyword),
        referringDomains: numOrNull(r.refdomains ?? r.referring_domains),
        pageType: null,
      }));
    } catch (err) {
      log.warn('ahrefs.getCompetitorTopPages failed', { domain, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async getCompetitorOrganicKeywords(domain: string, opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]> {
    const url = `${BASE}/v3/site-explorer/organic-keywords?target=${encodeURIComponent(domain)}&country=${encodeURIComponent(opts.geo)}&limit=${opts.limit ?? 200}&select=keyword,volume,difficulty,cpc,traffic_potential,parent_topic`;
    try {
      const res = await httpJson<Record<string, unknown>>(url, {
        headers: this.headers(),
        estUsd: 0.05,
        label: 'ahrefs.organic-keywords',
        cost: this.cost,
      });
      const rows = (res.keywords ?? res.data ?? []) as Record<string, unknown>[];
      return rows
        .map((r) => ({ keyword: strOrNull(r.keyword), metrics: this.mapRow(r) }))
        .filter((x): x is KeywordIdea => !!x.keyword) as KeywordIdea[];
    } catch (err) {
      log.warn('ahrefs.getCompetitorOrganicKeywords failed', { domain, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async getReferringDomains(targetUrl: string): Promise<number | null> {
    const url = `${BASE}/v3/site-explorer/refdomains?target=${encodeURIComponent(targetUrl)}&mode=exact&select=refdomains`;
    try {
      const res = await httpJson<Record<string, unknown>>(url, {
        headers: this.headers(),
        estUsd: 0.02,
        label: 'ahrefs.refdomains',
        cost: this.cost,
      });
      return numOrNull(res.refdomains ?? (res.metrics as Record<string, unknown>)?.refdomains);
    } catch {
      return null;
    }
  }
}
