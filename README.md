# seo-planner

A reusable, internal **organic-traffic SEO planning system** for brand-new **Astro** sites. Give it a site idea; it produces a **cannibalization-clean, Astro-ready, 200+ page keyword/content plan** and exports it to **Google Sheets**, CSV, JSON, and Astro manifests — plus per-page briefs and a content-marketing plan.

It is built for sites starting from **zero**: no articles, no rankings, no backlinks, no topical authority, no Search Console history.

> **It does not publish content.** It plans, scores, de-duplicates, and hands off. A human approves; a writer writes.

---

## What it answers

What site/sub-niche to start with · which categories · **how many pages (and why 200/300/500/700/1000)** · which exact keywords · which pages are pillars/hubs/spokes/glossary/comparison/commercial/tools · what to publish first · KD & volume targets by phase · which opportunities are realistic with no backlinks · how to internally link · what briefs writers need · what sources to cite · how to market each page · how post-launch data feeds back.

## Core guarantee: no fabricated data

- With **SEO API keys** (Ahrefs preferred, DataForSEO secondary) → **live mode**: real volume/KD/TP/SERP data.
- With **no keys** → **structural mode**: the *entire* plan is still produced (taxonomy, clusters, page types, Astro routes, internal links, briefs, marketing), but every metric field is `null` and flagged `LIVE_DATA_REQUIRED`. **Metrics and citations are never invented.**

## Quickstart

```bash
npm install
npm run demo          # runs examples/ai-tools-for-marketers.json -> output/
```

Or your own idea:

```bash
npm run plan -- --idea "I want a SaaS SEO site focused on AI search optimization" --siteType saas-support --out output
npm run intake -- --idea "I want a no-backlink site about personal finance for beginners"
npm test              # 32 unit + integration tests
npm run typecheck
```

No keys? It runs anyway (structural mode + Sheets dry-run). Add keys in `.env` (see `.env.example` and [docs/SETUP.md](docs/SETUP.md)) to get live metrics and a real Google Sheet.

## What you get (in `output/`)

```
output/
├─ content-map.csv / content-map.json     # the 200+ row plan (every required column)
├─ plan.json                              # full machine-readable plan bundle
├─ csv/                                   # every Google Sheets tab as CSV (review without auth)
├─ reports/                               # 16 strategy docs (see below)
├─ astro/                                 # astro-content-manifest.json, frontmatter export, content.config.ts.suggested
└─ briefs/                                # one Markdown strategic brief per page
```

**Reports:** intake interpretation · API research plan · article-count recommendation · search-volume-threshold report · category/taxonomy map · cluster roadmap · pillar/hub/spoke map · internal-link map · external-source plan · content-marketing plan · publishing roadmap · stop/expand decision framework · cannibalization-clean report · keyword-difficulty-by-phase · competitor analysis.

**Google Sheets** (19 tabs incl. Dashboard, Content Map, Keyword Metrics, Clusters, Internal Links, Briefs, Cannibalization Clean Report, Article Count Recommendation, Post-Launch Performance, Settings, Sync/Error Logs) with **protected human-edited columns** preserved across re-syncs.

## How the plan is built (pipeline)

```
intake/discovery → keyword expansion + ingestion → SERP + competitor analysis
  → clustering → taxonomy → article-count recommendation
  → scoring → cannibalization PREVENTION → content map (≥200 rows)
  → internal links → external sources → briefs → marketing → exports → Sheets
```

- **Article count** is dynamic: distinct cannibalization-clean candidates + cluster depth + SERP opportunity + business value + capacity → a tier (200/300/500/700/1000), with explicit *why-not-more* / *why-not-fewer* justifications.
- **Cannibalization is prevented, not just scored**: every candidate is compared against all others (core-phrase identity, semantic/SERP overlap, intent, page type, cluster id, route) and merged/folded/differentiated until the final set is provably **cannibalization-clean**.
- **Phases**: KD-by-phase for a no-backlink site (Phase 1 ≈ KD 0–10 easy long-tail; Phase 4 = competitive). Publishing cadence assigned by a readiness quantile (~30/35/25/10).
- **Scoring** is explainable: normalized 0–1 subscores × configurable weights (`src/config/weights.ts`).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for formulas and module map.

## Tech

TypeScript · Node ≥22 (run via `tsx`, no build step) · `node:sqlite` for local state (behind a repository abstraction) · Zod validation · `google-auth-library` + Sheets REST · provider abstractions for Ahrefs / DataForSEO / GSC / GA4 / Sheets / Astro / LLM / Marketing · `node:test`.

## Non-goals (by design)

No WordPress, no auto-publishing, no direct Astro publishing, no backlink automation, no keyword-density tools, no fabricated entities/citations/metrics, no thin glossary spam, no duplicate pages, no excessive pillars/categories, no Google Indexing API for editorial pages.

## Docs

- [docs/SETUP.md](docs/SETUP.md) — keys + Google Cloud service account
- [docs/USAGE.md](docs/USAGE.md) — CLI, input model, outputs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, data flow, scoring formulas, decisions
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — provider matrix + Ahrefs-first rationale
- [docs/HUMAN_WORKFLOW.md](docs/HUMAN_WORKFLOW.md) — review gates + post-launch loop
