/**
 * LLM cluster refinement (#2).
 *
 * The SERP-overlap pass (cluster.ts) decides WHICH keywords belong together — that
 * stays the data-driven backbone. This pass adds the JUDGMENT the mechanical rules
 * lack: it names each cluster like a human SEO would, and picks the best PILLAR
 * (the umbrella keyword the others support) instead of just "highest volume wins."
 *
 * It mutates the clustering result in place: cluster.name, cluster.hubKeyword, and
 * the per-keyword name map — which the taxonomy + content-map steps already read.
 * No-LLM or any batch error → mechanical names are kept (never worse than before).
 */
import type { KeywordRecord, IntakeResult } from '../core/types.ts';
import type { ClusteringResult } from './cluster.ts';
import type { AppConfig } from '../config/env.ts';
import type { CostController } from '../core/cost.ts';
import { callLlmJson } from '../providers/llm/llmClient.ts';
import { llmCreds } from '../intake/llmRelevance.ts';
import { titleCase, normalizeForMatch } from '../core/text.ts';
import { log } from '../core/logger.ts';

const BATCH = 15;
const MAX_KW_PER_CLUSTER = 25; // cap prompt size; highest-volume members are most informative

export async function refineClustersWithLLM(
  clustering: ClusteringResult,
  records: KeywordRecord[],
  intake: IntakeResult,
  cfg: AppConfig,
  cost: CostController,
): Promise<void> {
  const creds = llmCreds(cfg);
  if (!creds) {
    log.info('cluster refinement skipped (no LLM configured) — keeping mechanical names/pillars');
    return;
  }

  const volByKw = new Map(records.map((r) => [r.keyword, r.metrics.searchVolume ?? 0]));
  const recByKw = new Map(records.map((r) => [r.keyword, r]));
  // Valid top-level categories — the LLM must pick one verbatim; map back to slug/name.
  const catSlugByName = new Map(intake.initialCategories.map((c) => [normalizeForMatch(c.name), c.slug]));
  const catNameByNorm = new Map(intake.initialCategories.map((c) => [normalizeForMatch(c.name), c.name]));
  const categoryNames = intake.initialCategories.map((c) => c.name);
  // Only worth refining real clusters; singletons keep their mechanical label.
  const targets = clustering.clusters.filter((c) => c.memberKeywords.length >= 2);

  const system =
    `You are an SEO content architect for a website about "${intake.interpretedNiche}".\n` +
    `The site's top-level categories are: ${categoryNames.join(' | ')}.\n` +
    `Each item is a CLUSTER of keywords that share Google search intent — it becomes ONE hub page plus supporting pages.\n` +
    `For EACH cluster decide:\n` +
    `- "name": a concise, human hub-page topic name (Title Case, no leading "the/a", <= 6 words).\n` +
    `- "pillar": the SINGLE best umbrella/main-page keyword — the broadest, highest-value head term the others support. It need NOT be the highest volume if a better umbrella exists. It MUST be copied verbatim from that cluster's keyword list.\n` +
    `- "category": the single best-fit top-level category for this cluster, copied VERBATIM from the category list above.\n` +
    `Return ONLY JSON: {"clusters":[{"id":<id>,"name":"...","pillar":"<verbatim keyword>","category":"<verbatim category>"}]} with one object per id provided.`;

  let batches = 0, failures = 0, renamed = 0, repillared = 0, pillarRejected = 0, recategorized = 0;

  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const payload = chunk.map((c, idx) => ({
      id: idx,
      keywords: c.memberKeywords
        .slice()
        .sort((a, b) => (volByKw.get(b) ?? 0) - (volByKw.get(a) ?? 0))
        .slice(0, MAX_KW_PER_CLUSTER),
    }));
    try {
      const raw = (await callLlmJson({ ...creds, system, user: JSON.stringify(payload), cost })) as {
        clusters?: Array<{ id: number; name?: string; pillar?: string; category?: string }>;
      };
      const byId = new Map((raw.clusters ?? []).map((c) => [c.id, c]));
      for (let idx = 0; idx < chunk.length; idx++) {
        const cl = chunk[idx];
        const dec = byId.get(idx);
        if (!dec) continue;
        if (typeof dec.name === 'string' && dec.name.trim()) {
          const nm = titleCase(dec.name.trim());
          cl.name = nm;
          for (const k of cl.memberKeywords) clustering.clusterNameByKeyword.set(k, nm);
          renamed++;
        }
        // Pillar must be a real member of THIS cluster. Match tolerantly (accents/
        // punctuation/case), then fall back to a contains-match for minor drift; if
        // still no member matches, keep the mechanical hub and record the rejection.
        if (typeof dec.pillar === 'string' && dec.pillar.trim()) {
          const target = normalizeForMatch(dec.pillar);
          let match = cl.memberKeywords.find((k) => normalizeForMatch(k) === target);
          if (!match) {
            match = cl.memberKeywords.find((k) => {
              const nk = normalizeForMatch(k);
              return nk.includes(target) || target.includes(nk);
            });
          }
          if (match) {
            cl.hubKeyword = match;
            cl.pillarKeyword = match;
            repillared++;
          } else {
            pillarRejected++;
          }
        }

        // Category: assign the whole cluster (and its member keywords) to the
        // LLM-chosen top-level category — fixes the "everything in category #1" bug.
        if (typeof dec.category === 'string' && dec.category.trim()) {
          const norm = normalizeForMatch(dec.category);
          const slug = catSlugByName.get(norm);
          const name = catNameByNorm.get(norm);
          if (slug && name) {
            cl.category = name;
            for (const k of cl.memberKeywords) {
              const rec = recByKw.get(k);
              if (rec) rec.category = slug;
            }
            recategorized++;
          }
        }
      }
      batches++;
    } catch (err) {
      failures++;
      log.warn('cluster refinement batch failed; keeping mechanical name/pillar for these', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info('cluster refinement (LLM)', { clusters: targets.length, renamed, repillared, pillarRejected, recategorized, batches, failures });
}
