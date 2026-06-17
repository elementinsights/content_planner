/**
 * Shared HTTP helper for provider adapters: JSON fetch with retry/backoff and
 * cost charging. Charges the CostController BEFORE each network attempt so caps
 * are enforced even on retries.
 */
import { withRetry, retryNetworkOnly } from '../core/retry.ts';
import type { CostController } from '../core/cost.ts';

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  estUsd?: number;
  label?: string;
  cost: CostController;
  kind?: 'provider' | 'llm';
}

export async function httpJson<T = unknown>(url: string, opts: HttpOptions): Promise<T> {
  const { cost, estUsd = 0, label = 'http', kind = 'provider' } = opts;
  return withRetry(
    async () => {
      if (kind === 'llm') cost.chargeLlm(estUsd, label);
      else cost.chargeProvider(estUsd, label);
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(opts.headers ?? {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    },
    { label, shouldRetry: retryNetworkOnly },
  );
}
