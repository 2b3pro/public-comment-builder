import Redis from 'ioredis';

// Redis connection - prefers KV_URL (Vercel) or REDIS_URL, otherwise undefined
const REDIS_URL = process.env.KV_URL || process.env.REDIS_URL;

// Singleton Redis client
let redisClient: Redis | null = null;
let isRedisDisabled = false;

/**
 * Get the Redis client instance (singleton pattern).
 * Returns null if Redis is not configured or available.
 */
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  if (isRedisDisabled) return null;

  if (!REDIS_URL) {
    // No Redis configured, disable silently
    isRedisDisabled = true;
    console.log('[redis] No REDIS_URL or KV_URL found. Caching disabled.');
    return null;
  }

  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1, // Fail fast on Vercel functions
      connectTimeout: 2000,    // Fail fast
      retryStrategy: (times) => {
        if (times > 2) {
          console.warn('[redis] Connection failed, disabling Redis.');
          isRedisDisabled = true;
          return null; // Stop retrying
        }
        return 1000; // Retry after 1s
      },
      lazyConnect: true, // Don't connect until used
    });

    redisClient.on('error', (err) => {
      // Suppress noisy connection errors if we can't connect
      if (!isRedisDisabled) {
        console.warn('[redis] Connection error:', err.message);
      }
    });

    // Handle initial connection failure explicitly for lazyConnect
    redisClient.connect().catch(() => {
      isRedisDisabled = true;
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    console.warn('[redis] Failed to create client:', error);
    isRedisDisabled = true;
    return null;
  }
}

// ============================================================
// CACHE KEY GENERATORS
// ============================================================

/**
 * Generate cache key for dashboard dockets (daily).
 */
export function getDashboardCacheKey(): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `dashboard:${today}`;
}

/**
 * Generate cache key for individual docket content.
 */
export function getDocketCacheKey(docketId: string): string {
  return `docket:${docketId}`;
}

/**
 * Generate cache key for search results (daily + query).
 */
export function getSearchCacheKey(query: string): string {
  const today = new Date().toISOString().split('T')[0];
  const normalizedQuery = query.toLowerCase().trim();
  return `search:${today}:${normalizedQuery}`;
}

/**
 * Generate cache key for AI analysis of a docket.
 */
export function getAnalysisCacheKey(docketId: string): string {
  return `analysis:${docketId}`;
}

// ============================================================
// CACHE TTL (Time To Live) in seconds
// ============================================================

export const CACHE_TTL = {
  DASHBOARD: 24 * 60 * 60,     // 24 hours for dashboard
  DOCKET: 7 * 24 * 60 * 60,    // 7 days for docket content (rarely changes)
  SEARCH: 24 * 60 * 60,        // 24 hours for search results
  ANALYSIS: 7 * 24 * 60 * 60,  // 7 days for AI analysis results
};

// ============================================================
// CACHE OPERATIONS
// ============================================================

/**
 * Get cached data from Redis.
 * Returns null if not found or Redis unavailable.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (data) {
      console.log(`[redis] Cache HIT: ${key}`);
      return JSON.parse(data) as T;
    }
    console.log(`[redis] Cache MISS: ${key}`);
    return null;
  } catch (error) {
    console.warn(`[redis] Error getting ${key}:`, error);
    return null;
  }
}

/**
 * Set cached data in Redis with TTL.
 */
export async function setCached<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data));
    console.log(`[redis] Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
  } catch (error) {
    console.warn(`[redis] Error setting ${key}:`, error);
  }
}

/**
 * Delete cached data from Redis.
 */
export async function deleteCached(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
    console.log(`[redis] Cache DEL: ${key}`);
  } catch (error) {
    console.warn(`[redis] Error deleting ${key}:`, error);
  }
}

/**
 * Utility to check if Redis is available.
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}
