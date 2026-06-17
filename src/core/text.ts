/**
 * Text utilities: slugify, tokenization, similarity metrics.
 * Pure functions, no dependencies. Used by clustering, cannibalization, Astro planning.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'your', 'you', 'do', 'does', 'can', 'should',
]);

/** Lowercase, strip accents, collapse non-alphanumerics into single hyphens. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Normalize a keyword string for comparison (lowercase, single-spaced, trimmed). */
export function normalizeKeyword(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Aggressive normalization for matching LLM-returned strings back to keywords:
 * strips accents, drops apostrophes/quotes (so "goat's" == "goats"), and folds all
 * other punctuation to single spaces. Use when an LLM may echo a keyword with
 * minor cosmetic drift (case, accents, hyphens, "&").
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize into lowercase words (alphanumeric runs). */
export function tokenize(input: string): string[] {
  return normalizeKeyword(input)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Content tokens with stopwords removed. */
export function contentTokens(input: string): string[] {
  return tokenize(input).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Jaccard similarity over token sets (0..1). */
export function jaccard(a: string, b: string): number {
  const sa = new Set(contentTokens(a));
  const sb = new Set(contentTokens(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Character-bigram Dice coefficient — good for title/H1 fuzzy similarity (0..1). */
export function diceCoefficient(a: string, b: string): number {
  const na = normalizeKeyword(a).replace(/\s+/g, '');
  const nb = normalizeKeyword(b).replace(/\s+/g, '');
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  for (const [g, c] of ba) {
    const c2 = bb.get(g);
    if (c2) inter += Math.min(c, c2);
  }
  return (2 * inter) / (na.length - 1 + (nb.length - 1));
}

/** Overlap coefficient between two arbitrary string arrays (0..1). */
export function setOverlap(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

export function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && STOPWORDS.has(w.toLowerCase()) && w.length <= 4
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ');
}

/** Extract the leading interrogative/modifier of a keyword, if any. */
export function leadingModifier(keyword: string): string | null {
  const first = tokenize(keyword)[0];
  const mods = new Set([
    'how', 'what', 'why', 'when', 'where', 'who', 'which', 'best', 'top', 'cheap',
    'free', 'vs', 'is', 'are', 'can', 'should', 'do', 'does',
  ]);
  return first && mods.has(first) ? first : null;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}
