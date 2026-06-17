/**
 * Hybrid clustering. Combines (in priority order): Ahrefs Parent Topic when
 * available, category fit, keyword modifiers, search intent, and token/semantic
 * similarity of the residual "core" phrase. Produces clusters + per-keyword
 * cluster assignment, an importance signal (cluster centrality), and a
 * completeness signal (page-type diversity within the cluster).
 *
 * SERP-overlap and embedding similarity are supported as additional signals when
 * live SERP / embeddings are present; in structural mode the core-phrase grouping
 * is the backbone.
 */
import type { KeywordRecord, Cluster, IntakeResult } from '../core/types.ts';
import { clusterId } from '../core/ids.ts';
import { contentTokens, titleCase, uniq } from '../core/text.ts';

const MODIFIER_TOKENS = new Set([
  'how', 'to', 'guide', 'what', 'is', 'are', 'why', 'when', 'where', 'who', 'which', 'does', 'do',
  'best', 'top', 'free', 'cheap', 'cheapest', 'review', 'reviews', 'vs', 'or', 'compared',
  'examples', 'example', 'tips', 'ideas', 'mistakes', 'template', 'templates', 'checklist',
  'calculator', 'generator', 'worksheet', 'for', 'beginners', 'definition', 'meaning', 'explained',
  'alternatives', 'alternative', 'pricing', 'cost', 'faq', 'basics', 'fundamentals', 'overview',
  'strategy', 'strategies', 'worth', 'it', 'much', 'long', 'use', 'choose', 'start', 'need',
  'difference', 'between', 'rated', 'cheat', 'sheet', 'comparison', 'and',
]);

/** Strip modifier tokens to a stable "core" phrase (e.g. "x definition" -> "x"). */
export function corePhrase(keyword: string): string {
  const core = contentTokens(keyword).filter((t) => !MODIFIER_TOKENS.has(t));
  return (core.length ? core : contentTokens(keyword)).join(' ');
}

/** Clustering key: prefer Ahrefs Parent Topic, else the residual core phrase. */
function coreKey(rec: KeywordRecord): string {
  if (rec.metrics.parentTopic) return rec.metrics.parentTopic.toLowerCase().trim();
  return corePhrase(rec.keyword);
}

export interface ClusteringResult {
  clusters: Cluster[];
  clusterIdByKeyword: Map<string, string>;
  clusterNameByKeyword: Map<string, string>;
  subclusterByKeyword: Map<string, string>;
  importanceByKeyword: Map<string, number>;
}

const SERP_OVERLAP_MIN_SHARED = 3;

/**
 * SERP-overlap clustering — the DataForSEO replacement for Ahrefs Parent Topic.
 * Two keywords are the SAME page if their top-10 SERPs share >= minShared URLs.
 * Edges are constrained to the same category to keep the taxonomy coherent.
 * Returns keyword -> group id, only for components with >= 2 members. Keywords
 * without live SERP data are absent (they fall back to lexical core-phrase grouping).
 */
export function serpOverlapGroups(records: KeywordRecord[], minShared = SERP_OVERLAP_MIN_SHARED): Map<string, number> {
  const withSerp = records.filter((r) => r.serp && r.serp.liveData && r.serp.results.length >= minShared);
  const urls = new Map<string, Set<string>>();
  for (const r of withSerp) urls.set(r.keyword, new Set(r.serp!.results.slice(0, 10).map((x) => x.url).filter(Boolean)));

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const r of withSerp) parent.set(r.keyword, r.keyword);

  for (let i = 0; i < withSerp.length; i++) {
    for (let j = i + 1; j < withSerp.length; j++) {
      const a = withSerp[i];
      const b = withSerp[j];
      if (a.category !== b.category) continue;
      const ua = urls.get(a.keyword)!;
      const ub = urls.get(b.keyword)!;
      let shared = 0;
      for (const u of ua) if (ub.has(u)) shared++;
      if (shared >= minShared) union(a.keyword, b.keyword);
    }
  }

  const comp = new Map<string, string[]>();
  for (const r of withSerp) {
    const root = find(r.keyword);
    (comp.get(root) ?? comp.set(root, []).get(root)!).push(r.keyword);
  }
  const groupOf = new Map<string, number>();
  let gid = 0;
  for (const [, members] of comp) {
    if (members.length >= 2) {
      const id = gid++;
      for (const m of members) groupOf.set(m, id);
    }
  }
  return groupOf;
}

