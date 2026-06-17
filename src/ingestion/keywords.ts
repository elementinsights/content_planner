/**
 * Keyword ingestion. Builds the candidate universe (deterministic expansion) and,
 * in live mode, unions it with real provider keyword ideas + competitor organic
 * keywords, then enriches metrics (Ahrefs primary; DataForSEO fills the gaps).
 * In structural mode it returns the expansion with null metrics (no fabrication).
 */
import type { IntakeResult, KeywordRecord, SearchIntent, FunnelStage } from '../core/types.ts';
import { emptyMetrics } from '../core/types.ts';
import { normalizeKeyword, leadingModifier, uniq, contentTokens } from '../core/text.ts';
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

/** Most frequent on-topic tokens across the seeds — the subject word(s) to expand
 *  via autocomplete suggestions (e.g. "goat"/"goats"). */
function subjectTokens(intake: IntakeResult, n: number): string[] {
  const freq = new Map<string, number>();
  for (const s of [...intake.seedTopics, ...intake.seedKeywords]) {
    for (const t of contentTokens(s)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

/** Question-stem prefix seeds (e.g. "can goats", "why do goats"). Seeding autocomplete
 *  on each pulls that ENTIRE branch ("can goats drink/eat/digest ...") instead of a
 *  popularity-capped slice of the broad subject term. */
function questionPrefixSeeds(intake: IntakeResult): string[] {
  const subj = subjectTokens(intake, 1)[0];
  if (!subj) return [];
  // Comprehensive question stems. keyword_suggestions does contains-matching, so
  // imperfect grammar is fine — this works for ANY subject, countable or not
  // ("can goats…", "is coffee…", "best running shoes…").
  const stems = [
    'can', 'do', 'does', 'are', 'is', 'will', 'why do', 'how do', 'how to', 'what do',
    'what', 'when do', 'when to', 'where do', 'should', 'how much', 'how many', 'best',
  ];
  return stems.map((st) => `${st} ${subj}`);
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
    // Autocomplete/long-tail suggestions — captures the question long-tail that
    // keyword_ideas misses (e.g. "can goats eat carrots", "do goats ...").
    const suggestionSeeds = uniq([...questionPrefixSeeds(intake), ...subjectTokens(intake, 2), ...intake.seedKeywords]).slice(0, 80);
    for (const p of liveProviders) {
      if (!p.getKeywordSuggestions) continue;
      for (const seed of suggestionSeeds) {
        try {
          const sugg = await p.getKeywordSuggestions(seed, { ...geo, limit: 1000 });
          for (const idea of sugg) {
            const k = normalizeKeyword(idea.keyword);
            if (!k || byKey.has(k) || intake.excludedTopics.some((e) => k.includes(e.toLowerCase()))) continue;
            const { intent, funnel } = classifyKeyword(k);
            const rec: KeywordRecord = { keyword: k, normalized: k, intent, funnel, modifier: null, sourceTopic: `suggestions:${seed}`, category: intake.initialCategories[0].slug, metrics: idea.metrics };
            byKey.set(k, rec);
            records.push(rec);
          }
        } catch (err) {
          log.warn('keyword suggestions failed', { seed, error: err instanceof Error ? err.message : String(err) });
        }
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

  // Live mode: drop candidates with no real search volume. These are synthetic
  // seed-expansion strings (e.g. "<topic> meaning") that DataForSEO has no data
  // for — zero traffic value, and they were leaking in as fake pillars. Structural
  // mode keeps everything (metrics are intentionally null there).
  if (liveProviders.length > 0) {
    const real = records.filter((r) => (r.metrics.searchVolume ?? 0) > 0);
    if (real.length < records.length) {
      log.info('dropped zero-volume candidates (live mode)', { dropped: records.length - real.length, kept: real.length });
    }
    return real;
  }
  return records;
}
