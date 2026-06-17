/**
 * Astro exporter (StaticSiteExporter). Emits planning artifacts ONLY — never
 * publishes content:
 *   - astro-content-manifest.json: per-collection entries (route, filename,
 *     frontmatter, brief path, internal links)
 *   - astro-frontmatter-export.json: frontmatter keyed by target filename
 *   - content.config.ts.suggested: a ready-to-adapt Astro collections config
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StaticSiteExporter } from '../providers/interfaces.ts';
import type { PlannedPage } from '../core/types.ts';
import { collectionForType } from '../planning/astroPlan.ts';
import { log } from '../core/logger.ts';

const CONTENT_CONFIG_SUGGESTED = `// SUGGESTED Astro content collections config — adapt to your project.
// This is a planning suggestion; the planner never writes into your site.
import { defineCollection, z } from 'astro:content';

const seoFields = {
  title: z.string(),
  description: z.string(),
  slug: z.string().optional(),
  draft: z.boolean().default(true),
  category: z.string(),
  subcategory: z.string().optional(),
  cluster: z.string().optional(),
  subcluster: z.string().optional(),
  pageType: z.string(),
  pillarHubSpokeRole: z.string(),
  searchIntent: z.string(),
  funnelStage: z.string(),
  primaryKeyword: z.string(),
  secondaryKeywords: z.array(z.string()).default([]),
  parentTopic: z.string().nullable().optional(),
  searchVolume: z.number().nullable().optional(),
  trafficPotential: z.number().nullable().optional(),
  keywordDifficulty: z.number().nullable().optional(),
  priorityScore: z.number().optional(),
  internalLinks: z.array(z.string()).default([]),
  externalSources: z.array(z.string()).default([]),
  publishPhase: z.number().optional(),
  marketingAngle: z.string().optional(),
  humanReviewStatus: z.string().default('pending'),
  lastReviewed: z.string().nullable().optional(),
};

const make = () => defineCollection({ type: 'content', schema: z.object(seoFields) });

export const collections = {
  articles: make(),
  hubs: make(),
  comparisons: make(),
  glossary: make(),
  tools: make(),
  templates: make(),
  briefs: defineCollection({ type: 'content', schema: z.object({ ...seoFields, briefFor: z.string().optional() }) }),
};

// Suggested generated route: src/pages/[...slug].astro that getStaticPaths() over
// all collections and renders by slug. Keep URL depth shallow (<=2 segments).
`;

export class AstroContentExporter implements StaticSiteExporter {
  readonly name = 'astro-content-exporter';

  async exportManifest(outDir: string, pages: PlannedPage[]): Promise<{ files: string[] }> {
    const dir = join(outDir, 'astro');
    mkdirSync(dir, { recursive: true });
    const files: string[] = [];

    const collections: Record<string, unknown[]> = {};
    const frontmatterByFile: Record<string, unknown> = {};
    for (const p of pages) {
      const coll = collectionForType(p.pageType);
      (collections[coll] ??= []).push({
        slug: p.slug,
        route: p.astroRoute,
        urlPath: p.urlPath,
        collection: p.astroCollection,
        filename: p.markdownFilename,
        pageType: p.pageType,
        role: p.role,
        briefFilepath: `src/content/briefs/${p.slug}.md`,
        internalLinks: p.internalLinksOut.map((l) => l.targetUrlPath),
        frontmatter: p.frontmatter,
      });
      frontmatterByFile[p.markdownFilename] = p.frontmatter;
    }

    const manifest = {
      note: 'Astro planning manifest. The planner does NOT publish content. Use these as scaffolding targets.',
      generatedRoutePattern: 'src/pages/[...slug].astro (getStaticPaths over collections)',
      collections,
    };
    const f1 = join(dir, 'astro-content-manifest.json');
    writeFileSync(f1, JSON.stringify(manifest, null, 2));
    files.push(f1);

    const f2 = join(dir, 'astro-frontmatter-export.json');
    writeFileSync(f2, JSON.stringify(frontmatterByFile, null, 2));
    files.push(f2);

    const f3 = join(dir, 'content.config.ts.suggested');
    writeFileSync(f3, CONTENT_CONFIG_SUGGESTED);
    files.push(f3);

    log.info('Astro manifest export complete', { collections: Object.keys(collections), files: files.length });
    return { files };
  }
}

export async function exportAstro(outDir: string, pages: PlannedPage[]): Promise<string[]> {
  const exp = new AstroContentExporter();
  const { files } = await exp.exportManifest(outDir, pages);
  return files;
}