/** Hub keyword = highest-volume member (Parent-Topic style); fallback to shortest informational. */
function highestVolumeMember(members: KeywordRecord[]): KeywordRecord {
  const withVol = members.filter((m) => typeof m.metrics.searchVolume === 'number');
  if (withVol.length) return withVol.slice().sort((a, b) => (b.metrics.searchVolume ?? 0) - (a.metrics.searchVolume ?? 0))[0];
  const informational = members.filter((m) => m.intent === 'informational');
  return (informational.length ? informational : members).slice().sort((a, b) => a.keyword.length - b.keyword.length)[0];
}

export function clusterKeywords(records: KeywordRecord[], intake: IntakeResult): ClusteringResult {
  const catName = new Map(intake.initialCategories.map((c) => [c.slug, c.name]));
  // Hybrid grouping: live SERP-overlap groups take precedence; else lexical core phrase.
  const serpGroups = serpOverlapGroups(records);
  const groups = new Map<string, KeywordRecord[]>();
  for (const rec of records) {
    const key = serpGroups.has(rec.keyword) ? `serp:${serpGroups.get(rec.keyword)}` : `${rec.category}::${coreKey(rec)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(rec);
  }

  // Merge tiny clusters (1 member) up to a category "general" cluster to avoid sprawl.
  const clusters: Cluster[] = [];
  const clusterIdByKeyword = new Map<string, string>();
  const clusterNameByKeyword = new Map<string, string>();
  const subclusterByKeyword = new Map<string, string>();
  const importanceByKeyword = new Map<string, number>();

  const maxSize = Math.max(1, ...[...groups.values()].map((g) => g.length));
  const catGeneral = new Map<string, KeywordRecord[]>();

  for (const [key, members] of groups) {
    if (members.length < 2) {
      const catSlug = key.startsWith('serp:') ? members[0].category : key.split('::')[0];
      const g = catGeneral.get(catSlug) ?? catGeneral.set(catSlug, []).get(catSlug)!;
      g.push(...members);
      continue;
    }
    let catSlug: string;
    let core: string;
    if (key.startsWith('serp:')) {
      catSlug = members[0].category; // SERP edges are within-category
      core = corePhrase(highestVolumeMember(members).keyword) || members[0].keyword;
    } else {
      [catSlug, core] = key.split('::');
    }
    clusters.push(buildCluster(catSlug, core, members, catName, maxSize, intake, { clusterIdByKeyword, clusterNameByKeyword, subclusterByKeyword, importanceByKeyword }));
  }
  for (const [catSlug, members] of catGeneral) {
    if (members.length === 0) continue;
    clusters.push(buildCluster(catSlug, `${catName.get(catSlug) ?? catSlug} essentials`, members, catName, maxSize, intake, { clusterIdByKeyword, clusterNameByKeyword, subclusterByKeyword, importanceByKeyword }));
  }

  return { clusters, clusterIdByKeyword, clusterNameByKeyword, subclusterByKeyword, importanceByKeyword };
}

function buildCluster(
  catSlug: string,
  core: string,
  members: KeywordRecord[],
  catName: Map<string, string>,
  maxSize: number,
  intake: IntakeResult,
  maps: {
    clusterIdByKeyword: Map<string, string>;
    clusterNameByKeyword: Map<string, string>;
    subclusterByKeyword: Map<string, string>;
    importanceByKeyword: Map<string, number>;
  },
): Cluster {
  const name = titleCase(core);
  const id = clusterId(`${catSlug}-${core}`);
  const importance = Math.min(1, members.length / Math.max(8, maxSize));
  const pageTypes = uniq(members.map((m) => m.modifier).filter(Boolean) as string[]);
  const completeness = Math.min(1, pageTypes.length / 6);
  const subclusters: Record<string, string[]> = {};

  for (const m of members) {
    const sub = m.intent; // subcluster by intent as a stable default
    (subclusters[sub] ??= []).push(m.keyword);
    maps.clusterIdByKeyword.set(m.keyword, id);
    maps.clusterNameByKeyword.set(m.keyword, name);
    maps.subclusterByKeyword.set(m.keyword, titleCase(sub));
    maps.importanceByKeyword.set(m.keyword, importance);
  }

  // hub keyword = highest-volume member (Parent-Topic style); lexical fallback inside.
  const hub = highestVolumeMember(members);

  return {
    id,
    name,
    category: catName.get(catSlug) ?? catSlug,
    subcategory: '',
    intent: members[0].intent,
    pillarKeyword: null,
    hubKeyword: hub?.keyword ?? null,
    memberKeywords: members.map((m) => m.keyword),
    subclusters,
    completeness,
  };
}
