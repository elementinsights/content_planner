/**
 * Null SERP provider for STRUCTURAL MODE. Returns an empty SERP with liveData
 * false. Downstream SERP-weakness / backlink-dependency scores fall back to
 * neutral structural priors (clearly flagged), never invented competitor data.
 */
import type { SERPProvider, GeoLang } from '../interfaces.ts';
import type { SerpData } from '../../core/types.ts';

export class NullSerpProvider implements SERPProvider {
  readonly name = 'null-serp';
  readonly available = false;

  async getSerp(keyword: string, _opts: GeoLang): Promise<SerpData> {
    return {
      keyword,
      results: [],
      features: [],
      medianReferringDomains: null,
      weakResultsRatio: null,
      source: null,
      liveData: false,
    };
  }
}
