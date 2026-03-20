/**
 * In-memory cache with per-entry TTL.
 * Stored on the global object to persist across Next.js hot reloads in dev.
 *
 * TTL presets:
 *   QUOTE_TTL      60s  — real-time price / changePercent
 *   HISTORICAL_TTL  5m  — OHLCV history (changes only at market close)
 *   ANALYSIS_TTL    5m  — computed technical indicators
 *   AI_TTL         30m  — LLM verdict (same tech data → same output)
 */

export const TTL = {
  QUOTE:      60 * 1000,
  HISTORICAL:  5 * 60 * 1000,
  ANALYSIS:    5 * 60 * 1000,
  AI:         30 * 60 * 1000,
} as const;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __quoteCache: Map<string, CacheEntry> | undefined;
}

function getCache(): Map<string, CacheEntry> {
  if (!global.__quoteCache) {
    global.__quoteCache = new Map();
  }
  return global.__quoteCache;
}

export function getCachedQuote<T>(key: string): T | null {
  const cache = getCache();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCachedQuote(key: string, data: unknown, ttlMs: number = TTL.QUOTE): void {
  const cache = getCache();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateQuote(key: string): void {
  getCache().delete(key);
}

/** 給 /api/health 使用：回傳快取統計 */
export function getCacheStats(): { total: number; expired: number; active: number } {
  const cache = getCache();
  const now = Date.now();
  let expired = 0;
  for (const entry of cache.values()) {
    if (now > entry.expiresAt) expired++;
  }
  return { total: cache.size, expired, active: cache.size - expired };
}
