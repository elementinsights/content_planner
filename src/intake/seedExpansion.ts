/**
 * Seed expansion. Turns intake (subject + categories + seed topics) into a broad
 * universe of CANDIDATE keyword strings using real query-modifier patterns.
 *
 * These are genuine candidate queries (the same shapes a human would paste into
 * Ahrefs). Their metrics stay null until a live provider validates them — we
 * NEVER attach fabricated volume/KD. In live mode this set is unioned with real
 * provider keyword ideas and competitor keywords.
 */
import type { IntakeResult, KeywordRecord, SearchIntent, FunnelStage, PageType, CategorySeed } from '../core/types.ts';
import { emptyMetrics } from '../core/types.ts';
import { normalizeKeyword, slugify, uniq } from '../core/text.ts';
import { MODIFIERS } from '../config/defaults.ts';

interface Bucket {
  pageTypeHint: PageType;
  intent: SearchIntent;
  funnel: FunnelStage;
  categorySlug: string;
}

function facetsFor(subject: string, categories: CategorySeed[]): string[] {
  const subj = subject.toLowerCase();
  const aspects = [
    subj,
    `${subj} strategy`,
    `${subj} automation`,
    `${subj} analytics`,
    `${subj} reporting`,
    `${subj} workflow`,
    `${subj} examples`,
    `${subj} templates`,
    `${subj} metrics`,
    `${subj} pricing`,
    `${subj} integrations`,
    `${subj} for beginners`,
    `${subj} for small business`,
    `${subj} for agencies`,
    `${subj} for startups`,
    `${subj} optimization`,
    `${subj} dashboard`,
    `${subj} roi`,
    `${subj} kpis`,
    `${subj} campaigns`,
  ];
  const fromCats = categories.flatMap((c) =>
    c.subcategories.map((s) => `${subj} ${s.toLowerCase()}`),
  );
  return uniq([...aspects, ...fromCats]);
}

/** Concept-style comparison pairs (NOT fabricated product names). */
function comparisonPairs(subject: string): string[] {
  const subj = subject.toLowerCase();
  const axes = [
    [`${subj}`, `traditional methods`],
    [`${subj} software`, `spreadsheets`],
    [`in-house ${subj}`, `outsourced ${subj}`],
    [`free ${subj} tools`, `paid ${subj} tools`],
    [`${subj} automation`, `manual ${subj}`],
    [`${subj} for beginners`, `${subj} for experts`],
  ];
  return axes.map(([a, b]) => `${a} vs ${b}`);
}

function pickCategorySlug(categories: CategorySeed[], slug: string): string {
  return categories.find((c) => c.slug === slug)?.slug ?? categories[0].slug;
}

export function expandSeeds(intake: IntakeResult): KeywordRecord[] {
  const subject = intake.interpretedNiche;
  const subj = subject.toLowerCase();
  const categories = intake.initialCategories;
  const facets = facetsFor(subject, categories);
  const out: KeywordRecord[] = [];
  const seen = new Set<string>();

  const push = (keyword: string, b: Bucket, sourceTopic: string) => {
    const k = normalizeKeyword(keyword);
    if (!k || k.split(' ').length > 9 || seen.has(k)) return;
    // skip excluded topics
    if (intake.excludedTopics.some((e) => k.includes(e.toLowerCase()))) return;
    seen.add(k);
    out.push({
      keyword: k,
      normalized: k,
      intent: b.intent,
      funnel: b.funnel,
      modifier: b.pageTypeHint,
      sourceTopic,
      category: b.categorySlug,
      metrics: emptyMetrics(),
    });
  };

  const fundamentals = pickCategorySlug(categories, 'fundamentals');
  const howto = pickCategorySlug(categories, 'how-to');
  const tools = pickCategorySlug(categories, 'tools');
  const compare = pickCategorySlug(categories, 'compare');

  // 1. Long-tail question pages (TOFU informational)
  for (const f of facets) {
    for (const q of MODIFIERS.question) {
      push(`${q} ${f}`, { pageTypeHint: 'longtail-question', intent: 'informational', funnel: 'TOFU', categorySlug: fundamentals }, f);
    }
  }
  // 2. Spokes (how-to + informational suffix) -> MOFU
  for (const f of facets) {
    for (const m of MODIFIERS.informational) {
      const phrase = m.startsWith('how') || m.startsWith('guide') ? `${m} ${f}` : `${f} ${m}`;
      push(phrase, { pageTypeHint: 'spoke', intent: 'informational', funnel: 'MOFU', categorySlug: howto }, f);
    }
  }
  // 3. Glossary / definitions (single-concept terms)
  const conceptTerms = uniq([subj, ...categories.flatMap((c) => c.subcategories.map((s) => s.toLowerCase()))]);
  for (const c of conceptTerms) {
    for (const g of MODIFIERS.glossary) {
      push(`${c} ${g}`, { pageTypeHint: 'glossary', intent: 'informational', funnel: 'TOFU', categorySlug: fundamentals }, c);
    }
  }
  // 4. Commercial roundups / reviews (MOFU/BOFU commercial)
  for (const f of facets) {
    for (const m of MODIFIERS.commercial) {
      const phrase = ['best', 'top', 'cheapest', 'free', 'best free', 'top rated'].includes(m) ? `${m} ${f}` : `${f} ${m}`;
      push(phrase, { pageTypeHint: 'commercial', intent: 'commercial', funnel: m.includes('best') || m.includes('top') ? 'MOFU' : 'BOFU', categorySlug: tools }, f);
    }
  }
  // 5. Comparison pages
  for (const cp of comparisonPairs(subject)) {
    push(cp, { pageTypeHint: 'comparison', intent: 'commercial', funnel: 'MOFU', categorySlug: compare }, subj);
  }
  // 6. Tools / templates / checklists (assets)
  for (const f of facets) {
    for (const t of MODIFIERS.tool) {
      const pageType: PageType = t.includes('calculator') || t.includes('generator')
        ? 'tool'
        : t.includes('checklist')
          ? 'checklist'
          : 'template';
      push(`${f} ${t}`, { pageTypeHint: pageType, intent: 'commercial', funnel: 'MOFU', categorySlug: compare }, f);
    }
  }
  // 7. A few FAQ aggregator pages
  for (const c of categories) {
    push(`${subj} ${c.slug.replace('-', ' ')} faq`, { pageTypeHint: 'faq', intent: 'informational', funnel: 'TOFU', categorySlug: c.slug }, subj);
  }

  return out;
}

export function recordSlug(rec: KeywordRecord): string {
  return slugify(rec.keyword);
}
