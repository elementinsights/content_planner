# Usage

```bash
tsx src/cli.ts <command> [flags]      # or: npm run cli -- <command> [flags]
```

## Commands

| Command | What it does |
|---|---|
| `plan` | Run the full pipeline → plan + all exports (+ Sheets sync). |
| `intake` | Run only intake/discovery; print the interpretation JSON. |
| `sheets` | Re-sync an existing `output/plan.json` to Google Sheets. |
| `help` | Usage. |

```bash
npm run demo                                    # examples/ai-tools-for-marketers.json -> output/
npm run plan -- --config examples/personal-finance-beginners.json --out output
npm run plan -- --idea "I want a website about AI tools for marketers" --siteType affiliate
npm run intake -- --idea "I want a SaaS SEO site focused on AI search optimization"
npm run sheets -- --out output                  # push existing plan to Sheets
```

## Input model

Provide a JSON config (`--config path`) and/or flags. All fields except `idea` are optional; the intake module infers the rest.

```jsonc
{
  "idea": "I want to build a website about AI tools for marketers",   // required
  "broadTopic": "AI tools for marketers",
  "nicheDescription": "...",
  "exampleCompetitor": "zapier.com",
  "competitors": ["hubspot.com"],
  "audience": "in-house marketers...",
  "monetization": "affiliate + email list",
  "excludedTopics": ["enterprise RPA"],
  "geo": "us",
  "language": "en",
  "minArticles": 200,            // floor (>=200 enforced)
  "maxArticles": 800,            // optional cap
  "brandPositioning": "vendor-neutral, no hype",
  "contentStyle": "skimmable, example-driven",
  "siteType": "affiliate"        // affiliate | lead-gen | saas-support | ads | newsletter | ecommerce | service-business | mixed
}
```

## Flags

| Flag | Meaning |
|---|---|
| `--config <path>` | JSON PlanInput file |
| `--idea "<text>"` | site idea (required if no `--config`) |
| `--out <dir>` | output dir (default `output`) |
| `--siteType <type>` | overrides detected site type |
| `--competitors a,b` | comma-separated competitor domains |
| `--excludedTopics a,b` | comma-separated exclusions |
| `--minArticles N` / `--maxArticles N` | floor (≥200) / cap |
| `--dry-run-sheets` | force Sheets dry-run even with creds |
| `--no-sync` | skip Sheets sync entirely |

Flags override `--config` values.

## Outputs

| Path | Contents |
|---|---|
| `output/content-map.csv` · `content-map.json` | the ≥200-row plan, every required column |
| `output/plan.json` | full plan bundle (intake, taxonomy, clusters, pages, briefs, marketing, reports) |
| `output/csv/*.csv` | every Google Sheets tab (review without auth) |
| `output/reports/*.md` | 16 strategy documents (incl. `INDEX.md`) |
| `output/astro/` | `astro-content-manifest.json`, `astro-frontmatter-export.json`, `content.config.ts.suggested` |
| `output/briefs/*.md` | one strategic brief per page |

## Sample run (structural mode, no keys)

```
=== PLAN SUMMARY ===
  Niche                 Ai Tools for Marketers
  Mode                  STRUCTURAL (metrics null = LIVE_DATA_REQUIRED; never fabricated)
  Cannibalization-clean YES ✅
  Recommended total     500 (tier 500)
  Pages in plan         500
  First wave            100
  Categories / Clusters 4 / 132
  Pillars / Hubs        2 / 4
```

## Re-running & change detection

The local store (`data/seo-planner.db`, `node:sqlite`) tracks the last-synced snapshot per **immutable Page ID**. Re-runs detect changed rows and, in Sheets, **preserve protected human columns** (review status, editor notes, approval, manual overrides). Page IDs are deterministic (`P-…` from primary keyword + page type), so edits survive re-planning.
