/**
 * LLM completeness audit (the "best plan" differentiator).
 *
 * Keyword tools can only find what you already think to search for. This asks the
 * model — as a domain content strategist — for the COMPLETE set of subtopics a
 * definitive authority on the niche must cover, surfacing structural gaps the base
 * seeds miss, then feeds them back as discovery seeds. Runs once, right after
 * intake. No LLM configured / any error -> returns [] (discovery proceeds on the
 * base seeds; never worse than before).
 */
import type { IntakeResult } from '../core/types.ts';
import type { AppConfig } from '../config/env.ts';
import type { CostController } from '../core/cost.ts';
import { callLlmJson } from '../providers/llm/llmClient.ts';
import { llmCreds } from './llmRelevance.ts';
import { log } from '../core/logger.ts';

export async function completenessSeeds(
  intake: IntakeResult,
  cfg: AppConfig,
  cost: CostController,
): Promise<string[]> {
  const creds = llmCreds(cfg);
  if (!creds) {
    log.info('completeness audit skipped (no LLM configured)');
    return [];
  }
  const system =
    `You are a world-class SEO content strategist building the DEFINITIVE authority site on:\n"${intake.interpretedNiche}".\n\n` +
    `Top-level categories so far: ${intake.initialCategories.map((c) => c.name).join(' | ')}.\n` +
    `Seed topics so far: ${intake.seedTopics.slice(0, 24).join('; ')}.\n\n` +
    `List EVERY important subtopic, problem, recurring question theme, comparison, and buying decision a COMPREHENSIVE authority on this niche must cover to win maximum organic traffic — ESPECIALLY ones MISSING from the lists above. Cover the full breadth of the niche AND its recurring depth (specific issues, breeds/types, tools/gear, seasons/stages, mistakes, costs).\n` +
    `Return ONLY JSON {"seeds":["<phrase>", ...]} with 60-100 concise, on-topic seed phrases (2-5 words each, suitable for keyword research). No duplicates, nothing off-topic, no full sentences, no questions.`;
  try {
    const raw = (await callLlmJson({ ...creds, system, user: 'Return the JSON now.', cost })) as { seeds?: unknown };
    const seeds = Array.isArray(raw.seeds)
      ? [...new Set(raw.seeds.filter((s): s is string => typeof s === 'string' && s.trim().length > 2).map((s) => s.trim().toLowerCase()))]
      : [];
    log.info('completeness audit (LLM)', { gapSeeds: seeds.length });
    return seeds;
  } catch (err) {
    log.warn('completeness audit failed; proceeding on base seeds', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
