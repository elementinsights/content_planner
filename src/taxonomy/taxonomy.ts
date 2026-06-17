/**
 * Category/taxonomy planner. Builds 3-5 top-level categories (per the
 * brand-new-site default), their subcategories, primary intent, and a simple,
 * shallow URL folder structure. Avoids category sprawl.
 */
import type { Taxonomy, Category, IntakeResult, Cluster, SearchIntent } from '../core/types.ts';
import { slugify, uniq } from '../core/text.ts';
import { DEFAULT_CATEGORY_MIN, DEFAULT_CATEGORY_MAX } from '../config/defaults.ts';

export function buildTaxonomy(intake: IntakeResult, clusters: Cluster[]): Taxonomy {
  const cats = intake.initialCategories.slice(0, DEFAULT_CATEGORY_MAX);
  if (cats.length < DEFAULT_CATEGORY_MIN) {
    // Should not happen (intake guarantees >=3) but keep the contract safe.
  }
  const clustersByCat = new Map<string, Cluster[]>();
  for (const cl of clusters) {
    (clustersByCat.get(cl.category) ?? clustersByCat.set(cl.category, []).get(cl.category)!).push(cl);
  }

  const categories: Category[] = cats.map((c) => {
    const primaryIntent: SearchIntent = c.intentMix.commercial > c.intentMix.informational ? 'commercial' : 'informational';
    // Subcategories: intake seeds + any cluster-derived subcategories, deduped.
    const subFromClusters = (clustersByCat.get(c.name) ?? []).slice(0, 4).map((cl) => cl.name);
    const subNames = uniq([...c.subcategories, ...subFromClusters]).slice(0, 6);
    return {
      name: c.name,
      slug: c.slug,
      rationale: c.rationale,
      primaryIntent,
      subcategories: subNames.map((n) => ({ name: n, slug: slugify(n) })),
    };
  });

  const urlFolderStructure = uniq([
    '/',
    ...categories.map((c) => `/${c.slug}/`),
    '/glossary/',
    '/compare/',
    '/templates/',
    '/tools/',
  ]);

  return { categories, urlFolderStructure };
}
