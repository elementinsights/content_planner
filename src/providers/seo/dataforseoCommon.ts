/**
 * Shared DataForSEO helpers: basic-auth header + location/language mapping.
 * DataForSEO uses numeric location codes; we map common geos and default to US.
 */
export function dfsAuthHeader(login: string, password: string): string {
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

const LOCATION_CODES: Record<string, number> = {
  us: 2840,
  gb: 2826,
  uk: 2826,
  ca: 2124,
  au: 2036,
  in: 2356,
  de: 2276,
  fr: 2250,
  es: 2724,
  it: 2380,
  nl: 2528,
  br: 2076,
};

export function locationCode(geo: string): number {
  return LOCATION_CODES[geo.toLowerCase()] ?? 2840;
}

export function languageCode(language: string): string {
  return (language || 'en').toLowerCase().slice(0, 2);
}

export function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : null;
}
