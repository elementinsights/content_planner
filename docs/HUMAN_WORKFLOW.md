# Human Workflow

The system plans; **humans approve**; writers write. Nothing publishes automatically.

## 1. Generate

```bash
npm run plan -- --config examples/ai-tools-for-marketers.json --out output
```
Review `output/reports/INDEX.md` first (intake interpretation, article-count rationale, cannibalization-clean report, publishing roadmap, stop/expand framework).

## 2. Review in Google Sheets

The **Content Map** tab is the working surface. Editors work top-down by **Publishing Phase** and **Priority Score**. Each row carries its rationale: volume-threshold decision, KD range, no-backlink opportunity, SERP weakness, unique page intent, cannibalization status.

### Protected (human-edited) columns — preserved across re-syncs
- **Human Review Status** · **Editor Notes** · **Approval Status**
- **Manual Priority Override** · **Manual Category Override** · **Manual Publish Phase Override** · **Manual Marketing Notes**

On every re-sync the tool matches rows by **immutable Page ID** and **keeps your edits** in these columns (it never clobbers a non-empty protected cell). Re-running the plan is safe.

## 3. Approval gate

A page is ready to write when **Approval Status = approved**. Recommended gate per page:
1. Unique page intent is genuinely distinct (Cannibalization Status = `clean` or `differentiated`).
2. Volume-threshold decision is acceptable (or has a justified low-volume allowance).
3. KD range fits the assigned phase for a no-backlink site.
4. Internal links in/out make sense; the cluster has a hub.

Approved rows → hand the matching `output/briefs/<slug>.md` to a writer. Briefs are **strategic** (intent, must-answer questions, sections, internal links, sources, differentiation) — **not drafts**. Do not mass-generate articles.

## 4. Publish in waves (Astro)

Use `output/astro/`:
- `content.config.ts.suggested` → adapt your collections (`articles`, `hubs`, `comparisons`, `glossary`, `tools`, `templates`, `briefs`).
- Per page: suggested **content collection**, **Markdown/MDX filename**, **route**, and **frontmatter** (incl. `draft: true`). Generate routes from collections (`src/pages/[...slug].astro`) — don't hand-write per-page routes.

Publish the **first wave** (~50–100 Phase-1 pages: weakest SERPs, lowest backlink dependency) before scaling. Deploy internal links as siblings ship (see the Internal Links tab and each page's `internalLinksOut`).

## 5. Market each page

The **Content Marketing Plan** tab: channels, social/newsletter/community angles, repurposing, linkable-asset ideas, refresh schedule, measurement. Earn links via assets (tools/templates/data) — **no paid links, no spammy outreach**.

## 6. Post-launch feedback loop

Once pages exist and have GSC/GA4 history, configure those providers (see SETUP). The **Post-Launch Performance** tab is pre-seeded `AWAITING_GSC_GA4`. Feed real impressions/clicks/position/conversions back to:
- re-prioritize the roadmap (promote pages ranking 8–20 for a quick push),
- trigger refreshes on decaying pages,
- inform the **stop/expand** decision (`reports/stop-expand-decision-framework.md`): expand to the next tier only when Phase-1 pages index and rank and live data shows additional non-overlapping demand; otherwise consolidate.

## Integrity rules (enforced/encouraged)

- Metrics shown as `LIVE_DATA_REQUIRED` are **unknown**, not zero — don't treat them as real.
- **Never** invent citations/stats/authors; YMYL pages require primary, current, authoritative sources + expert review (flagged automatically).
- Don't copy competitor content or mirror their structure; competitor data informs direction and gaps only.
