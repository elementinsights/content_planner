/**
 * Semrush adapter — OPTIONAL, supported as a future path (never primary).
 * Scaffolded so the registry can wire it when SEMRUSH_API_KEY is present. Until
 * the endpoint mapping is implemented for a given plan it returns null metrics
 * rather than fabricating anything.
 */
import type { SEODataProvider, GeoLang, KeywordIdea } from '../interfaces.ts';
import { emptyMetrics, type KeywordMetrics } from '../../core/types.ts';
import type { CostController } from '../../core/cost.ts';
import { log } from '../../core/logger.ts';

export class SemrushProvider implements SEODataProvider {
  readonly name = 'semrush';
  readonly available = true;
  constructor(
    private apiKey: string,
    private cost: CostController,
  ) {}

  async getKeywordMetrics(keywords: string[], _opts: GeoLang): Promise<Map<string, KeywordMetrics>> {
    log.warn('Semrush adapter is an optional placeholder; returning null metrics (no fabrication).');
    const m = new Map<string, KeywordMetrics>();
    for (const k of keywords) m.set(k, { ...emptyMetrics(), source: 'semrush' });
    return m;
  }

  async getKeywordIdeas(): Promise<KeywordIdea[]> {
    return [];
  }
}
