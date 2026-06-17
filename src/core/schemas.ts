/**
 * Zod schemas for input validation and for validating optional LLM intake output.
 */
import { z } from 'zod';

export const SiteTypeSchema = z.enum([
  'affiliate',
  'lead-gen',
  'saas-support',
  'ads',
  'newsletter',
  'ecommerce',
  'service-business',
  'mixed',
]);

export const PlanInputSchema = z.object({
  idea: z.string().min(3, 'idea is required (a sentence describing the site)'),
  seedKeyword: z.string().optional(),
  extraSeedKeywords: z.array(z.string()).optional(),
  broadTopic: z.string().optional(),
  nicheDescription: z.string().optional(),
  exampleCompetitor: z.string().optional(),
  competitors: z.array(z.string()).optional(),
  audience: z.string().optional(),
  monetization: z.string().optional(),
  excludedTopics: z.array(z.string()).optional(),
  geo: z.string().optional(),
  language: z.string().optional(),
  minArticles: z.number().int().positive().optional(),
  maxArticles: z.number().int().positive().optional(),
  brandPositioning: z.string().optional(),
  contentStyle: z.string().optional(),
  siteType: SiteTypeSchema.optional(),
});

export type PlanInputParsed = z.infer<typeof PlanInputSchema>;

/** Shape we ask an LLM intake provider to return; validated before use. */
export const LlmIntakeSchema = z.object({
  interpretedNiche: z.string(),
  startingWedge: z.string(),
  recommendedStartingAngle: z.string(),
  audienceAssumptions: z.array(z.string()),
  monetizationAssumptions: z.array(z.string()),
  seedTopics: z.array(z.string()).min(3),
  seedKeywords: z.array(z.string()).min(5),
  competitorDomains: z.array(z.string()),
  excludedTopics: z.array(z.string()),
  geo: z.string(),
  language: z.string(),
  initialCategories: z
    .array(
      z.object({
        name: z.string(),
        rationale: z.string().optional(),
        subcategories: z.array(z.string()).optional(),
        seedModifiers: z.array(z.string()).optional(),
      }),
    )
    .min(3),
  contentMarketingAssumptions: z.array(z.string()),
  acquisitionChannels: z.array(z.string()),
  ymylRiskFlags: z.array(z.string()),
});

export type LlmIntakeParsed = z.infer<typeof LlmIntakeSchema>;

export function parsePlanInput(raw: unknown): PlanInputParsed {
  return PlanInputSchema.parse(raw);
}
