/**
 * Google service-account auth. Lazy-imports google-auth-library so the rest of
 * the system runs even if it is not installed. Returns a short-lived OAuth2
 * access token for the requested scopes.
 */
import { readFileSync } from 'node:fs';
import { log } from '../../core/logger.ts';

export interface ServiceAccountCreds {
  clientEmail: string;
  privateKey: string;
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function getGoogleAccessToken(creds: ServiceAccountCreds, scopes: string[]): Promise<string> {
  const cacheKey = creds.clientEmail + '::' + scopes.join(',');
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;

  let JWT: any;
  try {
    ({ JWT } = await import('google-auth-library'));
  } catch {
    throw new Error(
      "google-auth-library is not installed. Run `npm i google-auth-library` to enable Google Sheets / GSC / GA4 live calls.",
    );
  }
  const privateKey = creds.privateKey.replace(/\\n/g, '\n');
  const client = new JWT({ email: creds.clientEmail, key: privateKey, scopes });
  const res = await client.getAccessToken();
  const token = typeof res === 'string' ? res : res?.token;
  if (!token) throw new Error('Failed to obtain Google access token');
  // Service-account tokens last ~1h.
  tokenCache.set(cacheKey, { token, exp: now + 55 * 60_000 });
  log.debug('obtained google access token', { scopes });
  return token;
}

export function resolveServiceAccount(opts: {
  clientEmail?: string;
  privateKey?: string;
  credentialsPath?: string;
}): ServiceAccountCreds | null {
  if (opts.clientEmail && opts.privateKey) {
    return { clientEmail: opts.clientEmail, privateKey: opts.privateKey };
  }
  if (opts.credentialsPath) {
    try {
      const json = JSON.parse(readFileSync(opts.credentialsPath, 'utf8'));
      if (json.client_email && json.private_key) {
        return { clientEmail: json.client_email, privateKey: json.private_key };
      }
    } catch (err) {
      log.warn('failed to read GOOGLE_APPLICATION_CREDENTIALS', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
