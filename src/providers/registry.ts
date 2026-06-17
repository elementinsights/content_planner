/**
 * Provider registry. Resolves concrete adapters from configuration. Everything
 * degrades gracefully: with no SEO keys we use null providers (structural mode);
 * with no Google creds we use the dry-run Sheets provider.
 */
import type {
  SEODataProvider,
  SERPProvider,
  SpreadsheetProvider,
  SearchConsoleProvider,
  AnalyticsProvider,
  LLMIntakeProvider,
  MarketingPlanningProvider,
} from './interfaces.ts';
import type { AppConfig } from '../config/env.ts';
import type { CostController } from '../core/cost.ts';
import { log } from '../core/logger.ts';

import { AhrefsProvider } from './seo/ahrefs.ts';
import { DataForSeoProvider } from './seo/dataforseo.ts';
import { SemrushProvider } from './seo/semrush.ts';
import { NullSeoProvider } from './seo/nullSeo.ts';
import { DataForSeoSerpProvider } from './serp/dataforseoSerp.ts';
import { NullSerpProvider } from './serp/nullSerp.ts';
import { GoogleSheetsProvider } from './spreadsheet/googleSheets.ts';
import { DryRunSheetsProvider } from './spreadsheet/dryRunSheets.ts';
import { GoogleSearchConsoleProvider } from './searchConsole/gsc.ts';
import { GoogleAnalyticsProvider } from './analytics/ga4.ts';
import { DeterministicIntakeProvider } from './llm/deterministicIntake.ts';
import { LlmIntakeProvider } from './llm/llmIntake.ts';
import { MarketingProvider } from './marketing/marketingProvider.ts';
import { resolveServiceAccount } from './google/auth.ts';

export interface Providers {
  /** SEO providers in priority order (Ahrefs first). Always non-empty. */
  seo: SEODataProvider[];
  serp: SERPProvider;
  sheets: SpreadsheetProvider;
  gsc: SearchConsoleProvider;
  ga4: AnalyticsProvider;
  intake: LLMIntakeProvider;
  marketing: MarketingPlanningProvider;
  liveDataMode: boolean;
}

export function buildProviders(cfg: AppConfig, cost: CostController, opts: { forceDryRunSheets?: boolean } = {}): Providers {
  // --- SEO (Ahrefs preferred, DataForSEO secondary, Semrush optional) ---
  const seo: SEODataProvider[] = [];
  if (cfg.providers.ahrefs && cfg.ahrefsApiKey) seo.push(new AhrefsProvider(cfg.ahrefsApiKey, cost));
  if (cfg.providers.dataforseo && cfg.dataforseoLogin && cfg.dataforseoPassword) {
    seo.push(new DataForSeoProvider(cfg.dataforseoLogin, cfg.dataforseoPassword, cost));
  }
  if (cfg.providers.semrush && cfg.semrushApiKey) seo.push(new SemrushProvider(cfg.semrushApiKey, cost));
  if (seo.length === 0) seo.push(new NullSeoProvider());

  // --- SERP (DataForSEO is the SERP layer; null otherwise) ---
  const serp: SERPProvider =
    cfg.providers.dataforseo && cfg.dataforseoLogin && cfg.dataforseoPassword
      ? new DataForSeoSerpProvider(cfg.dataforseoLogin, cfg.dataforseoPassword, cost)
      : new NullSerpProvider();

  // --- Sheets (real if creds + not forced dry-run; else dry-run) ---
  let sheets: SpreadsheetProvider;
  const sa = resolveServiceAccount(cfg.googleSheets);
  if (sa && !opts.forceDryRunSheets) {
    sheets = new GoogleSheetsProvider(sa, cost, cfg.googleSheets.spreadsheetId);
  } else {
    sheets = new DryRunSheetsProvider();
    if (opts.forceDryRunSheets) log.info('Sheets: forced dry-run mode');
  }

  // --- Post-launch providers ---
  const gsc = new GoogleSearchConsoleProvider(process.env.GSC_CREDENTIALS, cost);
  const ga4 = new GoogleAnalyticsProvider(process.env.GA4_PROPERTY_ID, process.env.GSC_CREDENTIALS, cost);

  // --- Intake (deterministic by default) ---
  let intake: LLMIntakeProvider;
  if (cfg.llm.provider === 'anthropic' && cfg.llm.anthropicApiKey) {
    intake = new LlmIntakeProvider('anthropic', cfg.llm.anthropicApiKey, cfg.llm.anthropicModel, cfg, cost);
  } else if (cfg.llm.provider === 'openai' && cfg.llm.openaiApiKey) {
    intake = new LlmIntakeProvider('openai', cfg.llm.openaiApiKey, cfg.llm.openaiModel, cfg, cost);
  } else {
    intake = new DeterministicIntakeProvider(cfg);
  }

  const marketing = new MarketingProvider();

  log.info('providers resolved', {
    seo: seo.map((s) => s.name),
    serp: serp.name,
    sheets: sheets.name,
    intake: intake.name,
    liveDataMode: cfg.liveDataMode,
  });

  return { seo, serp, sheets, gsc, ga4, intake, marketing, liveDataMode: cfg.liveDataMode };
}
