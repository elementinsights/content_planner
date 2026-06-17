/**
 * Tunable defaults. NOTHING here is hardcoded into logic — every planner reads
 * from this module so the system can be retuned per niche without code changes.
 */
import type { PageType, SiteType, SearchIntent } from '../core/types.ts';

// ---------------------------------------------------------------------------
// Keyword difficulty by publishing phase (brand-new, no-backlink site)
// ---------------------------------------------------------------------------
export interface PhaseKdDef {
  phase: number;
  label: string;
  kdRange: [number, number];
  selectiveExceptionUpTo: number;
  rationale: string;
}

export const KD_BY_PHASE: PhaseKdDef[] = [
  {
    phase: 1,
    label: 'Foundation (weeks 0-8)',
    kdRange: [0, 10],
    selectiveExceptionUpTo: 20,
    rationale:
      'Zero authority. Win only very weak SERPs (KD 0-10). Allow up to ~20 ONLY when SERP weakness is high and strategic value (cluster/internal-link/commercial) is clear.',
  },
  {
    phase: 2,
    label: 'Expansion (months 2-4)',
    kdRange: [10, 20],
    selectiveExceptionUpTo: 30,
    rationale:
      'Early topical signals exist. Target KD 10-20; selective 20-30 where SERP weakness + traffic potential justify it.',
  },
  {
    phase: 3,
    label: 'Authority-building (months 4-8)',
    kdRange: [20, 35],
    selectiveExceptionUpTo: 40,
    rationale:
      'Support structure + internal links in place. Begin selective 20-35 plays; reserve 35-40 for strong topical fit + weak SERPs.',
  },
  {
    phase: 4,
    label: 'Competitive (months 8+)',
    kdRange: [30, 100],
    selectiveExceptionUpTo: 100,
    rationale:
      'Only after demonstrated authority + earned links. KD 30+ pursued only when topical fit and SERP weakness justify it.',
  },
];

// ---------------------------------------------------------------------------
// Search-volume thresholds (recommended MINIMUM monthly local volume floors)
// These are dynamic inputs, blended per-row with intent/business-value/SERP.
// ---------------------------------------------------------------------------
export const VOLUME_FLOOR_BY_PAGE_TYPE: Record<PageType, number> = {
  pillar: 300,
  'category-hub': 150,
  'sub-hub': 80,
  spoke: 60,
  'longtail-question': 20,
  glossary: 10,
  faq: 10,
  comparison: 40,
  commercial: 30, // commercial intent tolerates low volume (high value)
  tool: 0, // assets can target zero-volume strategic terms
  template: 0,
  checklist: 0,
  'case-study': 0,
  support: 0,
};

export const VOLUME_FLOOR_BY_PHASE: Record<number, number> = {
  1: 30, // phase 1 leans long-tail; low floor
  2: 60,
  3: 120,
  4: 250,
};

export const VOLUME_FLOOR_BY_INTENT: Record<SearchIntent, number> = {
  informational: 50,
  commercial: 20,
  transactional: 10,
  navigational: 10,
};

/** Reasons that justify allowing a low/zero-volume keyword onto the plan. */
export const LOW_VOLUME_ALLOWANCE_REASONS = [
  'high commercial intent',
  'high CPC / monetizable',
  'high business value',
  'strong topical-authority support',
  'strong cluster-completeness value',
  'internal-link importance',
  'weak SERPs / low competition',
  'low backlink dependency',
  'necessary glossary/support role',
  'important hub or pillar support',
  'strong promotional or linkable-asset value',
];

// ---------------------------------------------------------------------------
// Page-count tiers + architecture distribution
// ---------------------------------------------------------------------------
export const PAGE_COUNT_TIERS = [200, 300, 500, 700, 1000] as const;
export const MIN_ARTICLES_FLOOR = 200;

/** Default page-type distribution. Pillars are capped separately (1-3). */
export const ARCHITECTURE_RATIOS: Record<PageType, number> = {
  pillar: 0.01,
  'category-hub': 0.025,
  'sub-hub': 0.06,
  spoke: 0.36,
  'longtail-question': 0.2,
  glossary: 0.07,
  faq: 0.05,
  comparison: 0.07,
  commercial: 0.06,
  tool: 0.02,
  template: 0.02,
  checklist: 0.02,
  'case-study': 0.03,
  support: 0.025,
};

export const MAX_PILLARS = 3;
export const MIN_PILLARS = 1;
export const DEFAULT_CATEGORY_MIN = 3;
export const DEFAULT_CATEGORY_MAX = 5;

