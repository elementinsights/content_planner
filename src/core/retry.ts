/**
 * Retry with exponential backoff + jitter. Used by all network provider adapters.
 */
import { log } from './logger.ts';

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  /** Return true to retry, false to fail fast (e.g. 4xx auth errors). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  label?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 400;
  const maxMs = opts.maxMs ?? 8000;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err, attempt)) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      log.warn(`retrying ${opts.label ?? 'operation'}`, {
        attempt: attempt + 1,
        of: retries,
        waitMs: Math.round(jitter),
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(jitter);
    }
  }
  throw lastErr;
}

/** Common predicate: retry network/5xx, fail fast on auth/4xx. */
export function retryNetworkOnly(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(401|403|400|404|422)\b/.test(msg)) return false;
  return true;
}
