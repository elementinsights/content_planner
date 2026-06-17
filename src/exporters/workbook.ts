/**
 * Workbook builder. Defines every required tab (headers, rows, immutable id
 * column, protected human-edited columns). Reused by the CSV, JSON, and Google
 * Sheets exporters so all three stay in lockstep.
 */
import type { PlanResult, PlannedPage, MarketingPlanItem, Brief } from '../core/types.ts';

export interface WorkbookTab {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  idColumn?: string;
  protectedColumns?: string[];
}

const J = (a: unknown[]): string => (a ?? []).join(' | ');

export const PROTECTED_COLUMNS = [
  'Human Review Status',
  'Editor Notes',
  'Approval Status',
  'Manual Priority Override',
  'Manual Category Override',
  'Manual Publish Phase Override',
  'Manual Marketing Notes',
];

export const CONTENT_MAP_HEADERS = [
  'Page ID', 'Primary Keyword', 'Secondary Keywords', 'Parent Topic', 'Top-level Category', 'Subcategory',
  'Cluster', 'Subcluster', 'Page Type', 'Role', 'Search Intent', 'Funnel Stage', 'Business Value',
  'Rec Min Volume Threshold', 'Volume Threshold Decision', 'Search Volume', 'Global Volume', 'Traffic Potential',
  'Volume/TP Ratio', 'CPC', 'Clicks', 'Rec KD Range', 'No-Backlink Opportunity', 'Keyword Difficulty',
  'SERP Weakness', 'SERP Feature Summary', 'Top Competing URLs', 'Competing Page Type', 'Backlink Dependency',
  'Competitor Referring Domains', 'Competitor Domain Strength', 'Rec Content Format', 'Rec Title', 'Rec H1',
  'Slug', 'URL Path', 'Astro Route', 'Astro Collection', 'Markdown Filename', 'Frontmatter Fields', 'Category',
  'Tags', 'Internal Links In', 'Internal Links Out', 'Anchor Text', 'External Source Plan', 'Freshness',
  'Unique Page Intent', 'Cannibalization Status', 'Conflict Resolution', 'Priority Score', 'Publishing Phase',
  'Content Marketing Priority', 'Promotion Channels',
  ...PROTECTED_COLUMNS,
  'Sheet Row Status', 'Notes', 'Data Flags',
];

function contentMapRow(p: PlannedPage): Record<string, unknown> {
  return {
    'Page ID': p.pageId,
    'Primary Keyword': p.primaryKeyword,
    'Secondary Keywords': J(p.secondaryKeywords),
    'Parent Topic': p.parentTopic ?? '',
    'Top-level Category': p.topCategory,
    Subcategory: p.subcategory,
    Cluster: p.cluster,
    Subcluster: p.subcluster,
    'Page Type': p.pageType,
    Role: p.role,
    'Search Intent': p.searchIntent,
    'Funnel Stage': p.funnelStage,
    'Business Value': p.businessValue,
    'Rec Min Volume Threshold': p.recommendedMinVolumeThreshold,
    'Volume Threshold Decision': p.volumeThresholdDecision,
    'Search Volume': p.searchVolume ?? '',
    'Global Volume': p.globalVolume ?? '',
    'Traffic Potential': p.trafficPotential ?? '',
    'Volume/TP Ratio': p.volumeToTpRatio ?? '',
    CPC: p.cpc ?? '',
    Clicks: p.clicks ?? '',
    'Rec KD Range': `${p.recommendedKdRange[0]}-${p.recommendedKdRange[1]}`,
    'No-Backlink Opportunity': p.noBacklinkOpportunityScore,
    'Keyword Difficulty': p.keywordDifficulty ?? '',
    'SERP Weakness': p.serpWeaknessScore,
    'SERP Feature Summary': p.serpFeatureSummary,
    'Top Competing URLs': J(p.topCompetingUrls),
    'Competing Page Type': p.competingPageType,
    'Backlink Dependency': p.backlinkDependencyScore,
    'Competitor Referring Domains': p.competitorReferringDomains ?? '',
    'Competitor Domain Strength': p.competitorDomainStrength ?? '',
    'Rec Content Format': p.recommendedContentFormat,
    'Rec Title': p.recommendedTitle,
    'Rec H1': p.recommendedH1,
    Slug: p.slug,
    'URL Path': p.urlPath,
    'Astro Route': p.astroRoute,
    'Astro Collection': p.astroCollection,
    'Markdown Filename': p.markdownFilename,
    'Frontmatter Fields': JSON.stringify(p.frontmatter),
    Category: p.category,
    Tags: J(p.tags),
    'Internal Links In': J(p.internalLinksIn.map((l) => `${l.targetUrlPath} (${l.linkType})`)),
    'Internal Links Out': J(p.internalLinksOut.map((l) => `${l.anchor} -> ${l.targetUrlPath} (${l.linkType}/${l.priority})`)),
    'Anchor Text': J(p.anchorText),
    'External Source Plan': p.externalSourcePlan.sourceTypes.join('; '),
    Freshness: p.freshnessRequirement,
    'Unique Page Intent': p.uniquePageIntent,
    'Cannibalization Status': p.cannibalizationStatus,
    'Conflict Resolution': p.conflictResolution ?? '',
    'Priority Score': p.priorityScore,
    'Publishing Phase': p.publishingPhase,
    'Content Marketing Priority': Number(p.contentMarketingPriority.toFixed(3)),
    'Promotion Channels': J(p.promotionChannels),
    'Human Review Status': p.humanReviewStatus,
    'Editor Notes': '',
    'Approval Status': '',
    'Manual Priority Override': '',
    'Manual Category Override': '',
    'Manual Publish Phase Override': '',
    'Manual Marketing Notes': '',
    'Sheet Row Status': p.sheetRowStatus,
    Notes: p.notes,
    'Data Flags': J(p.dataFlags),
  };
}

