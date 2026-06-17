# Providers

Every external capability is behind an interface (`src/providers/interfaces.ts`), resolved by `registry.ts` from config. Everything **degrades gracefully**.

## Matrix

| Capability | Interface | Primary | Secondary / fallback |
|---|---|---|---|
| Keyword metrics, ideas, competitor pages/keywords, referring domains | `SEODataProvider` | **Ahrefs** | DataForSEO → Semrush (optional) → **NullSeo** (null metrics) |
| SERP results + features | `SERPProvider` | **DataForSEO SERP** | **NullSerp** (empty, non-live) |
| Editorial spreadsheet | `SpreadsheetProvider` | **Google Sheets** (service account) | **DryRunSheets** (default; mirrors to CSV) |
| Astro export | `StaticSiteExporter` | **AstroContentExporter** | — |
| Intake/discovery | `LLMIntakeProvider` | **Deterministic** (default) | Anthropic / OpenAI (opt-in, falls back to deterministic) |
| Marketing planning | `MarketingPlanningProvider` | **Deterministic** | — |
| Post-launch search | `SearchConsoleProvider` | **GSC** | unavailable until configured |
| Post-launch analytics | `AnalyticsProvider` | **GA4** | unavailable until configured |

## Why Ahrefs is primary

Ahrefs is the preferred source for keyword discovery, **Parent Topic**, **Traffic Potential**, **Keyword Difficulty**, SERP overview, competitor top pages, organic keywords, and **referring-domain** analysis — exactly the inputs this system's scoring depends on (demand, no-backlink opportunity, backlink dependency, cannibalization). DataForSEO is the **secondary** layer: the SERP API (results + features) and a volume/trend/KD supplement, and the **backup** if Ahrefs API limits or workflow fit become a blocker. DataForSEO is not promoted to primary unless Ahrefs is absent.

When both are present, ingestion enriches with **Ahrefs first**, then **fills only the still-null fields** from DataForSEO — primary values are never overwritten.

### DataForSEO as a complete standalone backup
With **only** DataForSEO (no Ahrefs), you still get a full live plan:
- keyword ideas + volume + CPC + KD (Labs/Ads), referring domains (Backlinks), **live SERP** (results/features);
- **competitor gap analysis** via Labs `ranked_keywords` + `relevant_pages` (`getCompetitorOrganicKeywords` / `getCompetitorTopPages`);
- **Parent Topic is reconstructed** from live SERPs via **SERP-overlap clustering** (keywords sharing ≥3 top-10 URLs = same page), and the **hub keyword is the highest-volume member** — a faithful Parent-Topic equivalent;
- **search intent** comes from DataForSEO's classifier and drives page typing (commercial vs informational).

Only two Ahrefs-specific *columns* stay blank (Parent Topic, Traffic Potential); demand then derives from volume + CPC + live SERP. Nothing breaks.

## Live vs structural behavior

- **Live** (any SEO key): real volume/KD/TP/CPC/clicks/parent-topic; SERP weakness & backlink dependency from observed SERPs; competitor gap analysis from real top pages/keywords.
- **Structural** (no keys): `NullSeo`/`NullSerp` return `null`/empty; scoring uses **structural priors** (clearly flagged); keyword *strings* are still real candidate queries. **No metric is ever fabricated.**

## Adapter integrity notes

- **Ahrefs** (`seo/ahrefs.ts`): Ahrefs API v3, defensive field mapping; endpoint paths/fields should be confirmed per subscription. Unreadable fields → `null`.
- **DataForSEO** (`seo/dataforseo.ts`, `serp/dataforseoSerp.ts`): Labs/SERP/Ads/Backlinks endpoints; numeric location codes mapped from geo; SERP UGC detection drives weakness; competitor endpoints (`ranked_keywords`/`relevant_pages`) have pure, unit-tested mappers. **One account = one login/password for all DataForSEO APIs** (pay-as-you-go); SERPs are cached in the local store (`SEO_SERP_BUDGET` caps fetches).
- All network adapters share `http.ts` (retry/backoff + **cost charging before each attempt**, so caps hold on retries).

## Adding a provider

1. Implement the interface in `src/providers/<kind>/<name>.ts`.
2. Wire it in `registry.ts` (priority order for SEO; single choice for SERP/Sheets/intake).
3. Map responses **defensively** — return `null` rather than guessing.

`SEMRUSH_API_KEY` already wires a scaffolded `SemrushProvider` (returns `null` until its endpoints are mapped for your plan) — optional, never the primary path.

## Indexing & crawling (intentionally minimal)

- **No Google Indexing API** for normal editorial pages (out of scope). If added later, keep it optional/non-central.
- **Crawling** is optional, not required for the MVP; competitor analysis uses provider data (or clearly-labeled structural assumptions) rather than a crawler.
