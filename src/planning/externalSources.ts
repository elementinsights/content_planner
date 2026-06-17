/**
 * External-source / citation planner. Recommends source TYPES and authoritative
 * source CATEGORIES (never fabricated specific URLs), the citation purpose,
 * placement, freshness, primary-source preference, what to avoid, and explicit
 * integrity guardrails (no fake citations; don't pass authority to competitors).
 */
import type { ExternalSourcePlan, PageType, SearchIntent } from '../core/types.ts';
import { AUTHORITATIVE_SOURCE_CATEGORIES, SOURCES_TO_AVOID } from '../config/defaults.ts';
import { FRESHNESS } from '../config/defaults.ts';

export function planExternalSources(opts: {
  pageType: PageType;
  intent: SearchIntent;
  isYmyl: boolean;
  primaryKeyword: string;
}): ExternalSourcePlan {
  const { pageType, intent, isYmyl } = opts;
  const sourceTypes: string[] = [];
  let placement = 'Throughout, where a claim needs evidence; and a "Sources" list at the end.';
  let purpose = 'Substantiate factual claims and statistics; build E-E-A-T and reader trust.';

  switch (pageType) {
    case 'glossary':
      sourceTypes.push('Authoritative definitions', 'Official documentation / standards');
      purpose = 'Anchor the definition to a primary/official source.';
      placement = 'Definition line + a "Reference" link.';
      break;
    case 'comparison':
    case 'commercial':
      sourceTypes.push('Official product/pricing/docs pages (primary)', 'First-party testing/usage notes', 'Reputable independent benchmarks');
      purpose = 'Verify features, pricing, and capabilities from primary sources; disclose testing methodology.';
      placement = 'Comparison table footnotes + methodology section.';
      break;
    case 'tool':
    case 'template':
    case 'checklist':
      sourceTypes.push('Official specs/standards underpinning the tool logic', 'Original methodology notes');
      purpose = 'Document the formula/criteria so the asset is trustworthy and linkable.';
      placement = '"How this works / methodology" section.';
      break;
    case 'case-study':
      sourceTypes.push('First-party data you collected', 'Verifiable public data');
      purpose = 'Show original, verifiable evidence — the strongest linkable proof.';
      placement = 'Inline with each result + a data/methodology appendix.';
      break;
    default:
      sourceTypes.push('Recognized research / original data studies', 'Official documentation', 'Reputable trade publications');
  }

  if (isYmyl) {
    sourceTypes.unshift('Government/regulatory (.gov) and peer-reviewed primary sources (REQUIRED for YMYL)');
    purpose = 'YMYL: every material claim must cite a primary, authoritative, current source; add expert review.';
  }

  return {
    sourceTypes,
    suggestedDomains: AUTHORITATIVE_SOURCE_CATEGORIES,
    citationPurpose: purpose,
    placement,
    freshnessRequirement: FRESHNESS[pageType],
    primarySourcePreference: true,
    sourcesToAvoid: SOURCES_TO_AVOID,
    competitorCitationNote:
      intent === 'commercial'
        ? 'Cite competitors only for verifiable facts (e.g., official pricing). Do NOT pass link authority to a page you are trying to outrank; prefer the vendor primary source.'
        : 'Avoid citing direct competitors; prefer primary/official sources instead.',
    integrityNote:
      'NEVER fabricate citations, statistics, authors, or entities. If a claim cannot be sourced to a real, current, authoritative reference, soften or remove it.',
  };
}
