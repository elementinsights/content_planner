/**
 * Intake/discovery core. Pure logic shared by the deterministic interpreter and
 * the LLM interpreter. Turns flexible user input into an interpreted niche,
 * starting wedge, seed topics/keywords, category seeds, competitor list,
 * assumptions, acquisition channels, YMYL flags, and an API research plan.
 *
 * The deterministic path requires NO network and NO keys — it is the default.
 */
import type {
  PlanInput,
  IntakeResult,
  CategorySeed,
  ApiResearchStep,
  PageType,
  SiteType,
} from '../core/types.ts';
import { slugify, titleCase, contentTokens, uniq } from '../core/text.ts';
import { SITE_TYPE_HINTS, YMYL_TRIGGER_TERMS } from '../config/defaults.ts';
import type { AppConfig } from '../config/env.ts';

/** Known example domains -> implied niche (intake assumptions, clearly heuristic). */
const KNOWN_DOMAIN_NICHE: Record<string, string> = {
  'dollarsprout.com': 'personal finance for beginners',
  'nerdwallet.com': 'personal finance and credit',
  'healthline.com': 'health and wellness',
  'investopedia.com': 'investing and finance education',
};

function looksLikeDomain(s: string): boolean {
  return /\b([a-z0-9-]+\.)+[a-z]{2,}\b/i.test(s);
}

function extractDomain(s: string): string | null {
  const m = s.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
  return m ? m[0].toLowerCase().replace(/^www\./, '') : null;
}

