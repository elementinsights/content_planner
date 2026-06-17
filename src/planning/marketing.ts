/**
 * Marketing pass. Uses the MarketingPlanningProvider to build per-page promotion
 * plans and writes the page-level marketing fields (channels, priority, angle).
 */
import type { PlannedPage, MarketingPlanItem } from '../core/types.ts';
import type { MarketingPlanningProvider } from '../providers/interfaces.ts';

export function planMarketing(pages: PlannedPage[], provider: MarketingPlanningProvider): MarketingPlanItem[] {
  const items: MarketingPlanItem[] = [];
  for (const p of pages) {
    const item = provider.planForPage(p);
    p.promotionChannels = item.promotionChannels;
    p.contentMarketingPriority = item.priority;
    (p.frontmatter as Record<string, unknown>).marketingAngle = item.socialPostAngles[0] ?? '';
    items.push(item);
  }
  return items;
}
