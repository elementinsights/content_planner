/**
 * Internal-link planner. Plans the link graph BEFORE content exists, using the
 * hub-and-spoke model: pillar<->hub, hub<->spoke, spoke->pillar, sibling spokes,
 * informational->commercial, commercial->support, glossary/support->hub. Sets
 * internalLinksIn/Out + suggested anchors (with variants) and Astro route refs.
 * Respects intent mismatch (won't link BOFU commercial up into unrelated TOFU).
 */
import type { PlannedPage, InternalLinkRef, PageRole } from '../core/types.ts';
import { corePhrase } from '../clustering/cluster.ts';
import { titleCase, uniq } from '../core/text.ts';

const MAX_OUT = 10;

function anchorsFor(to: PlannedPage): string[] {
  const core = corePhrase(to.primaryKeyword) || to.primaryKeyword;
  return uniq([to.primaryKeyword, core, `${titleCase(core)} guide`, `learn more about ${core}`]).slice(0, 4);
}

export function planInternalLinks(pages: PlannedPage[]): void {
  const byCluster = new Map<string, PlannedPage[]>();
  for (const p of pages) {
    (byCluster.get(p.cluster) ?? byCluster.set(p.cluster, []).get(p.cluster)!).push(p);
  }
  const pillars = pages.filter((p) => p.role === 'pillar');
  const categoryHubs = pages.filter((p) => p.pageType === 'category-hub');

  const link = (from: PlannedPage, to: PlannedPage, linkType: InternalLinkRef['linkType'], priority: InternalLinkRef['priority']) => {
    if (from.pageId === to.pageId) return;
    if (from.internalLinksOut.length >= MAX_OUT && priority === 'optional') return;
    if (from.internalLinksOut.some((l) => l.targetPageId === to.pageId)) return;
    // Intent mismatch guard: don't push BOFU/transactional pages UP into TOFU info pages.
    if (from.funnelStage === 'BOFU' && to.funnelStage === 'TOFU' && to.searchIntent === 'informational' && linkType === 'sibling') return;
    const anchors = anchorsFor(to);
    from.internalLinksOut.push({
      targetPageId: to.pageId,
      targetUrlPath: to.urlPath,
      targetAstroRoute: to.astroRoute,
      anchor: anchors[0],
      linkType,
      priority,
    });
    from.anchorText = uniq([...from.anchorText, ...anchors]).slice(0, 12);
    to.internalLinksIn.push({
      targetPageId: from.pageId,
      targetUrlPath: from.urlPath,
      targetAstroRoute: from.astroRoute,
      anchor: anchors[0],
      linkType,
      priority,
    });
  };

  for (const [, clusterPages] of byCluster) {
    const hub =
      clusterPages.find((p) => p.pageType === 'sub-hub') ??
      clusterPages.find((p) => p.pageType === 'category-hub') ??
      clusterPages.slice().sort((a, b) => b.priorityScore - a.priorityScore)[0];
    const spokes = clusterPages.filter((p) => p.pageId !== hub.pageId);
    const commercial = clusterPages.filter((p) => p.pageType === 'commercial' || p.pageType === 'comparison');
    const support = clusterPages.filter((p) => p.role === 'support' || p.pageType === 'glossary');

    // hub <-> spokes
    let hubOut = 0;
    for (const s of spokes) {
      if (hubOut < MAX_OUT + 4) {
        link(hub, s, 'hub->spoke', 'required');
        hubOut++;
      }
      link(s, hub, 'spoke->hub', 'required');
    }
    // sibling spokes (a couple each, optional)
    for (let i = 0; i < spokes.length; i++) {
      link(spokes[i], spokes[(i + 1) % spokes.length], 'sibling', 'optional');
    }
    // informational -> commercial
    if (commercial.length) {
      for (const s of spokes) {
        if (s.searchIntent === 'informational' && s.pageType !== 'commercial') {
          link(s, commercial[0], 'info->commercial', 'recommended');
        }
      }
      // commercial -> support
      if (support.length) for (const c of commercial) link(c, support[0], 'commercial->support', 'recommended');
    }
    // glossary/support -> hub
    for (const sp of support) link(sp, hub, 'support->hub', 'recommended');
  }

  // category-hub <-> pillar
  const pillar = pillars[0];
  if (pillar) {
    for (const ch of categoryHubs) {
      link(ch, pillar, 'hub->pillar', 'required');
      link(pillar, ch, 'pillar->hub', 'required');
    }
    // a few spokes -> pillar (deep authority funnels)
    for (const p of pages.filter((x) => x.role === 'spoke').slice(0, 30)) {
      link(p, pillar, 'spoke->pillar', 'optional');
    }
  }

  // Reflect primary outbound anchors into frontmatter.internalLinks for Astro.
  for (const p of pages) {
    (p.frontmatter as Record<string, unknown>).internalLinks = p.internalLinksOut.slice(0, 8).map((l) => l.targetUrlPath);
  }
}
