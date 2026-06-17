/**
 * Google Search Console provider — POST-LAUNCH feedback layer only.
 * Present from the start (interface required), but used to improve future
 * planning after pages exist and have GSC history. With no credentials it is
 * unavailable and returns no rows.
 */
import type { SearchConsoleProvider, GscRow } from '../interfaces.ts';
import type { CostController } from '../../core/cost.ts';
import { httpJson } from '../http.ts';
import { log } from '../../core/logger.ts';
import { getGoogleAccessToken } from '../google/auth.ts';

export class GoogleSearchConsoleProvider implements SearchConsoleProvider {
  readonly name = 'google-search-console';
  readonly available: boolean;
  constructor(
    private credentialsJson: string | undefined,
    private cost: CostController,
  ) {
    this.available = !!credentialsJson;
  }

  async getPerformance(siteUrl: string, opts: { startDate: string; endDate: string }): Promise<GscRow[]> {
    if (!this.available || !this.credentialsJson) return [];
    try {
      const creds = JSON.parse(this.credentialsJson);
      const token = await getGoogleAccessToken(
        { clientEmail: creds.client_email, privateKey: creds.private_key },
        ['https://www.googleapis.com/auth/webmasters.readonly'],
      );
      const res = await httpJson<any>(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: { startDate: opts.startDate, endDate: opts.endDate, dimensions: ['query', 'page'], rowLimit: 5000 },
          estUsd: 0,
          label: 'gsc.query',
          cost: this.cost,
        },
      );
      return (res.rows ?? []).map((r: any) => ({
        query: r.keys?.[0] ?? '',
        page: r.keys?.[1] ?? '',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));
    } catch (err) {
      log.warn('GSC query failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
}
