/**
 * Environment configuration loader. Reads .env (via Node's built-in loader) and
 * derives provider availability + cost limits. No secrets are logged.
 */
import { log } from '../core/logger.ts';
import type { CostLimits } from '../core/cost.ts';

function loadDotEnv(): void {
  try {
    // Node >=20.12 built-in; no dependency required.
    (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env');
  } catch {
    // .env is optional; ignore if missing.
  }
}

export interface ProviderAvailability {
  ahrefs: boolean;
  dataforseo: boolean;
  semrush: boolean;
  googleSheets: boolean;
  gsc: boolean;
  ga4: boolean;
  llm: 'deterministic' | 'anthropic' | 'openai';
}

export interface AppConfig {
  providers: ProviderAvailability;
  cost: CostLimits;
  dbPath: string;
  geoDefault: string;
  languageDefault: string;
  ahrefsApiKey?: string;
  dataforseoLogin?: string;
  dataforseoPassword?: string;
  semrushApiKey?: string;
  googleSheets: {
    clientEmail?: string;
    privateKey?: string;
    credentialsPath?: string;
    spreadsheetId?: string;
  };
  llm: {
    provider: 'deterministic' | 'anthropic' | 'openai';
    anthropicApiKey?: string;
    anthropicModel: string;
    openaiApiKey?: string;
    openaiModel: string;
  };
  liveDataMode: boolean;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function loadConfig(): AppConfig {
  loadDotEnv();

  const ahrefs = !!process.env.AHREFS_API_KEY;
  const dataforseo = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  const semrush = !!process.env.SEMRUSH_API_KEY;
  const googleSheets = !!(
    (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
  const gsc = !!process.env.GSC_CREDENTIALS;
  const ga4 = !!process.env.GA4_PROPERTY_ID;

  let llmProvider = (process.env.LLM_PROVIDER ?? 'deterministic').toLowerCase();
  if (llmProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) llmProvider = 'deterministic';
  if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) llmProvider = 'deterministic';
  if (!['deterministic', 'anthropic', 'openai'].includes(llmProvider)) llmProvider = 'deterministic';

  const cfg: AppConfig = {
    providers: {
      ahrefs,
      dataforseo,
      semrush,
      googleSheets,
      gsc,
      ga4,
      llm: llmProvider as ProviderAvailability['llm'],
    },
    cost: {
      maxProviderCalls: num('SEO_MAX_PROVIDER_CALLS', 2000),
      maxLlmCalls: num('SEO_MAX_LLM_CALLS', 20),
      maxUsd: num('SEO_MAX_USD', 25),
    },
    dbPath: process.env.SEO_DB_PATH ?? 'data/seo-planner.db',
    geoDefault: process.env.SEO_GEO_DEFAULT ?? 'us',
    languageDefault: process.env.SEO_LANG_DEFAULT ?? 'en',
    ahrefsApiKey: process.env.AHREFS_API_KEY,
    dataforseoLogin: process.env.DATAFORSEO_LOGIN,
    dataforseoPassword: process.env.DATAFORSEO_PASSWORD,
    semrushApiKey: process.env.SEMRUSH_API_KEY,
    googleSheets: {
      clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_SHEETS_PRIVATE_KEY,
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    },
    llm: {
      provider: llmProvider as 'deterministic' | 'anthropic' | 'openai',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
    },
    liveDataMode: ahrefs || dataforseo || semrush,
  };

  log.info('configuration loaded', {
    liveDataMode: cfg.liveDataMode,
    providers: {
      ahrefs,
      dataforseo,
      semrush,
      googleSheets,
      gsc,
      ga4,
      llm: cfg.providers.llm,
    },
  });
  if (!cfg.liveDataMode) {
    log.warn(
      'No SEO provider keys detected -> STRUCTURAL MODE. Metric fields will be null and flagged LIVE_DATA_REQUIRED. No metrics will be fabricated.',
    );
  }
  return cfg;
}
