/**
 * Google Analytics 4 provider — POST-LAUNCH feedback layer only.
 * Interface present from the start; used after pages exist. Unavailable without
 * GA4_PROPERTY_ID + credentials.
 */
import type { AnalyticsProvider, Ga4Row } from '../interfaces.ts';
import type { CostController } from '../../core/cost.ts';
import { httpJson } from '../http.ts';
import { log } from '../../core/logger.ts';
import { getGoogleAccessToken } from '../google/auth.ts';

export class GoogleAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'google-analytics-4';
  readonly available: boolean;
  constructor(
    private propertyId: string | undefined,
    private credentialsJson: string | undefined,
    private cost: CostController,
  ) {
    this.available = !!(propertyId && credentialsJson);
  }

  async getPageMetrics(opts: { startDate: string; endDate: string }): Promise<Ga4Row[]> {
    if (!this.available || !this.credentialsJson || !this.propertyId) return [];
    try {
      const creds = JSON.parse(this.credentialsJson);
      const token = await getGoogleAccessToken(
        { clientEmail: creds.client_email, privateKey: creds.private_key },
        ['https://www.googleapis.com/auth/analytics.readonly'],
      );
      const res = await httpJson<any>(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: {
            dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'conversions' }],
            limit: 5000,
          },
          estUsd: 0,
          label: 'ga4.runReport',
          cost: this.cost,
        },
      );
      return (res.rows ?? []).map((r: any) => ({
        pagePath: r.dimensionValues?.[0]?.value ?? '',
        sessions: Number(r.metricValues?.[0]?.value ?? 0),
        engagedSessions: Number(r.metricValues?.[1]?.value ?? 0),
        conversions: Number(r.metricValues?.[2]?.value ?? 0),
      }));
    } catch (err) {
      log.warn('GA4 report failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
}
