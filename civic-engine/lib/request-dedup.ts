/**
 * Request Deduplication (Promise Coalescing)
 *
 * Prevents duplicate in-flight requests by tracking pending promises.
 * If a request is already in-flight for a key, return the same promise
 * instead of starting a new request.
 */

// Map of key -> pending promise
const pendingRequests = new Map<string, Promise<unknown>>();

/**
 * Execute a function with deduplication by key.
 * If a request with the same key is already in-flight, return that promise.
 * Otherwise, execute the function and track the promise until completion.
 *
 * @param key Unique identifier for the request (e.g., "analysis:FDA-2023-D-0001")
 * @param fn The async function to execute
 * @returns The result of the function
 */
export async function deduplicatedRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if request is already in-flight
  const existing = pendingRequests.get(key);
  if (existing) {
    console.log(`[request-dedup] Coalescing request for key: ${key}`);
    return existing as Promise<T>;
  }

  // Create new request and track it
  console.log(`[request-dedup] Starting new request for key: ${key}`);
  const promise = fn()
    .then((result) => {
      // Clean up on success
      pendingRequests.delete(key);
      console.log(`[request-dedup] Completed request for key: ${key}`);
      return result;
    })
    .catch((error) => {
      // Clean up on error too
      pendingRequests.delete(key);
      console.log(`[request-dedup] Failed request for key: ${key}`);
      throw error;
    });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * Check if a request is currently in-flight for a key.
 */
export function isRequestPending(key: string): boolean {
  return pendingRequests.has(key);
}

/**
 * Get count of pending requests (for monitoring/debugging).
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Clear all pending requests (for testing/reset).
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}