// ---------------------------------------------------------------------------
// Keyword-expansion modifier sets (real query patterns; metrics stay null)
// Generous on purpose so structural mode can produce a deep universe.
// ---------------------------------------------------------------------------
export const MODIFIERS = {
  informational: [
    'how to', 'guide to', 'guide', 'examples', 'examples of', 'tips', 'best practices',
    'for beginners', 'explained', 'basics', 'fundamentals', 'strategy', 'strategies',
    'ideas', 'mistakes', 'mistakes to avoid', 'benefits', 'use cases', 'workflow',
    'process', 'steps', 'tutorial', 'overview', 'trends', 'statistics', 'vs traditional',
  ],
  question: [
    'what is', 'why', 'how does', 'how do', 'when to', 'where to', 'do you need',
    'can you', 'should you', 'how much does', 'how long does', 'is it worth',
    'how to choose', 'how to start', 'how to use',
  ],
  commercial: [
    'best', 'top', 'best free', 'top rated', 'cheapest', 'free', 'review', 'reviews',
    'alternatives', 'alternative to', 'for small business', 'for startups',
    'for agencies', 'for beginners', 'pricing', 'cost', 'is worth it',
  ],
  comparison: ['vs', 'or', 'compared to', 'difference between'],
  glossary: ['meaning', 'definition', 'explained', 'definition and examples'],
  tool: ['template', 'checklist', 'calculator', 'generator', 'worksheet', 'cheat sheet', 'examples template'],
} as const;

// ---------------------------------------------------------------------------
// Content format + freshness defaults by page type
// ---------------------------------------------------------------------------
export const CONTENT_FORMAT: Record<PageType, string> = {
  pillar: 'Comprehensive guide (2500-4000 words, ToC, sectioned, updated annually)',
  'category-hub': 'Hub / overview page with curated links to spokes (1200-2000 words)',
  'sub-hub': 'Sub-topic hub linking related spokes (900-1500 words)',
  spoke: 'Focused how-to / explainer article (1200-2000 words)',
  'longtail-question': 'Direct-answer article, answer-first then depth (800-1400 words)',
  glossary: 'Concise definition + context + examples (400-800 words)',
  faq: 'Structured Q&A page with FAQ schema (600-1200 words)',
  comparison: 'Side-by-side comparison with table + verdict (1200-2000 words)',
  commercial: 'Buyer-intent roundup / review with selection criteria (1500-2800 words)',
  tool: 'Interactive tool / calculator page + supporting copy',
  template: 'Downloadable template + how-to-use instructions',
  checklist: 'Actionable checklist + downloadable + context',
  'case-study': 'Narrative case study with data, process, outcome',
  support: 'Supporting reference / definition / how-it-works page',
};

export const FRESHNESS: Record<PageType, string> = {
  pillar: 'High — review quarterly, refresh annually',
  'category-hub': 'Medium — update when new spokes ship',
  'sub-hub': 'Medium — update when new spokes ship',
  spoke: 'Medium — review every 6-12 months',
  'longtail-question': 'Low-Medium — review yearly',
  glossary: 'Low — review yearly',
  faq: 'Medium — keep answers current',
  comparison: 'High — pricing/features change; review quarterly',
  commercial: 'High — products/pricing change; review quarterly',
  tool: 'Medium — keep formulas/logic current',
  template: 'Low — refresh on format changes',
  checklist: 'Low-Medium — review yearly',
  'case-study': 'Low — evergreen once published',
  support: 'Low — review yearly',
};

// ---------------------------------------------------------------------------
// Site-type hints: default category seeds + monetization framing
// ---------------------------------------------------------------------------
export const SITE_TYPE_HINTS: Record<SiteType, { monetization: string; commercialBias: number }> = {
  affiliate: { monetization: 'Affiliate commissions on recommended tools/products', commercialBias: 0.45 },
  'lead-gen': { monetization: 'Lead capture -> sales / booked calls', commercialBias: 0.35 },
  'saas-support': { monetization: 'Product-led: support/docs driving activation & retention', commercialBias: 0.3 },
  ads: { monetization: 'Display/native ad revenue on high-traffic informational content', commercialBias: 0.15 },
  newsletter: { monetization: 'Newsletter subscriptions / sponsorships', commercialBias: 0.2 },
  ecommerce: { monetization: 'Direct product sales (category/PLP + supporting content)', commercialBias: 0.5 },
  'service-business': { monetization: 'Service inquiries / bookings', commercialBias: 0.4 },
  mixed: { monetization: 'Blended: ads + affiliate + email capture', commercialBias: 0.3 },
};

// ---------------------------------------------------------------------------
// External-source category library (used by the external-source planner).
// Generic, authoritative source *categories* — never fabricated specific URLs.
// ---------------------------------------------------------------------------
export const AUTHORITATIVE_SOURCE_CATEGORIES = [
  'Official product/documentation pages (primary source)',
  'Peer-reviewed research / academic publications',
  'Government / regulatory bodies (.gov, official agencies)',
  'Standards organizations / official specs',
  'Recognized industry research firms / original data studies',
  'Original first-party data / experiments you run',
  'Reputable trade publications',
  'Official statistics portals',
];

export const SOURCES_TO_AVOID = [
  'AI-generated content farms with no authorship',
  'Unattributed aggregators / scraped listicles',
  'Direct competitors you are trying to outrank (do not pass authority/ideas)',
  'Outdated sources for fast-moving topics',
  'Paywalled sources readers cannot verify',
];

export const YMYL_TRIGGER_TERMS = [
  'finance', 'money', 'invest', 'loan', 'credit', 'insurance', 'tax', 'mortgage',
  'health', 'medical', 'medicine', 'disease', 'symptom', 'diet', 'supplement',
  'legal', 'law', 'lawyer', 'safety', 'crypto', 'retirement',
];
