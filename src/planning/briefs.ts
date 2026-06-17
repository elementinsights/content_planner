/**
 * SEO brief generator. Produces a lightweight STRATEGIC brief per page (NOT a
 * full draft): intent, purpose, differentiation angle, must-answer questions,
 * suggested sections, internal links, external-source suggestions, integrity
 * notes, cannibalization-clean confirmation, phase, and marketing angle.
 */
import type { PlannedPage, Brief, IntakeResult, PageType } from '../core/types.ts';
import { corePhrase } from '../clustering/cluster.ts';
import { titleCase } from '../core/text.ts';

function mustAnswer(pageType: PageType, kw: string): string[] {
  const core = titleCase(corePhrase(kw) || kw);
  switch (pageType) {
    case 'glossary':
      return [`What is ${core}?`, `Why does ${core} matter?`, `A concrete ${core} example`, `Common misconceptions about ${core}`];
    case 'comparison':
      return [`What is the core difference?`, `Which option fits which use case?`, `How do pricing & features compare?`, `Clear verdict + recommendation`];
    case 'commercial':
      return [`What are the best options for ${core}?`, `What selection criteria matter?`, `Pros and cons of each`, `Who is each option best for?`];
    case 'longtail-question':
      return [`${/\?$/.test(kw) ? titleCase(kw) : titleCase(kw) + '?'}`, `Why this is the case`, `Step-by-step / specifics`, `Common mistakes`];
    case 'pillar':
    case 'category-hub':
    case 'sub-hub':
      return [`What does ${core} cover?`, `Where should a beginner start?`, `Key subtopics (link to spokes)`, `What to do next`];
    case 'tool':
    case 'template':
    case 'checklist':
      return [`What does this ${pageType} do?`, `How to use it (steps)`, `When to use it`, `How the logic/criteria work (methodology)`];
    case 'case-study':
      return [`What was the goal & context?`, `What was the process?`, `What were the measurable results?`, `What are the takeaways?`];
    default:
      return [`How to ${core}`, `Prerequisites / context`, `Step-by-step`, `Examples & common mistakes`];
  }
}

function sections(pageType: PageType, kw: string): string[] {
  const core = titleCase(corePhrase(kw) || kw);
  const base = mustAnswer(pageType, kw).map((q) => q.replace(/\?$/, ''));
  if (pageType === 'comparison') return ['At-a-glance comparison table', ...base, 'Methodology', 'Verdict & recommendation', 'FAQ'];
  if (pageType === 'commercial') return ['Quick picks', 'Selection criteria', 'Detailed reviews', 'Comparison table', 'How we evaluated', 'FAQ'];
  if (pageType === 'pillar') return ['Introduction & who this is for', 'Core concepts', ...base, 'Cluster navigation (links to spokes)', 'Next steps', 'FAQ'];
  return ['Introduction (answer-first)', ...base, 'Key takeaways', 'Related resources (internal links)', 'FAQ'];
}

export function buildBriefs(pages: PlannedPage[], intake: IntakeResult): Brief[] {
  const targetReader = intake.audienceAssumptions[0] ?? `${intake.interpretedNiche} searchers`;
  return pages.map((p) => {
    const serpSummary = p.topCompetingUrls.length
      ? `Top competing URLs: ${p.topCompetingUrls.slice(0, 3).join(', ')}. SERP features: ${p.serpFeatureSummary}.`
      : 'SERP competitor data: LIVE_DATA_REQUIRED (run with Ahrefs/DataForSEO). Plan against the page type and search intent for now.';
    const differentiation =
      p.cannibalizationStatus === 'differentiated'
        ? `Differentiated angle required. ${p.uniquePageIntent}`
        : `Own a distinct angle: ${p.uniquePageIntent}`;
    const brief: Brief = {
      pageId: p.pageId,
      primaryKeyword: p.primaryKeyword,
      secondaryKeywords: p.secondaryKeywords,
      parentTopic: p.parentTopic,
      searchIntent: p.searchIntent,
      pagePurpose: `${titleCase(p.pageType)} that captures "${p.primaryKeyword}" (${p.funnelStage}/${p.searchIntent}) and strengthens the ${p.cluster} cluster.`,
      category: p.topCategory,
      subcategory: p.subcategory,
      cluster: p.cluster,
      pageType: p.pageType,
      targetReader,
      suggestedTitle: p.recommendedTitle,
      suggestedH1: p.recommendedH1,
      suggestedUrl: p.urlPath,
      recommendedContentFormat: p.recommendedContentFormat,
      serpCompetitorSummary: serpSummary,
      differentiationAngle: differentiation,
      mustAnswerQuestions: mustAnswer(p.pageType, p.primaryKeyword),
      suggestedSections: sections(p.pageType, p.primaryKeyword),
      internalLinksToInclude: p.internalLinksOut.slice(0, 8).map((l) => ({ anchor: l.anchor, target: l.targetUrlPath })),
      externalSourceSuggestions: p.externalSourcePlan.sourceTypes,
      evidenceNotes: p.externalSourcePlan.integrityNote,
      uniquePageIntent: p.uniquePageIntent,
      cannibalizationCleanConfirmed: p.cannibalizationStatus !== 'merged' && p.cannibalizationStatus !== 'removed',
      publishingPhase: p.publishingPhase,
      marketingAngle: String((p.frontmatter as Record<string, unknown>).marketingAngle ?? ''),
      briefFilepath: `src/content/briefs/${p.slug}.md`,
    };
    return brief;
  });
}