export function buildWorkbook(plan: PlanResult): WorkbookTab[] {
  const pages = plan.pages;
  const briefById = new Map(plan.briefs.map((b) => [b.pageId, b]));
  const mktById = new Map(plan.marketing.map((m) => [m.pageId, m]));

  const tabs: WorkbookTab[] = [];

  // Dashboard ----------------------------------------------------------------
  tabs.push({
    name: 'Dashboard',
    headers: ['Metric', 'Value'],
    rows: [
      ['Interpreted Niche', plan.intake.interpretedNiche],
      ['Starting Wedge', plan.intake.startingWedge],
      ['Live Data Mode', plan.liveDataMode ? 'LIVE' : 'STRUCTURAL (metrics null, flagged LIVE_DATA_REQUIRED)'],
      ['Cannibalization-Clean', plan.cannibalizationClean ? 'YES ✅' : 'NO ⚠️'],
      ['Recommended Total Pages', plan.articleCount.recommendedTotal],
      ['Tier', plan.articleCount.tier],
      ['Pages In Plan', pages.length],
      ['First Publishing Wave', plan.articleCount.firstWaveSize],
      ['Categories', plan.taxonomy.categories.length],
      ['Clusters', plan.clusters.length],
      ['Pillars', pages.filter((p) => p.role === 'pillar').length],
      ['Category Hubs', pages.filter((p) => p.pageType === 'category-hub').length],
      ['Generated At', plan.generatedAtIso],
      ['Run ID', plan.runId],
    ].map(([Metric, Value]) => ({ Metric, Value })),
  });

  // Content Map --------------------------------------------------------------
  tabs.push({
    name: 'Content Map',
    headers: CONTENT_MAP_HEADERS,
    idColumn: 'Page ID',
    protectedColumns: PROTECTED_COLUMNS,
    rows: pages.map(contentMapRow),
  });

  // Page Candidates ----------------------------------------------------------
  tabs.push({
    name: 'Page Candidates',
    headers: ['Page ID', 'Primary Keyword', 'Page Type', 'Role', 'Cluster', 'Phase', 'Priority', 'Cannibalization Status'],
    idColumn: 'Page ID',
    rows: pages.map((p) => ({
      'Page ID': p.pageId, 'Primary Keyword': p.primaryKeyword, 'Page Type': p.pageType, Role: p.role,
      Cluster: p.cluster, Phase: p.publishingPhase, Priority: p.priorityScore, 'Cannibalization Status': p.cannibalizationStatus,
    })),
  });

  // Keyword Metrics ----------------------------------------------------------
  tabs.push({
    name: 'Keyword Metrics',
    headers: ['Page ID', 'Primary Keyword', 'Search Volume', 'Global Volume', 'Traffic Potential', 'CPC', 'Clicks', 'Keyword Difficulty', 'Parent Topic', 'Source', 'Live Data'],
    idColumn: 'Page ID',
    rows: pages.map((p) => ({
      'Page ID': p.pageId, 'Primary Keyword': p.primaryKeyword, 'Search Volume': p.searchVolume ?? 'LIVE_DATA_REQUIRED',
      'Global Volume': p.globalVolume ?? 'LIVE_DATA_REQUIRED', 'Traffic Potential': p.trafficPotential ?? 'LIVE_DATA_REQUIRED',
      CPC: p.cpc ?? 'LIVE_DATA_REQUIRED', Clicks: p.clicks ?? 'LIVE_DATA_REQUIRED', 'Keyword Difficulty': p.keywordDifficulty ?? 'LIVE_DATA_REQUIRED',
      'Parent Topic': p.parentTopic ?? '', Source: p.frontmatter ? (p.liveData ? 'live' : 'none') : 'none', 'Live Data': p.liveData,
    })),
  });

  // Search Volume Thresholds -------------------------------------------------
  tabs.push({
    name: 'Search Volume Thresholds',
    headers: ['Page ID', 'Primary Keyword', 'Page Type', 'Phase', 'Rec Min Volume Threshold', 'Decision'],
    idColumn: 'Page ID',
    rows: pages.map((p) => ({
      'Page ID': p.pageId, 'Primary Keyword': p.primaryKeyword, 'Page Type': p.pageType, Phase: p.publishingPhase,
      'Rec Min Volume Threshold': p.recommendedMinVolumeThreshold, Decision: p.volumeThresholdDecision,
    })),
  });

  // Clusters -----------------------------------------------------------------
  tabs.push({
    name: 'Clusters',
    headers: ['Cluster ID', 'Cluster', 'Category', 'Members', 'Completeness', 'Hub Keyword'],
    rows: plan.clusters.map((c) => ({
      'Cluster ID': c.id, Cluster: c.name, Category: c.category, Members: c.memberKeywords.length,
      Completeness: Number(c.completeness.toFixed(2)), 'Hub Keyword': c.hubKeyword ?? '',
    })),
  });

  // Categories ---------------------------------------------------------------
  tabs.push({
    name: 'Categories',
    headers: ['Name', 'Slug', 'Primary Intent', 'Subcategories', 'Rationale'],
    rows: plan.taxonomy.categories.map((c) => ({
      Name: c.name, Slug: c.slug, 'Primary Intent': c.primaryIntent,
      Subcategories: J(c.subcategories.map((s) => s.name)), Rationale: c.rationale,
    })),
  });

  // Internal Links -----------------------------------------------------------
  const linkRows: Record<string, unknown>[] = [];
  for (const p of pages) {
    for (const l of p.internalLinksOut) {
      linkRows.push({
        'From Page ID': p.pageId, 'From URL': p.urlPath, 'To Page ID': l.targetPageId, 'To URL': l.targetUrlPath,
        'To Astro Route': l.targetAstroRoute, Anchor: l.anchor, Type: l.linkType, Priority: l.priority,
      });
    }
  }
  tabs.push({
    name: 'Internal Links',
    headers: ['From Page ID', 'From URL', 'To Page ID', 'To URL', 'To Astro Route', 'Anchor', 'Type', 'Priority'],
    rows: linkRows,
  });

  // External Sources ---------------------------------------------------------
  tabs.push({
    name: 'External Sources',
    headers: ['Page ID', 'Primary Keyword', 'Source Types', 'Suggested Source Categories', 'Citation Purpose', 'Placement', 'Freshness', 'Primary-Source Pref', 'Sources To Avoid', 'Competitor Citation Note', 'Integrity Note'],
    idColumn: 'Page ID',
    rows: pages.map((p) => ({
      'Page ID': p.pageId, 'Primary Keyword': p.primaryKeyword, 'Source Types': J(p.externalSourcePlan.sourceTypes),
      'Suggested Source Categories': J(p.externalSourcePlan.suggestedDomains), 'Citation Purpose': p.externalSourcePlan.citationPurpose,
      Placement: p.externalSourcePlan.placement, Freshness: p.externalSourcePlan.freshnessRequirement,
      'Primary-Source Pref': p.externalSourcePlan.primarySourcePreference, 'Sources To Avoid': J(p.externalSourcePlan.sourcesToAvoid),
      'Competitor Citation Note': p.externalSourcePlan.competitorCitationNote, 'Integrity Note': p.externalSourcePlan.integrityNote,
    })),
  });

  // Briefs -------------------------------------------------------------------
  tabs.push({
    name: 'Briefs',
    headers: ['Page ID', 'Primary Keyword', 'Title', 'H1', 'URL', 'Intent', 'Page Type', 'Must-Answer Questions', 'Suggested Sections', 'Differentiation Angle', 'Phase', 'Brief Filepath'],
    idColumn: 'Page ID',
    rows: pages.map((p) => {
      const b = briefById.get(p.pageId) as Brief;
      return {
        'Page ID': p.pageId, 'Primary Keyword': p.primaryKeyword, Title: b.suggestedTitle, H1: b.suggestedH1, URL: b.suggestedUrl,
        Intent: b.searchIntent, 'Page Type': b.pageType, 'Must-Answer Questions': J(b.mustAnswerQuestions),
        'Suggested Sections': J(b.suggestedSections), 'Differentiation Angle': b.differentiationAngle, Phase: b.publishingPhase,
        'Brief Filepath': b.briefFilepath,
      };
    }),
  });

  // Content Marketing Plan ---------------------------------------------------
  tabs.push({
    name: 'Content Marketing Plan',
    headers: ['Page ID', 'Primary Keyword', 'Promotion Channels', 'Social Angles', 'Newsletter Angle', 'Community Angle', 'Repurposing', 'Visual Assets', 'Tool/Template Ideas', 'Outreach/Digital PR', 'Refresh Schedule', 'Measurement', 'Priority'],
    idColumn: 'Page ID',
    rows: pages.map((p) => {
      const m = mktById.get(p.pageId) as MarketingPlanItem;
      return {
        'Page ID': p.pageId, 'Primary Keyword': p.primaryKeyword, 'Promotion Channels': J(m.promotionChannels),
        'Social Angles': J(m.socialPostAngles), 'Newsletter Angle': m.newsletterAngle ?? '', 'Community Angle': m.communityAngle ?? '',
        Repurposing: J(m.repurposing), 'Visual Assets': J(m.visualAssetIdeas), 'Tool/Template Ideas': J(m.toolTemplateIdeas),
        'Outreach/Digital PR': J(m.outreachDigitalPrIdeas), 'Refresh Schedule': m.refreshSchedule, Measurement: J(m.measurementPlan),
        Priority: Number(m.priority.toFixed(3)),
      };
    }),
  });

  // Publishing Roadmap -------------------------------------------------------
  tabs.push({
    name: 'Publishing Roadmap',
    headers: ['Phase', 'Label', 'KD Range', 'Selective Exception Up To', 'Pages', 'Notes'],
    rows: plan.kdByPhase.phases.map((ph) => ({
      Phase: ph.phase, Label: ph.label, 'KD Range': `${ph.kdRange[0]}-${ph.kdRange[1]}`, 'Selective Exception Up To': ph.selectiveExceptionUpTo,
      Pages: ph.pageCount, Notes: ph.phase === 1 ? `First wave ~${plan.articleCount.firstWaveSize} pages: weakest-SERP, lowest-backlink-dependency wins.` : ph.rationale,
    })),
  });

  // Cannibalization Clean Report --------------------------------------------
  const cr = plan.cannibalizationReport;
  tabs.push({
    name: 'Cannibalization Clean Report',
    headers: ['Field', 'Value'],
    rows: [
      ['STATUS', plan.cannibalizationClean ? 'CANNIBALIZATION-CLEAN ✅' : 'NOT CLEAN ⚠️'],
      ['Total Candidates', cr.totalCandidates],
      ['Conflicts Detected', cr.conflictsDetected],
      ['Hard Conflicts (resolved)', cr.hardConflicts],
      ['Soft Conflicts (differentiated)', cr.softConflicts],
      ['Final Clean Pages', cr.finalPages],
    ].map(([Field, Value]) => ({ Field, Value })),
  });
  // append a few resolution examples as extra rows in a companion tab
  tabs.push({
    name: 'Cannibalization Resolutions',
    headers: ['Page ID', 'Against', 'Severity', 'Reason', 'Resolution'],
    rows: cr.resolutions.slice(0, 500).map((r) => ({ 'Page ID': r.pageId, Against: r.against, Severity: r.severity, Reason: r.reason, Resolution: r.resolution })),
  });

  // Article Count Recommendation --------------------------------------------
  const ac = plan.articleCount;
  tabs.push({
    name: 'Article Count Recommendation',
    headers: ['Field', 'Value'],
    rows: [
      ['Recommended Total', ac.recommendedTotal],
      ['Tier', ac.tier],
      ['Minimum Floor', ac.minArticles],
      ['First Wave', ac.firstWaveSize],
      ['Live Data Mode', ac.liveDataMode],
      ['Why Not Fewer', ac.whyNotFewer],
      ['Why Not More', ac.whyNotMore],
      ...ac.rationale.map((r, i) => [`Rationale ${i + 1}`, r] as [string, string]),
      ...Object.entries(ac.signals).map(([k, v]) => [`Signal: ${k}`, v] as [string, number]),
      ...Object.entries(ac.pageTypeBreakdown).map(([k, v]) => [`Recommended ${k}`, v] as [string, number]),
    ].map(([Field, Value]) => ({ Field, Value })),
  });

  // Keyword Difficulty By Phase ---------------------------------------------
  tabs.push({
    name: 'Keyword Difficulty By Phase',
    headers: ['Phase', 'Label', 'KD Range', 'Selective Exception Up To', 'Pages', 'Rationale'],
    rows: plan.kdByPhase.phases.map((ph) => ({
      Phase: ph.phase, Label: ph.label, 'KD Range': `${ph.kdRange[0]}-${ph.kdRange[1]}`,
      'Selective Exception Up To': ph.selectiveExceptionUpTo, Pages: ph.pageCount, Rationale: ph.rationale,
    })),
  });

  // Post-Launch Performance (awaiting GSC/GA4) ------------------------------
  tabs.push({
    name: 'Post-Launch Performance',
    headers: ['Page ID', 'URL', 'Query', 'Clicks', 'Impressions', 'CTR', 'Avg Position', 'Sessions', 'Conversions', 'Status', 'Next Action'],
    idColumn: 'Page ID',
    rows: pages.slice(0, 50).map((p) => ({
      'Page ID': p.pageId, URL: p.urlPath, Query: p.primaryKeyword, Clicks: '', Impressions: '', CTR: '', 'Avg Position': '',
      Sessions: '', Conversions: '', Status: 'AWAITING_GSC_GA4 (post-launch)', 'Next Action': 'Populate after indexing via GSC/GA4 feedback loop',
    })),
  });

  // Settings -----------------------------------------------------------------
  tabs.push({
    name: 'Settings',
    headers: ['Setting', 'Value'],
    rows: [
      ['Niche', plan.intake.interpretedNiche],
      ['Geo', plan.intake.geo],
      ['Language', plan.intake.language],
      ['Live Data Mode', plan.liveDataMode],
      ['Intake Source', plan.intake.source],
      ['Competitor Domains', J(plan.intake.competitorDomains)],
      ['Excluded Topics', J(plan.intake.excludedTopics)],
      ['Provider Calls', plan.cost.providerCalls],
      ['LLM Calls', plan.cost.llmCalls],
      ['Estimated USD', plan.cost.estimatedUsd],
    ].map(([Setting, Value]) => ({ Setting, Value })),
  });

  // Sync Log + Error Log (populated by the sync step) -----------------------
  tabs.push({ name: 'Sync Log', headers: ['Timestamp', 'Action', 'Tab', 'Rows', 'Status', 'Message'], rows: [] });
  tabs.push({ name: 'Error Log', headers: ['Timestamp', 'Scope', 'Message'], rows: [] });

  return tabs;
}

export const REQUIRED_TABS = [
  'Dashboard', 'Content Map', 'Page Candidates', 'Keyword Metrics', 'Search Volume Thresholds', 'Clusters',
  'Categories', 'Internal Links', 'External Sources', 'Briefs', 'Content Marketing Plan', 'Publishing Roadmap',
  'Cannibalization Clean Report', 'Article Count Recommendation', 'Keyword Difficulty By Phase',
  'Post-Launch Performance', 'Settings', 'Sync Log', 'Error Log',
];
