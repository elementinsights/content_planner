/**
 * Competitor research + gap analysis. Live mode: top pages, organic keywords, and
 * referring domains from the SEO provider, used to infer categories, content-type
 * mix, and gaps. Structural mode: clearly-labeled ASSUMPTIONS derived from intake
 * (no metrics, no fabricated competitor URLs) for the human to validate.
 *
 * We never copy competitor content or mirror their exact structure — competitor
 * data only informs market direction, category possibilities, and opportunity gaps.
 */
import type { IntakeResult } from '../core/types.ts';
import type { CompetitorPage } from '../providers/interfaces.ts';
import type { Providers } from '../providers/registry.ts';
import type { GeoLang } from '../providers/interfaces.ts';
import { log } from '../core/logger.ts';

export interface CompetitorAnalysis {
  domain: string;
  liveData: boolean;
  mainCategories: string[];
  topicalFocus: string;
  topPages: CompetitorPage[];
  rankingKeywordSample: string[];
  contentTypes: string[];
  commercialInformationalMix: string;
  gaps: string[];
  opportunities: string[];
  promotionPatterns: string[];
  notes: string;
}

export async function analyzeCompetitors(
  intake: IntakeResult,
  providers: Providers,
  geo: GeoLang,
): Promise<CompetitorAnalysis[]> {
  const out: CompetitorAnalysis[] = [];
  const liveProvider = providers.seo.find((p) => p.available && p.getCompetitorTopPages);

  for (const domain of intake.competitorDomains) {
    if (liveProvider) {
      log.step(`Analyzing competitor ${domain} (live)`);
      const topPages = (await liveProvider.getCompetitorTopPages!(domain, { ...geo, limit: 50 })) ?? [];
      const orgKw = liveProvider.getCompetitorOrganicKeywords
        ? await liveProvider.getCompetitorOrganicKeywords(domain, { ...geo, limit: 100 })
        : [];
      const commercial = orgKw.filter((k) => /best|review|vs|top|alternative|price/.test(k.keyword)).length;
      const ratio = orgKw.length ? commercial / orgKw.length : 0;
      out.push({
        domain,
        liveData: true,
        mainCategories: inferCategoriesFromUrls(topPages.map((p) => p.url)),
        topicalFocus: intake.interpretedNiche,
        topPages,
        rankingKeywordSample: orgKw.slice(0, 25).map((k) => k.keyword),
        contentTypes: inferContentTypes(topPages.map((p) => p.url)),
        commercialInformationalMix: `${Math.round(ratio * 100)}% commercial / ${Math.round((1 - ratio) * 100)}% informational (sampled)`,
        gaps: ['Validate against our cluster map: target their weak/missing long-tail and underserved subtopics.'],
        opportunities: ['Out-teach on weak SERP pages; build linkable assets they lack.'],
        promotionPatterns: [],
        notes: 'Live competitor data. Do not copy content or mirror structure — use for direction and gaps only.',
      });
    } else {
      out.push({
        domain,
        liveData: false,
        mainCategories: intake.initialCategories.map((c) => c.name),
        topicalFocus: intake.interpretedNiche,
        topPages: [],
        rankingKeywordSample: [],
        contentTypes: ['(assumed) guides, comparisons, tools — validate with Ahrefs Site Explorer'],
        commercialInformationalMix: 'UNKNOWN — requires live data (Ahrefs/DataForSEO). Not fabricated.',
        gaps: [
          'STRUCTURAL ASSUMPTION: target long-tail question + glossary gaps a broad competitor under-serves.',
          'Validate with Ahrefs Content Gap once a key is configured.',
        ],
        opportunities: [
          'Win weak long-tail SERPs first (no backlinks needed).',
          'Build templates/tools as linkable assets the competitor lacks.',
        ],
        promotionPatterns: ['UNKNOWN — requires crawl/live data.'],
        notes: 'STRUCTURAL MODE: assumptions only, no live metrics. Configure a provider to replace with real data.',
      });
    }
  }
  if (out.length === 0) {
    log.info('No competitor domains supplied; skipping competitor analysis.');
  }
  return out;
}

function inferCategoriesFromUrls(urls: string[]): string[] {
  const segs = new Map<string, number>();
  for (const u of urls) {
    try {
      const path = new URL(u.startsWith('http') ? u : `https://${u}`).pathname;
      const first = path.split('/').filter(Boolean)[0];
      if (first && !/\.(html?|php)$/.test(first)) segs.set(first, (segs.get(first) ?? 0) + 1);
    } catch {
      /* ignore */
    }
  }
  return [...segs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
}

function inferContentTypes(urls: string[]): string[] {
  const types = new Set<string>();
  for (const u of urls) {
    const s = u.toLowerCase();
    if (/best|top|review|vs|alternative/.test(s)) types.add('comparison/commercial');
    if (/how-to|guide|what-is|tips/.test(s)) types.add('informational guide');
    if (/template|checklist|tool|calculator/.test(s)) types.add('tool/template');
    if (/glossary|definition|what-is/.test(s)) types.add('glossary');
  }
  return types.size ? [...types] : ['mixed'];
}
