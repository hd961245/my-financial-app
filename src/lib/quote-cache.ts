/**
 * In-memory quote cache with 60-second TTL.
 * Stored on the global object to persist across Next.js hot reloads in dev.
 */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

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

export function setCachedQuote(key: string, data: unknown): void {
  const cache = getCache();
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateQuote(key: string): void {
  getCache().delete(key);
}
