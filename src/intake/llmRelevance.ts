/**
 * LLM topical-relevance gate.
 *
 * Runs AFTER keyword gathering and BEFORE the expensive SERP/clustering steps, so
 * only on-topic keywords reach the plan. An LLM understands what a word-matching
 * filter cannot: "alpine buck" and "lamancha" are goats; "fences for sheep",
 * "do foxes eat meat", and "what to feed villagers to breed" (a video game) are
 * not. Batched for cost. Falls back to the lexical filter when no LLM is
 * configured, and fails OPEN per-batch (keeps keywords) so a transient LLM error
 * never silently deletes the universe.
 */
import type { IntakeResult, KeywordRecord } from '../core/types.ts';
import type { AppConfig } from '../config/env.ts';
import type { CostController } from '../core/cost.ts';
import { callLlmJson } from '../providers/llm/llmClient.ts';
import { buildRelevanceFilter } from './relevance.ts';
import { normalizeForMatch } from '../core/text.ts';
import { log } from '../core/logger.ts';

const BATCH = 120;

export function llmCreds(cfg: AppConfig): { provider: 'anthropic' | 'openai'; apiKey: string; model: string } | null {
  if (cfg.llm.provider === 'anthropic' && cfg.llm.anthropicApiKey)
    return { provider: 'anthropic', apiKey: cfg.llm.anthropicApiKey, model: cfg.llm.anthropicModel };
  if (cfg.llm.provider === 'openai' && cfg.llm.openaiApiKey)
    return { provider: 'openai', apiKey: cfg.llm.openaiApiKey, model: cfg.llm.openaiModel };
  return null;
}

export async function filterRelevantKeywords(
  records: KeywordRecord[],
  intake: IntakeResult,
  cfg: AppConfig,
  cost: CostController,
): Promise<KeywordRecord[]> {
  const lexical = buildRelevanceFilter(intake);
  const creds = llmCreds(cfg);

  // No LLM available — use the deterministic lexical filter.
  if (!creds) {
    const kept = records.filter((r) => lexical.isRelevant(r.keyword));
    log.info('relevance gate (lexical — no LLM configured)', {
      in: records.length, kept: kept.length, dropped: records.length - kept.length,
    });
    return kept;
  }

  const system =
    `You are an SEO keyword qualifier for a single website. The website's topic is:\n"${intake.interpretedNiche}"\n\n` +
    `Keep a keyword ONLY IF it passes BOTH tests:\n` +
    `(1) ON-TOPIC — it is about the site's core subject and its audience would search it. REJECT keywords whose primary subject is something else even if they share a word (other animals/species, unrelated hobbies, generic cooking/recipes, unrelated products, video games, trivia). Comparisons that help the audience decide ARE on-topic (e.g. "X vs Y", "can X and Y live together"); but REJECT terms whose ONLY subject is the OTHER entity (its breeds, gestation, anatomy). Keep on-topic jargon/breed/tool/condition terms even without the obvious subject word.\n` +
    `Be STRICT on ADJACENT subjects: if a phrase is fundamentally about a DIFFERENT animal/entity (its OWN care, breeds, suitability, feeding, or anatomy) and the site's subject is not central to it, REJECT — even if the site's audience might also keep or be curious about that other thing. Only keep cross-subject phrases that directly involve or compare to the site's subject.\n` +
    `(2) VIABLE ARTICLE — it is specific enough to anchor its OWN article. REJECT bare head terms with no angle (the subject word alone, "a <subject>", "<subject> info", "<subject> animal"), misspellings/typos, vague sentence fragments ("feed or breed", "what are <subject> for"), and ambiguous one-word terms.\n` +
    `Return ONLY a JSON object {"keep":["<keyword>", ...]} listing exactly the input keywords (verbatim) that pass BOTH tests. Do not invent, rephrase, or add keywords.`;

  const keepNorms = new Set<string>();
  let batches = 0;
  let llmFailures = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const user = `Keywords:\n${chunk.map((r) => `- ${r.keyword}`).join('\n')}`;
    // Try the LLM up to twice (transient prose-wrapped JSON / API blips); only after
    // both fail do we drop to the weaker lexical filter for this batch.
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      try {
        const raw = (await callLlmJson({ ...creds, system, user, cost })) as { keep?: unknown };
        if (!Array.isArray(raw.keep)) throw new Error('LLM relevance response missing a "keep" array');
        for (const k of raw.keep) if (typeof k === 'string') keepNorms.add(normalizeForMatch(k));
        batches++;
        done = true;
      } catch (err) {
        if (attempt === 1) {
          llmFailures++;
          for (const r of chunk) if (lexical.isRelevant(r.keyword)) keepNorms.add(normalizeForMatch(r.keyword));
          log.warn('relevance batch failed after retry; lexical fallback for this batch', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  const kept = records.filter((r) => keepNorms.has(normalizeForMatch(r.keyword)));
  log.info('relevance gate (LLM)', {
    in: records.length, kept: kept.length, dropped: records.length - kept.length, batches, llmFailures,
  });
  // Safety net: if the LLM somehow rejected almost everything (bad response), keep
  // the lexical set instead of shipping an empty plan.
  if (kept.length < records.length * 0.1) {
    const lex = records.filter((r) => lexical.isRelevant(r.keyword));
    log.warn('relevance gate kept <10% — falling back to lexical set', { llmKept: kept.length, lexicalKept: lex.length });
    return lex.length > kept.length ? lex : kept;
  }
  return kept;
}
