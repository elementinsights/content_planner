/**
 * Null SEO provider: used in STRUCTURAL MODE when no SEO API keys are present.
 * Returns null metrics for every keyword. It NEVER fabricates numbers — it only
 * marks data as missing (liveData=false) so downstream flags LIVE_DATA_REQUIRED.
 */
import type { SEODataProvider, GeoLang, KeywordIdea } from '../interfaces.ts';
import { emptyMetrics, type KeywordMetrics } from '../../core/types.ts';

export class NullSeoProvider implements SEODataProvider {
  readonly name = 'null-seo';
  readonly available = false;

  async getKeywordMetrics(keywords: string[], _opts?: GeoLang): Promise<Map<string, KeywordMetrics>> {
    const m = new Map<string, KeywordMetrics>();
    for (const k of keywords) m.set(k, emptyMetrics());
    return m;
  }

  async getKeywordIdeas(seeds: string[], _opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]> {
    // No live ideas in structural mode; expansion is handled deterministically
    // by the seed-expansion module (real query strings, null metrics).
    return [];
  }
}
