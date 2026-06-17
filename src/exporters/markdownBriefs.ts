/**
 * Markdown brief exporter. Writes each strategic brief as a Markdown file the
 * writer can work from. These are STRATEGIC briefs, not article drafts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Brief, PlannedPage } from '../core/types.ts';
import { log } from '../core/logger.ts';

function briefMarkdown(b: Brief, p: PlannedPage | undefined): string {
  const lines: string[] = [];
  lines.push(`# Brief: ${b.suggestedTitle}`);
  lines.push('');
  lines.push(`> **Page ID:** ${b.pageId} · **Phase:** ${b.publishingPhase} · **Page type:** ${b.pageType} · **Intent:** ${b.searchIntent}`);
  lines.push(`> **Cannibalization-clean:** ${b.cannibalizationCleanConfirmed ? 'YES ✅' : 'review ⚠️'}`);
  lines.push('');
  lines.push(`- **Primary keyword:** ${b.primaryKeyword}`);
  lines.push(`- **Secondary keywords:** ${b.secondaryKeywords.join(', ') || '—'}`);
  lines.push(`- **Parent topic:** ${b.parentTopic ?? '(LIVE_DATA_REQUIRED)'}`);
  lines.push(`- **Category / Cluster:** ${b.category} / ${b.cluster}`);
  lines.push(`- **Target reader:** ${b.targetReader}`);
  lines.push(`- **Suggested H1:** ${b.suggestedH1}`);
  lines.push(`- **URL:** ${b.suggestedUrl}`);
  lines.push(`- **Format:** ${b.recommendedContentFormat}`);
  if (p) lines.push(`- **Recommended min volume threshold:** ${p.recommendedMinVolumeThreshold} — ${p.volumeThresholdDecision}`);
  if (p) lines.push(`- **Recommended KD range:** ${p.recommendedKdRange[0]}-${p.recommendedKdRange[1]}`);
  lines.push('');
  lines.push(`## Page purpose`);
  lines.push(b.pagePurpose);
  lines.push('');
  lines.push(`## Unique intent & differentiation`);
  lines.push(b.differentiationAngle);
  lines.push('');
  lines.push(`## SERP / competitor summary`);
  lines.push(b.serpCompetitorSummary);
  lines.push('');
  lines.push(`## Must-answer questions`);
  for (const q of b.mustAnswerQuestions) lines.push(`- ${q}`);
  lines.push('');
  lines.push(`## Suggested sections`);
  for (const s of b.suggestedSections) lines.push(`- ${s}`);
  lines.push('');
  lines.push(`## Depth, media & schema`);
  lines.push(`- **Target length:** ${b.wordCountTarget}`);
  lines.push(`- **Media to include:** ${b.mediaNeeds.join('; ')}`);
  lines.push(`- **Schema markup:** ${b.schemaType}`);
  lines.push('');
  lines.push(`## Trust (E-E-A-T)`);
  lines.push(b.eeatNote);
  lines.push('');
  lines.push(`## Conversion goal`);
  lines.push(b.conversionGoal);
  lines.push('');
  lines.push(`## Internal links to include`);
  if (b.internalLinksToInclude.length) for (const l of b.internalLinksToInclude) lines.push(`- [${l.anchor}](${l.target})`);
  else lines.push('- (none yet — add as the cluster grows)');
  lines.push('');
  lines.push(`## External sources to consider`);
  for (const s of b.externalSourceSuggestions) lines.push(`- ${s}`);
  lines.push('');
  lines.push(`## Evidence / integrity notes`);
  lines.push(b.evidenceNotes);
  lines.push('');
  lines.push(`## Marketing angle`);
  lines.push(b.marketingAngle || '(see Content Marketing Plan)');
  lines.push('');
  lines.push(`---`);
  lines.push(`_Strategic brief only — not an article draft. Do not mass-generate content; a human writes the page._`);
  return lines.join('\n');
}

export function exportBriefs(outDir: string, briefs: Brief[], pages: PlannedPage[]): string[] {
  const dir = join(outDir, 'briefs');
  mkdirSync(dir, { recursive: true });
  const byId = new Map(pages.map((p) => [p.pageId, p]));
  const files: string[] = [];
  for (const b of briefs) {
    const slug = b.suggestedUrl.replace(/^\/|\/$/g, '').replace(/\//g, '_') || b.pageId;
    const file = join(dir, `${slug}.md`);
    writeFileSync(file, briefMarkdown(b, byId.get(b.pageId)));
    files.push(file);
  }
  log.info('Markdown briefs export complete', { count: files.length, dir });
  return files;
}
