/**
 * Report exporter. Emits all required strategy documents as Markdown so the plan
 * is human-readable end to end: intake interpretation, API research plan, article
 * -count recommendation, volume-threshold report, taxonomy map, cluster roadmap,
 * pillar/hub/spoke map, internal-link map, external-source plan, marketing plan,
 * publishing roadmap, stop/expand framework, cannibalization-clean report, and
 * KD-by-phase recommendation.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanResult, PlannedPage } from '../core/types.ts';
import type { CompetitorAnalysis } from '../ingestion/competitors.ts';
import { log } from '../core/logger.ts';

function write(dir: string, name: string, body: string, files: string[]): void {
  const file = join(dir, name);
  writeFileSync(file, body);
  files.push(file);
}

function countBy<T>(arr: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of arr) out[key(a)] = (out[key(a)] ?? 0) + 1;
  return out;
}

export function exportReports(outDir: string, plan: PlanResult, competitors: CompetitorAnalysis[]): string[] {
  const dir = join(outDir, 'reports');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const p = plan;
  const mode = p.liveDataMode ? 'LIVE DATA' : 'STRUCTURAL MODE (metrics null, flagged LIVE_DATA_REQUIRED — never fabricated)';

  // 1. Intake / discovery interpretation -----------------------------------
  const intake = p.intake;
  write(dir, 'intake-interpretation.md', [
    `# Intake / Discovery Interpretation`,
    ``,
    `**Mode:** ${mode}  ·  **Source:** ${intake.source}`,
    ``,
    `## Interpreted niche`,
    intake.interpretedNiche,
    ``,
    `## Starting wedge (not the whole market)`,
    intake.startingWedge,
    ``,
    `## Recommended starting angle`,
    intake.recommendedStartingAngle,
    ``,
    `## Audience assumptions`,
    ...intake.audienceAssumptions.map((x) => `- ${x}`),
    ``,
    `## Monetization assumptions`,
    ...intake.monetizationAssumptions.map((x) => `- ${x}`),
    ``,
    `## Seed topics (${intake.seedTopics.length})`,
    ...intake.seedTopics.map((x) => `- ${x}`),
    ``,
    `## Seed keywords (${intake.seedKeywords.length})`,
    ...intake.seedKeywords.map((x) => `- ${x}`),
    ``,
    `## Competitor domains`,
    ...(intake.competitorDomains.length ? intake.competitorDomains.map((x) => `- ${x}`) : ['- (none supplied)']),
    ``,
    `## Excluded topics`,
    ...(intake.excludedTopics.length ? intake.excludedTopics.map((x) => `- ${x}`) : ['- (none)']),
    ``,
    `## Geo / Language`,
    `- Geo: ${intake.geo}`,
    `- Language: ${intake.language}`,
    ``,
    `## Initial categories`,
    ...intake.initialCategories.map((c) => `- **${c.name}** — ${c.rationale}`),
    ``,
    `## Content marketing assumptions`,
    ...intake.contentMarketingAssumptions.map((x) => `- ${x}`),
    ``,
    `## Acquisition channels`,
    ...intake.acquisitionChannels.map((x) => `- ${x}`),
    ``,
    `## YMYL / compliance flags`,
    ...(intake.ymylRiskFlags.length ? intake.ymylRiskFlags.map((x) => `- ${x}`) : ['- None detected']),
    ``,
    `## Clarifying questions`,
    ...(intake.clarifyingQuestions.length ? intake.clarifyingQuestions.map((x) => `- ${x}`) : ['- None — proceeding with stated assumptions.']),
  ].join('\n'), files);

  // 2. API research plan ----------------------------------------------------
  write(dir, 'api-research-plan.md', [
    `# API Research Plan`,
    ``,
    `Ahrefs is the PRIMARY source; DataForSEO is the secondary/SERP supplement. Steps marked optional run only when that provider is configured.`,
    ``,
    `| Provider | Endpoint | Purpose | Inputs | Status |`,
    `|---|---|---|---|---|`,
    ...intake.apiResearchPlan.map((s) => `| ${s.provider} | \`${s.endpoint}\` | ${s.purpose} | ${s.inputs.join(', ')} | ${s.optional ? 'optional (provider absent)' : 'active'} |`),
  ].join('\n'), files);

  // 3. Article-count recommendation ----------------------------------------
  const ac = p.articleCount;
  write(dir, 'article-count-recommendation.md', [
    `# Article-Count Recommendation`,
    ``,
    `## Recommended total: **${ac.recommendedTotal} pages** (tier ${ac.tier}, floor ${ac.minArticles})`,
    `First publishing wave: **${ac.firstWaveSize} pages**. Mode: ${mode}.`,
    ``,
    `## Why this number`,
    ...ac.rationale.map((r) => `- ${r}`),
    ``,
    `## Signals (0-1)`,
    ...Object.entries(ac.signals).map(([k, v]) => `- **${k}**: ${v}`),
    ``,
    `## Why not fewer than ${ac.recommendedTotal}`,
    ac.whyNotFewer,
    ``,
    `## Why not 700+ (or, if 700+, why it IS justified)`,
    ac.whyNotMore,
    ``,
    `## Recommended page-type breakdown`,
    `| Page type | Count |`,
    `|---|---|`,
    ...Object.entries(ac.pageTypeBreakdown).map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n'), files);

  // 4. Search-volume-threshold report --------------------------------------
  write(dir, 'search-volume-threshold-report.md', [
    `# Search-Volume-Threshold Report`,
    ``,
    p.volumeThresholdReport.note,
    ``,
    `## Base floors by page type`,
    ...Object.entries(p.volumeThresholdReport.byPageType).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Base floors by phase`,
    ...Object.entries(p.volumeThresholdReport.byPhase).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Allowances that justify low/zero-volume keywords`,
    ...p.volumeThresholdReport.lowVolumeAllowanceReasons.map((r) => `- ${r}`),
    ``,
    `Every Content Map row carries its own threshold decision string. See the "Search Volume Thresholds" tab.`,
  ].join('\n'), files);

  // 5. Category / taxonomy map ---------------------------------------------
  write(dir, 'category-taxonomy-map.md', [
    `# Category / Taxonomy Map`,
    ``,
    `URL folder structure: ${p.taxonomy.urlFolderStructure.join('  ·  ')}`,
    ``,
    ...p.taxonomy.categories.flatMap((c) => [
      `## ${c.name}  \`/${c.slug}/\``,
      `_${c.rationale}_`,
      `- Primary intent: ${c.primaryIntent}`,
      `- Subcategories: ${c.subcategories.map((s) => s.name).join(', ')}`,
      ``,
    ]),
  ].join('\n'), files);

  // 6. Cluster roadmap ------------------------------------------------------
  write(dir, 'cluster-roadmap.md', [
    `# Cluster Roadmap`,
    ``,
    `${p.clusters.length} clusters. Hub-and-spoke: each cluster has a hub page and supporting spokes.`,
    ``,
    `| Cluster | Category | Members | Completeness | Hub keyword |`,
    `|---|---|---|---|---|`,
    ...p.clusters
      .slice()
      .sort((a, b) => b.memberKeywords.length - a.memberKeywords.length)
      .map((c) => `| ${c.name} | ${c.category} | ${c.memberKeywords.length} | ${c.completeness.toFixed(2)} | ${c.hubKeyword ?? '—'} |`),
  ].join('\n'), files);

  // 7. Pillar / hub / spoke map --------------------------------------------
  const byRole = countBy(p.pages, (x) => x.role);
  const byType = countBy(p.pages, (x) => x.pageType);
  write(dir, 'pillar-hub-spoke-map.md', [
    `# Pillar / Hub / Spoke Map`,
    ``,
    `## Role distribution`,
    ...Object.entries(byRole).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Page-type distribution`,
    ...Object.entries(byType).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Pillars (capped 1-3)`,
    ...p.pages.filter((x) => x.role === 'pillar').map((x) => `- **${x.recommendedTitle}** — ${x.urlPath}`),
    ``,
    `## Category hubs`,
    ...p.pages.filter((x) => x.pageType === 'category-hub').map((x) => `- ${x.recommendedTitle} — ${x.urlPath}`),
  ].join('\n'), files);

  // 8. Internal-link map ----------------------------------------------------
  const totalLinks = p.pages.reduce((a, x) => a + x.internalLinksOut.length, 0);
  write(dir, 'internal-link-map.md', [
    `# Internal-Link Map`,
    ``,
    `${totalLinks} planned internal links across ${p.pages.length} pages (hub-and-spoke model).`,
    ``,
    `Link types used: pillar↔hub, hub↔spoke, spoke→pillar, sibling spokes, informational→commercial, commercial→support, glossary/support→hub.`,
    `Intent-mismatch guard: BOFU/commercial pages are not pushed up into unrelated TOFU informational pages.`,
    ``,
    `## Sample (first 40 links)`,
    `| From | Anchor | → To | Type | Priority |`,
    `|---|---|---|---|---|`,
    ...p.pages
      .flatMap((x) => x.internalLinksOut.map((l) => ({ from: x.urlPath, l })))
      .slice(0, 40)
      .map(({ from, l }) => `| ${from} | ${l.anchor} | ${l.targetUrlPath} | ${l.linkType} | ${l.priority} |`),
    ``,
    `Full graph in the "Internal Links" sheet tab and content-map.json.`,
  ].join('\n'), files);

  // 9. External-source plan -------------------------------------------------
  write(dir, 'external-source-plan.md', [
    `# External-Source / Citation Plan`,
    ``,
    `Per-page source plans are in the "External Sources" tab. Global policy:`,
    ``,
    `## Preferred source categories`,
    ...p.pages[0].externalSourcePlan.suggestedDomains.map((d) => `- ${d}`),
    ``,
    `## Sources to avoid`,
    ...p.pages[0].externalSourcePlan.sourcesToAvoid.map((d) => `- ${d}`),
    ``,
    `## Integrity guardrails`,
    `- ${p.pages[0].externalSourcePlan.integrityNote}`,
    `- Prefer primary/official sources; avoid passing authority to direct competitors.`,
    `- YMYL pages require primary, current, authoritative citations + expert review.`,
  ].join('\n'), files);

  // 10. Content marketing plan ---------------------------------------------
  write(dir, 'content-marketing-plan.md', [
    `# Content Marketing Plan (summary)`,
    ``,
    `Per-page plans are in the "Content Marketing Plan" tab. Principles: earn links via assets (tools/templates/data), no paid links, no spammy outreach.`,
    ``,
    `## Top promotion-priority pages`,
    `| Page | Type | Priority | Channels |`,
    `|---|---|---|---|`,
    ...p.pages
      .slice()
      .sort((a, b) => b.contentMarketingPriority - a.contentMarketingPriority)
      .slice(0, 20)
      .map((x) => `| ${x.recommendedTitle} | ${x.pageType} | ${x.contentMarketingPriority.toFixed(2)} | ${x.promotionChannels.slice(0, 2).join(', ')} |`),
  ].join('\n'), files);

  // 11. Publishing roadmap --------------------------------------------------
  write(dir, 'publishing-roadmap.md', [
    `# Publishing Roadmap`,
    ``,
    `First wave: **${ac.firstWaveSize} pages** — the weakest-SERP, lowest-backlink-dependency Phase-1 pages.`,
    ``,
    `| Phase | Label | KD range | Pages | Strategy |`,
    `|---|---|---|---|---|`,
    ...p.kdByPhase.phases.map((ph) => `| ${ph.phase} | ${ph.label} | ${ph.kdRange[0]}-${ph.kdRange[1]} | ${ph.pageCount} | ${ph.rationale} |`),
  ].join('\n'), files);

  // 12. Stop / expand decision framework -----------------------------------
  write(dir, 'stop-expand-decision-framework.md', [
    `# Stop / Expand Decision Framework`,
    ``,
    `Use this to decide whether to keep publishing within the current tier (${ac.tier}) or expand to the next tier.`,
    ``,
    `## EXPAND to the next tier when ALL hold`,
    `- ≥60% of published Phase-1 pages are indexed AND ≥30% rank in the top 20 within 8-12 weeks.`,
    `- Live data (Ahrefs/GSC) confirms additional NON-overlapping demand beyond the current map.`,
    `- New candidates pass the cannibalization gate (no hard conflicts) and a per-row volume-threshold decision.`,
    `- Editorial capacity can sustain refreshes on existing pages AND new output.`,
    ``,
    `## STOP / consolidate when ANY hold`,
    `- New candidate keywords mostly trigger soft/hard cannibalization conflicts (demand is saturated).`,
    `- Refresh debt is rising: existing pages decay faster than you can update them.`,
    `- Phase-1 pages are NOT indexing/ranking — fix quality, internal links, and E-E-A-T before scaling.`,
    `- Marginal new pages fall below their volume-threshold decision without a strategic allowance.`,
    ``,
    `## Topical-authority growth model`,
    `Phase 1 wins weak long-tail (no links needed) → builds internal-link equity + topical signals → Phase 2/3 unlock mid-KD hub terms → Phase 4 competes for head terms only after earned authority. Do not front-load pillars/head terms.`,
  ].join('\n'), files);

  // 13. Cannibalization-clean report ---------------------------------------
  const cr = p.cannibalizationReport;
  write(dir, 'cannibalization-clean-report.md', [
    `# Cannibalization-Clean Report`,
    ``,
    `## STATUS: ${p.cannibalizationClean ? '**CANNIBALIZATION-CLEAN ✅**' : '**NOT CLEAN ⚠️**'}`,
    ``,
    `- Total candidates evaluated: ${cr.totalCandidates}`,
    `- Conflicts detected: ${cr.conflictsDetected} (hard: ${cr.hardConflicts}, soft: ${cr.softConflicts})`,
    `- Hard conflicts were resolved by merge / secondary-keyword folding / removal.`,
    `- Soft conflicts were resolved by angle differentiation (kept as distinct pages).`,
    `- Final clean pages: **${cr.finalPages}**`,
    ``,
    `Detection signals: parent-topic overlap, SERP overlap, semantic similarity, core-phrase identity, intent, modifier/page-type, funnel, cluster relationship, title/H1 similarity, URL/route similarity.`,
    ``,
    `## Sample resolutions (first 30)`,
    `| Page ID | vs | Severity | Resolution |`,
    `|---|---|---|---|`,
    ...cr.resolutions.slice(0, 30).map((r) => `| ${r.pageId} | ${r.against} | ${r.severity} | ${r.resolution} |`),
  ].join('\n'), files);

  // 14. KD-by-phase recommendation -----------------------------------------
  write(dir, 'keyword-difficulty-by-phase.md', [
    `# Keyword-Difficulty-by-Phase Recommendation`,
    ``,
    `KD is never used alone — it is combined with traffic potential, SERP weakness, backlink dependency, competitor strength, topical fit, business value, and cluster importance.`,
    ``,
    ...p.kdByPhase.phases.flatMap((ph) => [
      `## Phase ${ph.phase} — ${ph.label}`,
      `- KD range: **${ph.kdRange[0]}-${ph.kdRange[1]}** (selective exception up to ${ph.selectiveExceptionUpTo} when SERP weakness + no-backlink opportunity are high)`,
      `- Pages assigned: ${ph.pageCount}`,
      `- ${ph.rationale}`,
      ``,
    ]),
  ].join('\n'), files);

  // 15. Competitor analysis (if any) ---------------------------------------
  if (competitors.length) {
    write(dir, 'competitor-analysis.md', [
      `# Competitor Analysis`,
      ``,
      `_Used only to infer market direction, category possibilities, and gaps. We do NOT copy content or mirror structure._`,
      ``,
      ...competitors.flatMap((c) => [
        `## ${c.domain} ${c.liveData ? '(live)' : '(STRUCTURAL ASSUMPTIONS — validate with live data)'}`,
        `- Topical focus: ${c.topicalFocus}`,
        `- Main categories: ${c.mainCategories.join(', ') || 'unknown'}`,
        `- Content types: ${c.contentTypes.join(', ')}`,
        `- Commercial/informational mix: ${c.commercialInformationalMix}`,
        `- Gaps: ${c.gaps.join(' ')}`,
        `- Opportunities: ${c.opportunities.join(' ')}`,
        `- Note: ${c.notes}`,
        ``,
      ]),
    ].join('\n'), files);
  }

  // Index -------------------------------------------------------------------
  write(dir, 'INDEX.md', [
    `# Reports Index`,
    ``,
    `Mode: ${mode}`,
    ``,
    ...files.filter((f) => !f.endsWith('INDEX.md')).map((f) => `- [${f.split('/').pop()}](${f.split('/').pop()})`),
  ].join('\n'), files);

  log.info('Reports export complete', { count: files.length, dir });
  return files;
}
