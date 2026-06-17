/**
 * Keyword ingestion. Builds the candidate universe (deterministic expansion) and,
 * in live mode, unions it with real provider keyword ideas + competitor organic
 * keywords, then enriches metrics (Ahrefs primary; DataForSEO fills the gaps).
 * In structural mode it returns the expansion with null metrics (no fabrication).
 */
import type { IntakeResult, KeywordRecord, SearchIntent, FunnelStage } from '../core/types.ts';
import { emptyMetrics } from '../core/types.ts';
import { normalizeKeyword, leadingModifier, uniq } from '../core/text.ts';
import { expandSeeds } from '../intake/seedExpansion.ts';
import type { Providers } from '../providers/registry.ts';
import type { GeoLang } from '../providers/interfaces.ts';
import { log } from '../core/logger.ts';

export function classifyKeyword(keyword: string): { intent: SearchIntent; funnel: FunnelStage } {
  const k = keyword.toLowerCase();
  if (/\b(buy|price|pricing|cost|cheap|discount|coupon|deal|for sale)\b/.test(k)) return { intent: 'transactional', funnel: 'BOFU' };
  if (/\b(best|top|review|reviews|vs|alternative|alternatives|compare|comparison)\b/.test(k)) return { intent: 'commercial', funnel: 'MOFU' };
  const m = leadingModifier(k);
  if (m && ['what', 'how', 'why', 'when', 'where', 'who', 'which'].includes(m)) return { intent: 'informational', funnel: 'TOFU' };
  return { intent: 'informational', funnel: 'MOFU' };
}

export async function ingestKeywords(
  intake: IntakeResult,
  providers: Providers,
  geo: GeoLang,
): Promise<KeywordRecord[]> {
  const records: KeywordRecord[] = expandSeeds(intake);
  const byKey = new Map(records.map((r) => [r.keyword, r]));
  const liveProviders = providers.seo.filter((p) => p.available);

  if (liveProviders.length > 0) {
    log.step('Live keyword ingestion (provider ideas + competitor keywords)');
    const seeds = uniq([...intake.seedTopics, ...intake.seedKeywords]);
    for (const p of liveProviders) {
      try {
        const ideas = await p.getKeywordIdeas(seeds, { ...geo, limit: 800 });
        for (const idea of ideas) {
          const k = normalizeKeyword(idea.keyword);
          if (!k || intake.excludedTopics.some((e) => k.includes(e.toLowerCase()))) continue;
          if (!byKey.has(k)) {
            const { intent, funnel } = classifyKeyword(k);
            const rec: KeywordRecord = { keyword: k, normalized: k, intent, funnel, modifier: null, sourceTopic: 'provider-ideas', category: intake.initialCategories[0].slug, metrics: idea.metrics };
            byKey.set(k, rec);
            records.push(rec);
          } else if (idea.metrics.liveData) {
            byKey.get(k)!.metrics = idea.metrics;
          }
        }
      } catch (err) {
        log.warn('keyword ideas failed for provider', { provider: p.name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Competitor organic keywords (gap fuel)
    for (const domain of intake.competitorDomains) {
      for (const p of liveProviders) {
        if (!p.getCompetitorOrganicKeywords) continue;
        try {
          const ckw = await p.getCompetitorOrganicKeywords(domain, { ...geo, limit: 200 });
          for (const idea of ckw) {
            const k = normalizeKeyword(idea.keyword);
            if (!k || byKey.has(k) || intake.excludedTopics.some((e) => k.includes(e.toLowerCase()))) continue;
            const { intent, funnel } = classifyKeyword(k);
            const rec: KeywordRecord = { keyword: k, normalized: k, intent, funnel, modifier: null, sourceTopic: `competitor:${domain}`, category: intake.initialCategories[0].slug, metrics: idea.metrics };
            byKey.set(k, rec);
            records.push(rec);
          }
        } catch (err) {
          log.warn('competitor organic keywords failed', { domain, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    // Enrich metrics for all records (primary first, then fill nulls with secondary)
    log.step(`Enriching metrics for ${records.length} keywords`);
    const keys = records.map((r) => r.keyword);
    for (const p of liveProviders) {
      const metricsMap = await p.getKeywordMetrics(keys, geo);
      for (const r of records) {
        const m = metricsMap.get(r.keyword);
        if (!m) continue;
        if (!r.metrics.liveData && m.liveData) r.metrics = m;
        else if (r.metrics.liveData) {
          // fill individual null fields from secondary without overwriting primary
          r.metrics.searchVolume ??= m.searchVolume;
          r.metrics.keywordDifficulty ??= m.keywordDifficulty;
          r.metrics.cpc ??= m.cpc;
          r.metrics.trafficPotential ??= m.trafficPotential;
          r.metrics.parentTopic ??= m.parentTopic;
        }
      }
    }

    // Apply provider-classified search intent (e.g. DataForSEO) — more accurate
    // than the lexical default. Drives page typing and funnel stage.
    for (const p of liveProviders) {
      const intents = (p as { intents?: Map<string, SearchIntent> }).intents;
      if (!(intents instanceof Map)) continue;
      for (const r of records) {
        const it = intents.get(r.keyword);
        if (!it) continue;
        r.intent = it;
        r.funnel = it === 'transactional' ? 'BOFU' : it === 'commercial' ? 'MOFU' : r.funnel;
      }
    }
  } else {
    log.warn(`STRUCTURAL MODE: ${records.length} candidate keywords generated with NULL metrics (flagged LIVE_DATA_REQUIRED).`);
    for (const r of records) if (!r.metrics) r.metrics = emptyMetrics();
  }

  log.info('keyword universe built', { total: records.length, live: liveProviders.length > 0 });
  return records;
}