export function extractSubject(input: PlanInput): string {
  const raw = (input.broadTopic || input.seedKeyword || input.nicheDescription || input.idea || '').trim();
  let s = ' ' + raw.toLowerCase() + ' ';
  s = s.replace(/\bi\s+want\s+(to\s+build\s+|to\s+create\s+|a\s+)?/g, ' ');
  s = s.replace(/\b(i'd like|i would like|please|build|create|make|start)\b/g, ' ');
  s = s.replace(/\b(a|an|the)\s+(website|web\s*site|site|blog|page|brand)\b/g, ' ');
  s = s.replace(/\b(website|web\s*site|site|blog|page)\b/g, ' ');
  s = s.replace(/\b(about|focused on|with topics like|covering|around|that covers|on the topic of)\b/g, ' ');
  s = s.replace(/[."'`]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s || raw;
}

function detectSiteType(input: PlanInput, subject: string): SiteType {
  if (input.siteType) return input.siteType;
  const hay = `${input.idea} ${input.monetization ?? ''} ${subject}`.toLowerCase();
  if (/affiliate|review|best .* for|recommend/.test(hay)) return 'affiliate';
  if (/saas|product|docs|support|onboarding|activation/.test(hay)) return 'saas-support';
  if (/newsletter|substack|email list/.test(hay)) return 'newsletter';
  if (/shop|store|ecommerce|product catalog|buy/.test(hay)) return 'ecommerce';
  if (/agency|service|consult|freelance|local business/.test(hay)) return 'service-business';
  if (/lead|booking|quote|demo/.test(hay)) return 'lead-gen';
  if (/ad revenue|display ads|traffic site|content site/.test(hay)) return 'ads';
  return 'mixed';
}

/** Generate 4 category seeds from the subject + site type. Generic + reusable. */
function buildCategorySeeds(subject: string, siteType: SiteType): CategorySeed[] {
  const subj = titleCase(subject);
  const commercialBias = SITE_TYPE_HINTS[siteType].commercialBias;
  const seeds: CategorySeed[] = [
    {
      name: `${subj} Fundamentals`,
      slug: 'fundamentals',
      rationale: 'TOFU education + glossary builds topical authority and supports internal linking from day one.',
      intentMix: { informational: 0.9, commercial: 0.1 },
      subcategories: ['Getting Started', 'Concepts & Definitions', 'How It Works'],
      seedModifiers: ['what is', 'how does', 'basics', 'explained', 'for beginners'],
    },
    {
      name: `${subj} Strategies & How-To`,
      slug: 'how-to',
      rationale: 'MOFU practical guides capture intent-rich long-tail with weak SERPs — ideal for a no-backlink start.',
      intentMix: { informational: 0.8, commercial: 0.2 },
      subcategories: ['Step-by-Step Guides', 'Best Practices', 'Workflows', 'Mistakes to Avoid'],
      seedModifiers: ['how to', 'guide', 'tips', 'best practices', 'examples'],
    },
    {
      name: `${subj} Tools & Software`,
      slug: 'tools',
      rationale: `Commercial-investigation hub; monetizable (${(commercialBias * 100).toFixed(0)}% commercial bias for ${siteType}).`,
      intentMix: { informational: 0.4, commercial: 0.6 },
      subcategories: ['Roundups', 'Reviews', 'Free Tools'],
      seedModifiers: ['best', 'top', 'free', 'review', 'alternatives'],
    },
    {
      name: `${subj} Comparisons & Templates`,
      slug: 'compare',
      rationale: 'Comparison + linkable assets (templates/checklists) earn links and convert; strong promotion value.',
      intentMix: { informational: 0.5, commercial: 0.5 },
      subcategories: ['Comparisons', 'Templates & Checklists', 'Case Studies'],
      seedModifiers: ['vs', 'template', 'checklist', 'examples', 'comparison'],
    },
  ];
  return seeds;
}

/** Seed topics: subject scaffold + per-category topics. Targets ~18-26 topics. */
function buildSeedTopics(subject: string, categories: CategorySeed[]): string[] {
  const s = subject;
  const scaffold = [
    `${s} basics`,
    `${s} for beginners`,
    `how ${s} works`,
    `${s} strategy`,
    `${s} examples`,
    `${s} best practices`,
    `${s} mistakes`,
    `${s} tools`,
    `${s} software`,
    `${s} templates`,
    `${s} checklist`,
    `${s} metrics`,
    `${s} workflow`,
    `${s} tips`,
    `${s} trends`,
    `${s} case studies`,
    `${s} pricing`,
    `${s} alternatives`,
  ];
  const fromCats = categories.flatMap((c) => c.subcategories.map((sub) => `${subject} ${sub.toLowerCase()}`));
  return uniq([...scaffold, ...fromCats]).slice(0, 26);
}

function buildSeedKeywords(subject: string, categories: CategorySeed[]): string[] {
  const head = [
    subject,
    `${subject} tools`,
    `best ${subject} tools`,
    `how to use ${subject}`,
    `what is ${subject}`,
    `${subject} for beginners`,
    `${subject} examples`,
    `${subject} template`,
  ];
  const cat = categories.map((c) => `${subject} ${c.slug.replace('-', ' ')}`);
  return uniq([...head, ...cat]).slice(0, 14);
}

function buildApiResearchPlan(cfg: AppConfig, competitors: string[]): ApiResearchStep[] {
  const ahrefs = cfg.providers?.ahrefs ?? false;
  const dfs = cfg.providers?.dataforseo ?? false;
  const steps: ApiResearchStep[] = [
    {
      provider: 'ahrefs',
      endpoint: '/v3/keywords-explorer/matching-terms',
      purpose: 'Expand seed topics into the keyword universe with volume/KD/TP/parent topic',
      inputs: ['seedTopics', 'seedKeywords'],
      optional: !ahrefs,
    },
    {
      provider: 'ahrefs',
      endpoint: '/v3/keywords-explorer/overview',
      purpose: 'Enrich expanded keywords with volume, KD, CPC, clicks, traffic potential, parent topic',
      inputs: ['keywordUniverse'],
      optional: !ahrefs,
    },
    {
      provider: 'ahrefs',
      endpoint: '/v3/site-explorer/top-pages + organic-keywords',
      purpose: 'Competitor topical map, top pages, ranking keywords, content gaps',
      inputs: ['competitorDomains'],
      optional: !ahrefs || competitors.length === 0,
    },
    {
      provider: 'ahrefs',
      endpoint: '/v3/site-explorer/refdomains',
      purpose: 'Referring domains of top competing pages -> backlink dependency scoring',
      inputs: ['topCompetingUrls'],
      optional: !ahrefs,
    },
    {
      provider: 'dataforseo',
      endpoint: '/v3/serp/google/organic/live/advanced',
      purpose: 'SERP results + features for SERP-overlap, weakness, and cannibalization checks',
      inputs: ['shortlistKeywords'],
      optional: !dfs,
    },
    {
      provider: 'dataforseo',
      endpoint: '/v3/keywords_data/google_ads/search_volume/live + labs/keyword_ideas',
      purpose: 'Secondary volume/trend supplement + KD; backup if Ahrefs unavailable',
      inputs: ['keywordUniverse'],
      optional: !dfs,
    },
  ];
  return steps;
}

const CONTENT_TYPES: PageType[] = [
  'pillar',
  'category-hub',
  'sub-hub',
  'spoke',
  'longtail-question',
  'glossary',
  'faq',
  'comparison',
  'commercial',
  'tool',
  'template',
  'checklist',
  'case-study',
  'support',
];

export interface CreativeIntake {
  interpretedNiche: string;
  startingWedge: string;
  recommendedStartingAngle: string;
  audienceAssumptions: string[];
  monetizationAssumptions: string[];
  seedTopics: string[];
  seedKeywords: string[];
  competitorDomains: string[];
  categories: CategorySeed[];
  contentMarketingAssumptions: string[];
  acquisitionChannels: string[];
  ymylRiskFlags: string[];
}

/** Deterministic interpretation — the default, no-network path. */
export function deterministicInterpret(input: PlanInput, cfg: AppConfig): CreativeIntake {
  let subject = extractSubject(input);
  const competitors = uniq([
    ...(input.competitors ?? []),
    ...(input.exampleCompetitor ? [input.exampleCompetitor] : []),
  ].map((c) => extractDomain(c) ?? c.toLowerCase()).filter(Boolean));

  // If the idea is essentially just a competitor domain, map to an implied niche.
  // (extractSubject strips the dot, so check the domain stem against the subject.)
  const ideaDomain = extractDomain(input.idea);
  if (ideaDomain) {
    if (!competitors.includes(ideaDomain)) competitors.push(ideaDomain);
    const domainStem = ideaDomain.split('.')[0];
    const subjStem = slugify(subject).replace(/-/g, '');
    const subjectIsJustDomain = looksLikeDomain(subject) || subject.length < 3 || (domainStem.length > 3 && subjStem.includes(domainStem));
    if (subjectIsJustDomain && !input.broadTopic && !input.nicheDescription) {
      subject = KNOWN_DOMAIN_NICHE[ideaDomain] ?? `the niche implied by ${ideaDomain}`;
    }
  }

  const siteType = detectSiteType(input, subject);
  const categories = buildCategorySeeds(subject, siteType);
  const hint = SITE_TYPE_HINTS[siteType];
  const ymyl = uniq(
    YMYL_TRIGGER_TERMS.filter((t) => `${subject} ${input.idea}`.toLowerCase().includes(t)),
  );

  return {
    interpretedNiche: titleCase(subject),
    startingWedge: `Start narrow: "${titleCase(subject)} — ${categories[1].name}" as the beachhead cluster, then expand outward.`,
    recommendedStartingAngle:
      input.brandPositioning ??
      `A practical, no-fluff ${titleCase(subject)} resource that wins weak long-tail SERPs first, then earns authority to compete for hub terms.`,
    audienceAssumptions: input.audience
      ? [input.audience]
      : [`Beginners-to-intermediate seeking practical ${subject} guidance`, 'Searchers with task-oriented, long-tail intent'],
    monetizationAssumptions: input.monetization ? [input.monetization] : [hint.monetization],
    seedTopics: buildSeedTopics(subject, categories),
    seedKeywords: buildSeedKeywords(subject, categories),
    competitorDomains: competitors,
    categories,
    contentMarketingAssumptions: [
      'Distribution is required for a no-backlink start: links are earned via assets, not bought.',
      'Templates/checklists/tools are the primary linkable assets.',
      'Repurpose pillar/hub content into social + newsletter to seed early traffic.',
    ],
    acquisitionChannels: uniq([
      'Organic search (primary, compounding)',
      'Niche communities (Reddit/Discord/Slack) where genuinely helpful',
      'Email newsletter capture from high-intent pages',
      'Social (LinkedIn/X/YouTube Shorts) repurposing',
      siteType === 'affiliate' ? 'Comparison/roundup pages for buyer intent' : 'Lead magnets on commercial pages',
    ]),
    ymylRiskFlags: ymyl.length
      ? [`YMYL topic detected (${ymyl.join(', ')}): require expert review, cite primary sources, add author E-E-A-T.`]
      : [],
  };
}

/** Finalize creative fields into a full IntakeResult (shared by both paths). */
export function finalizeIntake(
  creative: CreativeIntake,
  input: PlanInput,
  cfg: AppConfig,
  source: IntakeResult['source'],
): IntakeResult {
  const categories: CategorySeed[] = creative.categories.map((c) => ({
    ...c,
    slug: c.slug || slugify(c.name),
  }));
  const clarifying: string[] = [];
  if (contentTokens(input.idea).length < 2 && !input.broadTopic && !input.seedKeyword) {
    clarifying.push('The idea is very broad — what specific sub-niche, audience, and monetization model should we prioritize?');
  }
  return {
    interpretedNiche: creative.interpretedNiche,
    startingWedge: creative.startingWedge,
    recommendedStartingAngle: creative.recommendedStartingAngle,
    audienceAssumptions: creative.audienceAssumptions,
    monetizationAssumptions: creative.monetizationAssumptions,
    seedTopics: creative.seedTopics,
    seedKeywords: creative.seedKeywords,
    competitorDomains: creative.competitorDomains,
    excludedTopics: input.excludedTopics ?? [],
    geo: input.geo ?? cfg.geoDefault,
    language: input.language ?? cfg.languageDefault,
    initialCategories: categories,
    initialContentTypes: CONTENT_TYPES,
    contentMarketingAssumptions: creative.contentMarketingAssumptions,
    acquisitionChannels: creative.acquisitionChannels,
    ymylRiskFlags: creative.ymylRiskFlags,
    apiResearchPlan: buildApiResearchPlan(cfg, creative.competitorDomains),
    clarifyingQuestions: clarifying,
    source,
  };
}
