/**
 * Provider abstractions. Every external capability is behind an interface so the
 * pipeline is provider-agnostic and degrades gracefully to structural mode.
 */
import type {
  KeywordMetrics,
  SerpData,
  IntakeResult,
  PlanInput,
  MarketingPlanItem,
  PlannedPage,
} from '../core/types.ts';

export interface GeoLang {
  geo: string;
  language: string;
}

export interface KeywordIdea {
  keyword: string;
  metrics: KeywordMetrics;
}

export interface CompetitorPage {
  url: string;
  estimatedTraffic: number | null;
  topKeyword: string | null;
  referringDomains: number | null;
  pageType: string | null;
}

/** Primary SEO intelligence (Ahrefs preferred; DataForSEO/Semrush secondary). */
export interface SEODataProvider {
  readonly name: string;
  readonly available: boolean;
  /** Enrich a batch of keywords with metrics (volume, KD, TP, parent topic...). */
  getKeywordMetrics(keywords: string[], opts: GeoLang): Promise<Map<string, KeywordMetrics>>;
  /** Expand seeds into keyword ideas with metrics. */
  getKeywordIdeas(seeds: string[], opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]>;
  /** Competitor top pages (for gap analysis). */
  getCompetitorTopPages?(domain: string, opts: GeoLang & { limit?: number }): Promise<CompetitorPage[]>;
  /** Competitor organic keywords (for gap analysis). */
  getCompetitorOrganicKeywords?(domain: string, opts: GeoLang & { limit?: number }): Promise<KeywordIdea[]>;
  /** Referring domains for a competing URL (backlink dependency input). */
  getReferringDomains?(url: string): Promise<number | null>;
}

/** SERP retrieval + overview (Ahrefs SERP overview or DataForSEO SERP API). */
export interface SERPProvider {
  readonly name: string;
  readonly available: boolean;
  getSerp(keyword: string, opts: GeoLang): Promise<SerpData>;
}

export interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Post-launch only. */
export interface SearchConsoleProvider {
  readonly name: string;
  readonly available: boolean;
  getPerformance(siteUrl: string, opts: { startDate: string; endDate: string }): Promise<GscRow[]>;
}

export interface Ga4Row {
  pagePath: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
}

/** Post-launch only. */
export interface AnalyticsProvider {
  readonly name: string;
  readonly available: boolean;
  getPageMetrics(opts: { startDate: string; endDate: string }): Promise<Ga4Row[]>;
}

export interface UpsertResult {
  written: number;
  skipped: number;
  preserved: number;
}

/** Google Sheets editorial layer. */
export interface SpreadsheetProvider {
  readonly name: string;
  readonly available: boolean;
  readonly dryRun: boolean;
  ensureSpreadsheet(title: string): Promise<string>;
  ensureTabs(spreadsheetId: string, tabs: string[]): Promise<void>;
  writeHeaders(spreadsheetId: string, tab: string, headers: string[]): Promise<void>;
  /** Upsert rows keyed by an immutable id column; preserves protected columns. */
  upsertRows(
    spreadsheetId: string,
    tab: string,
    idColumn: string,
    headers: string[],
    rows: Record<string, unknown>[],
    protectedColumns: string[],
  ): Promise<UpsertResult>;
  readTab(spreadsheetId: string, tab: string): Promise<string[][]>;
}

/** Astro static-site export (manifest + frontmatter; never publishes). */
export interface StaticSiteExporter {
  readonly name: string;
  exportManifest(outDir: string, pages: PlannedPage[]): Promise<{ files: string[] }>;
}

/** LLM intake/discovery. */
export interface LLMIntakeProvider {
  readonly name: string;
  readonly provider: 'deterministic' | 'anthropic' | 'openai';
  interpret(input: PlanInput): Promise<IntakeResult>;
}

/** Marketing/promotion planning. */
export interface MarketingPlanningProvider {
  readonly name: string;
  planForPage(page: PlannedPage): MarketingPlanItem;
}
