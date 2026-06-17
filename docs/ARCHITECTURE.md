# Architecture

CLI-first TypeScript. **Deterministic-first**: the whole plan is computable with zero network/keys; live providers only *enrich* it. Run via `tsx` (no build).

## Module map (`src/`)

```
config/      env.ts (provider availability, cost caps) · weights.ts (scoring weights) · defaults.ts (KD/volume/tiers/modifiers/sources)
core/        types.ts (domain model) · schemas.ts (zod) · logger · retry (backoff) · cost (budget caps) · ids (stable Page IDs) · text (slug/jaccard/dice)
storage/     store.ts — node:sqlite behind a Store interface (+ JSON fallback): pages, protected fields, sync log
providers/   interfaces.ts + registry.ts; adapters: seo/{ahrefs,dataforseo,semrush,nullSeo} · serp/{dataforseoSerp,nullSerp}
             · spreadsheet/{googleSheets,dryRunSheets} · searchConsole/gsc · analytics/ga4 · llm/{deterministicIntake,llmIntake}
             · marketing/marketingProvider · google/auth · http
intake/      core.ts (deterministic interpreter + finalize) · seedExpansion.ts (modifier expansion)
ingestion/   keywords.ts · serp.ts (overlap signatures) · competitors.ts (gap analysis)
clustering/  cluster.ts (hybrid: SERP-overlap union-find when live SERPs exist → else Ahrefs Parent Topic → else core phrase; hub = highest-volume member)
cannibalization/ cannibalization.ts (detect + PREVENT -> clean)
scoring/     subscores.ts (0-1, with structural priors) · scores.ts (composites)
taxonomy/    taxonomy.ts (3-5 categories, shallow URLs)
planning/    pageCount · kdByPhase · volumeThresholds · astroPlan · contentMap · internalLinks · externalSources · briefs · marketing
exporters/   workbook (tab defs) · csv · json · astroManifest · markdownBriefs · reports · sheets
pipeline/    run.ts (orchestrator)   cli.ts (entry)
```

## Data flow

```
PlanInput
  └─ intake.interpret() ───────────────► IntakeResult (niche, wedge, seed topics/keywords, categories, competitors, YMYL, API plan)
        ├─ expandSeeds() + provider ideas ► KeywordRecord[]  (real query strings; metrics null unless live)
        ├─ ingestSerp() (live only) ──────► SERP signatures
        ├─ analyzeCompetitors() ──────────► gap analysis
        ├─ clusterKeywords() ─────────────► Cluster[] (+ importance, completeness)
        ├─ buildTaxonomy() ───────────────► Taxonomy
        ├─ buildContentMap()
        │     ├─ assign page type + role (pillars 1-2, one hub/category, sub-hubs for deep clusters)
        │     ├─ computeSubscores → computeScores
        │     ├─ preventCannibalization() ► clean kept set
        │     └─ finalizePage() per kept  ► PlannedPage (all columns)
        ├─ recommendArticleCount(cleanCount) ► tier + justification
        ├─ selectTopPages(target) ────────► final ≥200 + phase quantile
        ├─ planInternalLinks / externalSources / briefs / marketing
        └─ exporters + Sheets sync ───────► output/
```

## Scoring (all 0–1, weight-driven; `config/weights.ts`)

```
DemandScore        = blend(localVol, globalVol, trafficPotential, trend, clicks, cpc)         // null metrics → structural prior by funnel/intent
SerpWeakness       = blend(lowAuthority, lowRefDomains, stale, UGC, intentMismatch, weakFit)  // null SERP → prior by page type
BacklinkDependency = blend(KD, medianRefDomains, strongDomainPrevalence, linkIntensity)        // null → prior by page type
NoBacklinkOpp      = blend(1-BacklinkDependency, SerpWeakness, topicalFit, businessValue, intentClarity)
BusinessValue      = pageType base ± intent/CPC/commercialBias
Priority           = blend(NoBacklinkOpp, Demand, TrafficPotential, BusinessValue, ClusterImportance, InternalLinkValue, PromotionValue)
ContentMarketing   = blend(PromotionPotential, Linkability, BusinessValue, AudienceReach)
PageCount score    = blend(universe=log(cleanCandidates), clusterDepth, serpOpportunity, businessValue, capacity) → tier
```

`weightedBlend` normalizes by the sum of the weights actually present, so missing inputs degrade gracefully. **Structural priors are planning defaults, not metrics** — the metric fields stay `null` and rows are flagged `LIVE_DATA_REQUIRED` / `STRUCTURAL_PRIORS:...`.

### Article-count logic
`recommendedTotal` is bounded by the **distinct cannibalization-clean** candidate count (you can't plan more non-overlapping pages than exist), snapped to the largest supportable tier ≥ the 200 floor and ≤ `maxArticles`. Both *why-not-more* and *why-not-fewer* are generated.

### Phases
KD-by-phase is config (`KD_BY_PHASE`), not hardcoded. Publishing cadence is assigned by a **readiness quantile** (NoBacklinkOpp + low BacklinkDependency) over the final set ≈ 30/35/25/10 across Phases 1–4; pillars last, hubs no earlier than phase 2/3.

### Cannibalization prevention
Candidates are processed highest-priority-first; each is compared to all kept pages on: identical route, SERP overlap+intent, semantic ≥0.8 + same type+intent, **core-phrase identity + same type+intent+cluster-id**, parent-topic equality. Hard → fold loser's keyword as a **secondary** into the winner (or remove duplicate). Soft → keep + **differentiate**. **Backbone pages (pillars/category-hubs) are never folded.** A final pass verifies zero residual hard conflicts → `cannibalizationClean: true`.

## Key decisions / tradeoffs

- **`node:sqlite` instead of Drizzle/Prisma+better-sqlite3.** On Node 25 the native module had no guaranteed prebuilt ABI; `node:sqlite` is built-in, zero-compile, and always runs. It sits behind a `Store` interface (with a JSON fallback), so Drizzle can be layered later without touching callers. *(Tradeoff: less ORM ergonomics now; chosen for runnability.)*
- **Single runnable package, monorepo-ready layout.** The brief asked for a monorepo; the MVP keeps one package with clean module boundaries so it actually runs end-to-end. Splitting `core/providers/planning/exporters` into workspaces later is mechanical.
- **Deterministic intake by default.** Reusable and offline; LLM is opt-in and falls back deterministically.
- **Real keyword *strings*, null *metrics* in structural mode.** Modifier expansion yields genuine candidate queries (what you'd paste into Ahrefs); their volumes are unknown until live — so they're `null`, never guessed.
- **Lazy/optional heavy deps.** `google-auth-library` is lazy-loaded; LLM SDKs are dynamic imports — install only what you use.

## Testing

`node:test` via `tsx --test`: text utils, scoring (priors vs live), clustering, cannibalization (fold/keep/protect/clean), page-count (floor/tier/caps), exports (tabs/protected cols/CSV escaping), intake (niche/YMYL/domain mapping), providers (null = no fabrication), storage (change detection + protected fields), and an **end-to-end integration test** asserting a clean ≥200-page plan with no fabricated metrics. `npm run typecheck` covers `src` + `test`.
