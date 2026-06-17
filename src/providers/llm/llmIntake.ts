/**
 * LLM intake provider (Anthropic/OpenAI). Asks the model to interpret the user's
 * request into structured discovery fields, validates with Zod, then runs the
 * SAME deterministic finalizer (API plan, content types, slugs). Falls back to
 * the deterministic interpreter on any error so a run never hard-fails on the LLM.
 */
import type { LLMIntakeProvider } from '../interfaces.ts';
import type { PlanInput, IntakeResult, CategorySeed } from '../../core/types.ts';
import type { AppConfig } from '../../config/env.ts';
import { LlmIntakeSchema } from '../../core/schemas.ts';
import { slugify } from '../../core/text.ts';
import { deterministicInterpret, finalizeIntake, type CreativeIntake } from '../../intake/core.ts';
import { callLlmJson } from './llmClient.ts';
import type { CostController } from '../../core/cost.ts';
import { log } from '../../core/logger.ts';

const SYSTEM = `You are an expert SEO content strategist performing intake/discovery for a BRAND-NEW website with no backlinks, no rankings, and no authority.
Interpret the user's request and return ONLY a JSON object (no prose) with these keys:
interpretedNiche, startingWedge, recommendedStartingAngle, audienceAssumptions[], monetizationAssumptions[], seedTopics[] (>=12), seedKeywords[] (>=8), competitorDomains[], excludedTopics[], geo, language, initialCategories[] (3-5 objects: {name, rationale, subcategories[], seedModifiers[]}), contentMarketingAssumptions[], acquisitionChannels[], ymylRiskFlags[].
Pick a realistic STARTING WEDGE, not the whole market. Do not fabricate metrics. Do not invent competitor URLs you are not given.`;

export class LlmIntakeProvider implements LLMIntakeProvider {
  readonly name: string;
  constructor(
    readonly provider: 'anthropic' | 'openai',
    private apiKey: string,
    private model: string,
    private cfg: AppConfig,
    private cost: CostController,
  ) {
    this.name = `${provider}-intake`;
  }

  async interpret(input: PlanInput): Promise<IntakeResult> {
    try {
      const user = `User request and constraints (JSON):\n${JSON.stringify(input, null, 2)}`;
      const raw = await callLlmJson({
        provider: this.provider,
        apiKey: this.apiKey,
        model: this.model,
        system: SYSTEM,
        user,
        cost: this.cost,
      });
      const parsed = LlmIntakeSchema.parse(raw);
      const categories: CategorySeed[] = parsed.initialCategories.map((c) => ({
        name: c.name,
        slug: slugify(c.name),
        rationale: c.rationale ?? '',
        intentMix: { informational: 0.7, commercial: 0.3 },
        subcategories: c.subcategories ?? [],
        seedModifiers: c.seedModifiers ?? [],
      }));
      const creative: CreativeIntake = {
        interpretedNiche: parsed.interpretedNiche,
        startingWedge: parsed.startingWedge,
        recommendedStartingAngle: parsed.recommendedStartingAngle,
        audienceAssumptions: parsed.audienceAssumptions,
        monetizationAssumptions: parsed.monetizationAssumptions,
        seedTopics: parsed.seedTopics,
        seedKeywords: parsed.seedKeywords,
        competitorDomains: parsed.competitorDomains,
        categories,
        contentMarketingAssumptions: parsed.contentMarketingAssumptions,
        acquisitionChannels: parsed.acquisitionChannels,
        ymylRiskFlags: parsed.ymylRiskFlags,
      };
      return finalizeIntake(creative, input, this.cfg, this.provider);
    } catch (err) {
      log.warn('LLM intake failed; falling back to deterministic interpreter', {
        error: err instanceof Error ? err.message : String(err),
      });
      return finalizeIntake(deterministicInterpret(input, this.cfg), input, this.cfg, 'deterministic');
    }
  }
}
