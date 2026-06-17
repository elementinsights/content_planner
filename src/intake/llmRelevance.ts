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
    `You are an SEO topical-relevance classifier for a single website.\n` +
    `The website's topic is:\n"${intake.interpretedNiche}"\n\n` +
    `For EACH keyword, decide whether it belongs on THIS website — i.e. it is about the site's core subject and its target audience would search it on the way to that subject.\n` +
    `REJECT keywords whose primary subject is something else, even if they share a word: other animals or species, unrelated hobbies, generic cooking/recipes, products unrelated to the topic, video games, trivia, etc.\n` +
    `KEEP on-topic terms even when they don't contain the obvious subject word (breed names, jargon, tools, conditions that belong to the topic).\n` +
    `Decision test: is the PRIMARY subject/entity of the phrase this site's topic? If the head noun is a different entity (another animal, a recipe, a game, a place), REJECT — word overlap alone is not enough.\n` +
    `Return ONLY a JSON object of the form {"keep":["<keyword>", ...]} listing exactly the input keywords (verbatim) that belong. Do not invent, rephrase, or add keywords.`;

  const keepNorms = new Set<string>();
  let batches = 0;
  let llmFailures = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const user = `Keywords:\n${chunk.map((r) => `- ${r.keyword}`).join('\n')}`;
    try {
      const raw = (await callLlmJson({ ...creds, system, user, cost })) as { keep?: unknown };
      // A wrong-shape response (missing "keep" array) is a failure, NOT "drop the
      // whole batch": throw so the catch applies the lexical fallback instead.
      if (!Array.isArray(raw.keep)) throw new Error('LLM relevance response missing a "keep" array');
      for (const k of raw.keep) if (typeof k === 'string') keepNorms.add(normalizeForMatch(k));
      batches++;
    } catch (err) {
      // Fail open to the lexical filter for just this batch — never lose keywords to an API blip.
      llmFailures++;
      for (const r of chunk) if (lexical.isRelevant(r.keyword)) keepNorms.add(normalizeForMatch(r.keyword));
      log.warn('relevance batch failed; lexical fallback for this batch', {
        error: err instanceof Error ? err.message : String(err),
      });
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
