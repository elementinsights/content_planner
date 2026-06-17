/**
 * Deterministic marketing/promotion planner. Maps a planned page to concrete,
 * non-spammy promotion: channels, angles, repurposing, assets, refresh cadence,
 * and measurement. Avoids artificial link schemes and mass outreach.
 */
import type { MarketingPlanningProvider } from '../interfaces.ts';
import type { PlannedPage, MarketingPlanItem, PageType } from '../../core/types.ts';

const CHANNELS_BY_TYPE: Record<PageType, string[]> = {
  pillar: ['Newsletter feature', 'LinkedIn/X thread series', 'YouTube/Short explainer', 'Community AMA where relevant'],
  'category-hub': ['Newsletter section', 'Pinterest/visual board', 'Internal-link campaign from new spokes'],
  'sub-hub': ['Newsletter mention', 'Internal-link campaign'],
  spoke: ['Niche community answer (genuinely helpful)', 'Short social tip', 'Newsletter tip'],
  'longtail-question': ['Quora/Reddit genuine answer linking when allowed', 'FAQ snippet repurpose'],
  glossary: ['Internal links from spokes', 'Social "term of the week"'],
  faq: ['FAQ schema for rich results', 'Repurpose Q&A into social carousel'],
  comparison: ['Buyer-intent newsletter', 'Comparison carousel', 'Partner/vendor co-marketing (no paid links)'],
  commercial: ['Buyer-intent newsletter segment', 'Retargeting-friendly landing', 'Lead magnet pairing'],
  tool: ['Product Hunt / niche tool directories', 'Embeddable widget for backlinks', 'Digital PR around the tool'],
  template: ['Gated download for email capture', 'Template galleries', 'Social "steal this template"'],
  checklist: ['Lead-magnet download', 'Carousel repurpose', 'Community share'],
  'case-study': ['Original-data digital PR', 'LinkedIn long-form', 'Newsletter deep-dive'],
  support: ['Internal links only (low promo priority)'],
};

const VISUALS_BY_TYPE: Partial<Record<PageType, string[]>> = {
  pillar: ['Hero diagram / framework', 'Summary infographic', 'Decision flowchart'],
  comparison: ['Side-by-side comparison table image', 'Scorecard graphic'],
  'case-study': ['Before/after charts', 'Results graphic'],
  tool: ['Tool screenshot/GIF', 'Embeddable badge'],
  template: ['Template preview image'],
  checklist: ['Checklist graphic'],
};

export class MarketingProvider implements MarketingPlanningProvider {
  readonly name = 'deterministic-marketing';

  planForPage(page: PlannedPage): MarketingPlanItem {
    const linkable = ['tool', 'template', 'checklist', 'case-study', 'comparison', 'pillar'].includes(page.pageType);
    const channels = CHANNELS_BY_TYPE[page.pageType] ?? ['Newsletter', 'Social'];
    const social = [
      `Lead with the #1 takeaway from "${page.recommendedTitle}"`,
      page.searchIntent === 'commercial'
        ? `"How to choose" angle for ${page.primaryKeyword}`
        : `Myth-vs-fact or "most people get ${page.primaryKeyword} wrong" angle`,
    ];
    return {
      pageId: page.pageId,
      primaryKeyword: page.primaryKeyword,
      promotionChannels: channels,
      socialPostAngles: social,
      newsletterAngle:
        page.role === 'pillar' || page.role === 'hub'
          ? `Anchor a newsletter issue around the ${page.cluster} cluster, linking ${page.recommendedTitle}`
          : page.contentMarketingPriority > 0.5
            ? `Quick-win tip drawn from ${page.recommendedTitle}`
            : null,
      communityAngle:
        page.funnelStage === 'TOFU' || page.pageType === 'longtail-question'
          ? `Answer real questions in relevant communities; link only when it genuinely helps`
          : null,
      repurposing: [
        'Social carousel of key points',
        page.pageType === 'pillar' ? 'Split into a multi-part email course' : 'Short-form video script',
        'Quote/stat graphics',
      ],
      visualAssetIdeas: VISUALS_BY_TYPE[page.pageType] ?? ['Custom header graphic'],
      toolTemplateIdeas: linkable
        ? [`Companion ${page.pageType === 'tool' ? 'calculator' : 'template/checklist'} for ${page.primaryKeyword}`]
        : ['Optional downloadable summary'],
      outreachDigitalPrIdeas: linkable
        ? ['Pitch original data/asset to relevant publications (value-first, no link buying)']
        : ['No active outreach — earn links via internal assets + quality'],
      internalLinkDeploymentSteps: [
        `Add contextual links from sibling ${page.cluster} pages to this page on publish`,
        page.role === 'spoke' ? 'Ensure the cluster hub links down to this spoke' : 'Link this hub down to its spokes',
        'Re-link from new pages as the cluster grows',
      ],
      refreshSchedule: page.freshnessRequirement,
      measurementPlan: [
        'Track impressions/clicks/position in GSC after indexing (post-launch loop)',
        'Watch internal-link CTR and assisted conversions in GA4',
        page.searchIntent === 'commercial' ? 'Track affiliate/lead conversions' : 'Track scroll depth + email signups',
      ],
      priority: page.contentMarketingPriority,
    };
  }
}
