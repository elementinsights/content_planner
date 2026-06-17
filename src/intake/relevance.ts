/**
 * Topic-relevance filter for the keyword universe.
 *
 * Keyword discovery pulls from two places: seed-based provider ideas (on-topic by
 * construction) and competitor organic keywords (NOT — a homestead competitor
 * ranks for "soup season" and "leghorn chickens" too). Without a relevance gate,
 * that bleed lands in the plan as off-topic pages.
 *
 * This gate keeps a keyword only if it (a) hits a topic ANCHOR derived from the
 * intake and (b) does not name an EXCLUDED off-topic subject. It is generalizable:
 * anchors and excludes come from the intake, never hardcoded to any one niche.
 */
import type { IntakeResult } from '../core/types.ts';

/**
 * Tokens that must never count as a topic anchor: English function words, generic
 * blog/SEO modifiers, and cross-topic husbandry/commerce generics. Without this,
 * a token shared across niches ("best", "buying", "feed", "care") would let
 * unrelated keywords slip through (e.g. "buying a chicken coop", "chicken feed").
 * On-topic keywords survive via the subject word itself (e.g. "goat") or a
 * distinctive domain term (e.g. "hoof", "kidding", "famacha").
 */
const STOP = new Set<string>([
  // function words
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'how',
  'in', 'into', 'is', 'it', 'me', 'my', 'near', 'of', 'on', 'or', 'our', 'out', 'per', 'should',
  'that', 'the', 'this', 'to', 'up', 'us', 'use', 'using', 'vs', 'versus', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'you', 'your',
  // generic SEO / blog modifiers
  'basic', 'basics', 'beginner', 'beginners', 'best', 'budget', 'category', 'cheap', 'cheapest',
  'checklist', 'common', 'complete', 'cost', 'easy', 'essential', 'example', 'examples', 'free',
  'good', 'great', 'guide', 'guides', 'idea', 'ideas', 'kind', 'kinds', 'list', 'overview',
  'price', 'pricing', 'rated', 'review', 'reviews', 'simple', 'step', 'steps', 'template',
  'templates', 'tip', 'tips', 'top', 'tutorial', 'tutorials', 'type', 'types', 'ultimate',
  // generic actions / qualities (the leaky ones)
  'buy', 'buying', 'care', 'caring', 'choose', 'choosing', 'daily', 'eat', 'eating', 'feed',
  'feeding', 'first', 'food', 'get', 'getting', 'keep', 'keeping', 'make', 'making', 'manage',
  'managing', 'need', 'needs', 'own', 'owning', 'pick', 'raise', 'raising', 'requirement',
  'requirements', 'routine', 'schedule', 'select', 'selecting', 'selection', 'start', 'starting',
  // generic time / number / unit / misc
  'day', 'days', 'long', 'many', 'month', 'months', 'much', 'name', 'names', 'new', 'number',
  'numbers', 'old', 'season', 'seasonal', 'week', 'weeks', 'year', 'years',
]);

const tokenize = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];
/** Naive singular/plural stem so "goat" and "goats" match. */
const stem = (t: string): string => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);

export interface RelevanceFilter {
  anchors: Set<string>;
  excludes: string[];
  isRelevant(keyword: string): boolean;
  /** Why a keyword was dropped (for logging/inspection). */
  rejectReason(keyword: string): 'excluded-subject' | 'no-anchor' | null;
}

export function buildRelevanceFilter(intake: IntakeResult): RelevanceFilter {
  const source = [
    ...intake.seedTopics,
    ...intake.seedKeywords,
    intake.interpretedNiche,
    ...intake.initialCategories.map((c) => c.name),
    ...intake.initialCategories.flatMap((c) => c.subcategories ?? []),
    ...intake.initialCategories.flatMap((c) => c.seedModifiers ?? []),
    // LLM may supply explicit anchors; tolerate its absence on older intakes.
    ...(((intake as unknown as { relevanceAnchors?: string[] }).relevanceAnchors) ?? []),
  ].join(' ');

  const anchors = new Set<string>();
  for (const t of tokenize(source)) {
    if (t.length < 3 || STOP.has(t)) continue;
    anchors.add(stem(t));
  }

  // Excluded subjects: explicit intake excludes + sensible defaults for the
  // common case (adjacent homestead/livestock subjects that aren't the topic).
  // These only fire when the topic anchors don't already claim the keyword.
  const excludes = intake.excludedTopics.map((e) => e.toLowerCase().trim()).filter(Boolean);

  function isRelevant(keyword: string): boolean {
    return rejectReason(keyword) === null;
  }

  function rejectReason(keyword: string): 'excluded-subject' | 'no-anchor' | null {
    const k = keyword.toLowerCase();
    if (excludes.some((e) => k.includes(e))) return 'excluded-subject';
    for (const t of tokenize(k)) if (anchors.has(stem(t))) return null;
    return 'no-anchor';
  }

  return { anchors, excludes, isRelevant, rejectReason };
}
