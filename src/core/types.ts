/**
 * Domain model for the SEO planning system.
 * Metric fields are nullable by design: they are populated ONLY from live
 * providers. When a provider is absent, they stay null and `liveData=false`,
 * with 'LIVE_DATA_REQUIRED' added to dataFlags. Metrics are never fabricated.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type SiteType =
  | 'affiliate'
  | 'lead-gen'
  | 'saas-support'
  | 'ads'
  | 'newsletter'
  | 'ecommerce'
  | 'service-business'
  | 'mixed';

export type PageType =
  | 'pillar'
  | 'category-hub'
  | 'sub-hub'
  | 'spoke'
  | 'longtail-question'
  | 'glossary'
  | 'faq'
  | 'comparison'
  | 'commercial'
  | 'tool'
  | 'template'
  | 'checklist'
  | 'case-study'
  | 'support';

export type PageRole = 'pillar' | 'hub' | 'sub-hub' | 'spoke' | 'support';

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export type CannibalizationStatus =
  | 'clean'
  | 'merged'
  | 'kept-secondary'
  | 'differentiated'
  | 'reassigned-cluster'
  | 'retyped'
  | 'removed';

export type ConflictSeverity = 'none' | 'soft' | 'hard';

export type ReviewStatus = 'pending' | 'approved' | 'changes-requested' | 'rejected';

// ---------------------------------------------------------------------------
// Input model (flexible user input)
// ---------------------------------------------------------------------------

export interface PlanInput {
  idea: string;
  seedKeyword?: string;
  broadTopic?: string;
  nicheDescription?: string;
  exampleCompetitor?: string;
  competitors?: string[];
  audience?: string;
  monetization?: string;
  excludedTopics?: string[];
  geo?: string;
  language?: string;
  minArticles?: number;
  maxArticles?: number;
  brandPositioning?: string;
  contentStyle?: string;
  siteType?: SiteType;
}

// ---------------------------------------------------------------------------
// Intake / discovery output
// ---------------------------------------------------------------------------

export interface IntakeResult {
  interpretedNiche: string;
  startingWedge: string;
  recommendedStartingAngle: string;
  audienceAssumptions: string[];
  monetizationAssumptions: string[];
  seedTopics: string[];
  seedKeywords: string[];
  competitorDomains: string[];
  excludedTopics: string[];
  geo: string;
  language: string;
  initialCategories: CategorySeed[];
  initialContentTypes: PageType[];
  contentMarketingAssumptions: string[];
  acquisitionChannels: string[];
  ymylRiskFlags: string[];
  apiResearchPlan: ApiResearchStep[];
  clarifyingQuestions: string[];
  source: 'deterministic' | 'anthropic' | 'openai';
}

export interface CategorySeed {
  name: string;
  slug: string;
  rationale: string;
  intentMix: { informational: number; commercial: number };
  subcategories: string[];
  seedModifiers: string[];
}

export interface ApiResearchStep {
  provider: string;
  endpoint: string;
  purpose: string;
  inputs: string[];
  optional: boolean;
}

// ---------------------------------------------------------------------------
// Keyword + SERP records
// ---------------------------------------------------------------------------

export interface KeywordMetrics {
  searchVolume: number | null;
  globalVolume: number | null;
  trafficPotential: number | null;
  cpc: number | null;
  clicks: number | null;
  keywordDifficulty: number | null;
  parentTopic: string | null;
  trend: number | null; // -1..1 normalized YoY trend if available
  source: string | null;
  liveData: boolean;
}

export function emptyMetrics(): KeywordMetrics {
  return {
    searchVolume: null,
    globalVolume: null,
    trafficPotential: null,
    cpc: null,
    clicks: null,
    keywordDifficulty: null,
    parentTopic: null,
    trend: null,
    source: null,
    liveData: false,
  };
}

export interface SerpResultItem {
  position: number;
  url: string;
  domain: string;
  title: string | null;
  referringDomains: number | null;
  domainRating: number | null;
  pageType: string | null;
  isUgc: boolean; // reddit/quora/forum/youtube etc.
}

export interface SerpData {
  keyword: string;
  results: SerpResultItem[];
  features: string[];
  medianReferringDomains: number | null;
  weakResultsRatio: number | null; // share of top results that are low-authority/UGC
  source: string | null;
  liveData: boolean;
}

export interface KeywordRecord {
  keyword: string;
  normalized: string;
  intent: SearchIntent;
  funnel: FunnelStage;
  modifier: string | null;
  sourceTopic: string;
  category: string;
  metrics: KeywordMetrics;
  serp?: SerpData;
}

// ---------------------------------------------------------------------------
// Scores (all normalized 0..1 unless noted)
// ---------------------------------------------------------------------------

export interface Scores {
  demand: number;
  trafficPotential: number;
  serpWeakness: number;
  backlinkDependency: number;
  noBacklinkOpportunity: number;
  topicalAuthorityFit: number;
  businessValue: number;
  contentMarketing: number;
  promotionPotential: number;
  pillarSuitability: number;
  hubSuitability: number;
  spokeSuitability: number;
  internalLinkImportance: number;
  clusterCompleteness: number;
  freshnessRequirement: number;
  categoryFit: number;
  publishingPhaseScore: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// Taxonomy + clusters
// ---------------------------------------------------------------------------

export interface Subcategory {
  name: string;
  slug: string;
}

export interface Category {
  name: string;
  slug: string;
  rationale: string;
  subcategories: Subcategory[];
  primaryIntent: SearchIntent;
}

export interface Taxonomy {
  categories: Category[];
  urlFolderStructure: string[];
}

export interface Cluster {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  intent: SearchIntent;
  pillarKeyword: string | null;
  hubKeyword: string | null;
  memberKeywords: string[];
  subclusters: Record<string, string[]>;
  completeness: number;
}

// ---------------------------------------------------------------------------
// Internal links + external sources
// ---------------------------------------------------------------------------

export interface InternalLinkRef {
  targetPageId: string;
  targetUrlPath: string;
  targetAstroRoute: string;
  anchor: string;
  linkType:
    | 'pillar->hub'
    | 'hub->pillar'
    | 'hub->spoke'
    | 'spoke->hub'
    | 'spoke->pillar'
    | 'sibling'
    | 'info->commercial'
    | 'commercial->support'
    | 'glossary->support'
    | 'support->hub';
  priority: 'required' | 'recommended' | 'optional';
}

export interface ExternalSourcePlan {
  sourceTypes: string[];
  suggestedDomains: string[];
  citationPurpose: string;
  placement: string;
  freshnessRequirement: string;
  primarySourcePreference: boolean;
  sourcesToAvoid: string[];
  competitorCitationNote: string;
  integrityNote: string;
}

// ---------------------------------------------------------------------------
// The content-map row: every required column lives here
// ---------------------------------------------------------------------------

export interface PlannedPage {
  // identity
  pageId: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  parentTopic: string | null;

  // taxonomy
  topCategory: string;
  subcategory: string;
  cluster: string;
  subcluster: string;

  // typing / role
  pageType: PageType;
  role: PageRole;
  searchIntent: SearchIntent;
  funnelStage: FunnelStage;
  businessValue: number;

  // volume-threshold decision
  recommendedMinVolumeThreshold: number;
  volumeThresholdDecision: string;

  // metrics (nullable — live only)
  searchVolume: number | null;
  globalVolume: number | null;
  trafficPotential: number | null;
  volumeToTpRatio: number | null;
  cpc: number | null;
  clicks: number | null;

  // difficulty / opportunity
  recommendedKdRange: [number, number];
  noBacklinkOpportunityScore: number;
  keywordDifficulty: number | null;
  serpWeaknessScore: number;
  serpFeatureSummary: string;
  topCompetingUrls: string[];
  competingPageType: string;
  backlinkDependencyScore: number;
  competitorReferringDomains: number | null;
  competitorDomainStrength: number | null;

  // content recommendations
  recommendedContentFormat: string;
  recommendedTitle: string;
  recommendedH1: string;

  // astro / url
  slug: string;
  urlPath: string;
  astroRoute: string;
  astroCollection: string;
  markdownFilename: string;
  frontmatter: Record<string, unknown>;
  category: string;
  tags: string[];

  // linking + sources
  internalLinksIn: InternalLinkRef[];
  internalLinksOut: InternalLinkRef[];
  anchorText: string[];
  externalSourcePlan: ExternalSourcePlan;

  // editorial
  freshnessRequirement: string;
  uniquePageIntent: string;

  // cannibalization
  cannibalizationStatus: CannibalizationStatus;
  conflictResolution: string | null;

  // prioritization
  priorityScore: number;
  publishingPhase: number;

  // marketing
  contentMarketingPriority: number;
  promotionChannels: string[];

  // workflow
  humanReviewStatus: ReviewStatus;
  sheetRowStatus: string;
  notes: string;

  // transparency
  scores: Scores;
  liveData: boolean;
  dataFlags: string[];
}

// ---------------------------------------------------------------------------
// Briefs + marketing + reports
// ---------------------------------------------------------------------------

export interface Brief {
  pageId: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  parentTopic: string | null;
  searchIntent: SearchIntent;
  pagePurpose: string;
  category: string;
  subcategory: string;
  cluster: string;
  pageType: PageType;
  targetReader: string;
  suggestedTitle: string;
  suggestedH1: string;
  suggestedUrl: string;
  recommendedContentFormat: string;
  serpCompetitorSummary: string;
  differentiationAngle: string;
  mustAnswerQuestions: string[];
  suggestedSections: string[];
  internalLinksToInclude: { anchor: string; target: string }[];
  externalSourceSuggestions: string[];
  evidenceNotes: string;
  uniquePageIntent: string;
  cannibalizationCleanConfirmed: boolean;
  publishingPhase: number;
  marketingAngle: string;
  briefFilepath: string;
}

export interface MarketingPlanItem {
  pageId: string;
  primaryKeyword: string;
  promotionChannels: string[];
  socialPostAngles: string[];
  newsletterAngle: string | null;
  communityAngle: string | null;
  repurposing: string[];
  visualAssetIdeas: string[];
  toolTemplateIdeas: string[];
  outreachDigitalPrIdeas: string[];
  internalLinkDeploymentSteps: string[];
  refreshSchedule: string;
  measurementPlan: string[];
  priority: number;
}

// ---------------------------------------------------------------------------
// Article-count recommendation
// ---------------------------------------------------------------------------

export interface ArticleCountRecommendation {
  recommendedTotal: number;
  tier: 200 | 300 | 500 | 700 | 1000;
  minArticles: number;
  signals: Record<string, number>;
  rationale: string[];
  whyNotMore: string;
  whyNotFewer: string;
  pageTypeBreakdown: Record<PageType, number>;
  firstWaveSize: number;
  liveDataMode: boolean;
}

// ---------------------------------------------------------------------------
// Full plan bundle
// ---------------------------------------------------------------------------

export interface PlanResult {
  runId: string;
  generatedAtIso: string;
  input: PlanInput;
  intake: IntakeResult;
  taxonomy: Taxonomy;
  clusters: Cluster[];
  articleCount: ArticleCountRecommendation;
  pages: PlannedPage[];
  briefs: Brief[];
  marketing: MarketingPlanItem[];
  cannibalizationReport: CannibalizationReport;
  kdByPhase: KdByPhaseReport;
  volumeThresholdReport: VolumeThresholdReport;
  cost: { providerCalls: number; llmCalls: number; estimatedUsd: number };
  liveDataMode: boolean;
  cannibalizationClean: boolean;
}

export interface CannibalizationReport {
  totalCandidates: number;
  conflictsDetected: number;
  hardConflicts: number;
  softConflicts: number;
  resolutions: {
    pageId: string;
    against: string;
    severity: ConflictSeverity;
    reason: string;
    resolution: string;
  }[];
  finalPages: number;
  clean: boolean;
}

export interface KdByPhaseReport {
  phases: {
    phase: number;
    label: string;
    kdRange: [number, number];
    selectiveExceptionUpTo: number;
    rationale: string;
    pageCount: number;
  }[];
}

export interface VolumeThresholdReport {
  note: string;
  byPageType: Record<string, number>;
  byPhase: Record<string, number>;
  lowVolumeAllowanceReasons: string[];
}
