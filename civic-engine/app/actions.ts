'use server';

import { regulationsApi, DocketSummary, buildDocketTextForAnalysis, fetchFederalRegisterContent } from '@/lib/regulations-api';
import {
  analyzeDocket,
  regenerateReasonCard,
  generateFinalComment,
  DocketAnalysis,
  Position,
  ReasonCard,
  ArgumentOption,
  CommentingInstructions,
  // Legacy exports
  generateArgumentsWithAI,
  ArgumentCategory
} from '@/lib/ai-generator';
import {
  getCached,
  setCached,
  deleteCached,
  getDashboardCacheKey,
  getDocketCacheKey,
  getSearchCacheKey,
  getAnalysisCacheKey,
  CACHE_TTL
} from '@/lib/redis';
import { revalidatePath } from 'next/cache';
import {
  recordCommentGenerated,
  getDocketCommentCount as getDbDocketCommentCount,
  getDocketCommentCounts as getDbDocketCommentCounts,
  getTopRecentDockets as getDbTopRecentDockets,
  getAdminStats as getDbAdminStats,
  AdminStats
} from '@/lib/stats-db';
import { deduplicatedRequest } from '@/lib/request-dedup';
import {
  getAnalysisFromDb,
  setAnalysisInDb,
  deleteAnalysisFromDb,
  getDocketTextFromDb,
  setDocketTextInDb,
  getCachedDocketIds
} from '@/lib/analysis-cache';

// ============================================================
// DOCKET TEXT FETCHING (Three-tier cache: Redis → SQLite → API)
// ============================================================

interface DocketTextResult {
  text: string;
  objectType: 'document' | 'docket';
}

/**
 * Fetch the full text content of a docket/document for AI analysis.
 * Uses a three-tier caching strategy:
 * 1. Redis (fast, volatile) - 7 day TTL
 * 2. SQLite (persistent, local) - 7 day TTL
 * 3. Regulations.gov API (source of truth)
 *
 * Also returns the objectType to construct correct Regulations.gov URLs.
 */
async function getDocketText(docketId: string): Promise<DocketTextResult> {
  const cacheKey = getDocketCacheKey(docketId);
  const objectTypeCacheKey = `${cacheKey}:type`;

  // Tier 1: Check Redis cache (fastest)
  const redisCached = await getCached<string>(cacheKey);
  const cachedType = await getCached<'document' | 'docket'>(objectTypeCacheKey);
  if (redisCached) {
    console.log(`[actions] getDocketText: Redis HIT for ${docketId}`);
    return { text: redisCached, objectType: cachedType || 'document' };
  }

  // Tier 2: Check SQLite cache (persistent)
  const sqliteCached = getDocketTextFromDb(docketId);
  if (sqliteCached) {
    console.log(`[actions] getDocketText: SQLite HIT for ${docketId}, backfilling Redis`);
    // Backfill Redis for faster subsequent access
    await setCached(cacheKey, sqliteCached, CACHE_TTL.DOCKET);
    // Default to 'document' for cached items (most common from dashboard)
    return { text: sqliteCached, objectType: cachedType || 'document' };
  }

  // Tier 3: Fetch from API (source of truth)
  console.log(`[actions] getDocketText: MISS, fetching from API for ${docketId}`);

  // Try fetching as a document first (most common case from dashboard)
  const docDetails = await regulationsApi.getDocumentFullDetails(docketId);

  if (docDetails) {
    let text = buildDocketTextForAnalysis(docDetails);

    // If content is sparse (< 500 chars) and we have a FR doc number, fetch from Federal Register
    if (text.length < 500 && docDetails.frDocNum) {
      console.log(`[actions] getDocketText: sparse content (${text.length} chars), trying Federal Register fallback`);
      const frContent = await fetchFederalRegisterContent(docDetails.frDocNum);
      if (frContent && frContent.length > text.length) {
        // Prepend metadata and use Federal Register content
        text = [
          `DOCUMENT ID: ${docDetails.id}`,
          `TITLE: ${docDetails.title}`,
          `AGENCY: ${docDetails.agencyId}`,
          docDetails.commentEndDate ? `COMMENT DEADLINE: ${docDetails.commentEndDate}` : '',
          `FEDERAL REGISTER DOCUMENT: ${docDetails.frDocNum}`,
          '',
          'FULL TEXT (from Federal Register):',
          frContent,
        ].filter(Boolean).join('\n');
        console.log(`[actions] getDocketText: enriched with Federal Register content (${text.length} chars)`);
      }
    }

    console.log(`[actions] getDocketText: built text from document (${text.length} chars)`);
    // Store in both caches
    await setCached(cacheKey, text, CACHE_TTL.DOCKET);
    await setCached(objectTypeCacheKey, 'document', CACHE_TTL.DOCKET);
    setDocketTextInDb(docketId, text);
    return { text, objectType: 'document' };
  }

  // If not found as document, try as docket
  const docketDetails = await regulationsApi.getDocketDetails(docketId);

  if (docketDetails) {
    // Build a simpler text from docket metadata
    const text = [
      `DOCKET ID: ${docketDetails.id}`,
      `TITLE: ${docketDetails.title}`,
      `AGENCY: ${docketDetails.agencyId}`,
      '',
      docketDetails.abstract ? `ABSTRACT:\n${docketDetails.abstract}` : '',
    ].filter(Boolean).join('\n');

    console.log(`[actions] getDocketText: built text from docket (${text.length} chars)`);
    // Store in both caches
    await setCached(cacheKey, text, CACHE_TTL.DOCKET);
    await setCached(objectTypeCacheKey, 'docket', CACHE_TTL.DOCKET);
    setDocketTextInDb(docketId, text);
    return { text, objectType: 'docket' };
  }

  // Fallback if nothing found - assume document type
  console.warn(`[actions] getDocketText: no data found for ${docketId}, using fallback`);
  const fallback = `Document ID: ${docketId}\n\nUnable to retrieve full docket content. Please refer to the Regulations.gov website for complete details.`;
  return { text: fallback, objectType: 'document' };
}

// ============================================================
// DASHBOARD & SEARCH (with Redis caching)
// ============================================================

/**
 * Get dashboard dockets with Redis caching (24h TTL).
 * Shows documents with comment periods closing in the next 7 days.
 */
export async function getDashboardDockets(): Promise<DocketSummary[]> {
  const cacheKey = getDashboardCacheKey();
  console.log(`[actions] getDashboardDockets: checking cache`);

  // Check Redis cache first
  const cached = await getCached<DocketSummary[]>(cacheKey);
  if (cached) {
    console.log(`[actions] getDashboardDockets: Redis cache hit (${cached.length} results)`);
    return cached;
  }

  // Fetch from API
  console.log(`[actions] getDashboardDockets: fetching from API`);
  const results = await regulationsApi.getDocumentsClosingRange(7);
  console.log(`[actions] getDashboardDockets: got ${results.length} results`);

  // Cache results
  if (results.length > 0) {
    await setCached(cacheKey, results, CACHE_TTL.DASHBOARD);
  }

  return results;
}

/**
 * Search dockets with Redis caching (24h TTL per query).
 */
export async function searchDockets(query: string): Promise<DocketSummary[]> {
  const cacheKey = getSearchCacheKey(query);
  console.log(`[actions] searchDockets: query="${query}"`);

  // Check Redis cache first
  const cached = await getCached<DocketSummary[]>(cacheKey);
  if (cached) {
    console.log(`[actions] searchDockets: Redis cache hit (${cached.length} results)`);
    return cached;
  }

  // Fetch from API
  const results = await regulationsApi.searchDocuments(query);
  console.log(`[actions] searchDockets: got ${results.length} results`);

  // Cache results
  if (results.length > 0) {
    await setCached(cacheKey, results, CACHE_TTL.SEARCH);
  }

  return results;
}

export async function getDocument(id: string): Promise<DocketSummary | null> {
  console.log(`[actions] getDocument: fetching ${id}`);

  // First try as a document ID
  const doc = await regulationsApi.getDocumentDetails(id);
  if (doc) {
    console.log(`[actions] getDocument: found as document`);
    return doc;
  }

  // If not found, try as a docket ID (e.g., FDA-2023-D-0001 vs FDA-2023-D-0001-0001)
  console.log(`[actions] getDocument: trying as docket ID`);
  const docket = await regulationsApi.getDocketDetails(id);
  if (docket) {
    console.log(`[actions] getDocument: found as docket`);
  } else {
    console.log(`[actions] getDocument: not found as document or docket`);
  }
  return docket;
}

export async function refreshDockets(): Promise<DocketSummary[]> {
  console.log(`[actions] refreshDockets: fetching fresh from API (cache will be updated)`);

  // Fetch fresh from API
  const results = await regulationsApi.getDocumentsClosingRange(7);
  console.log(`[actions] refreshDockets: got ${results.length} fresh results`);

  // Cache the fresh results (overwrites existing cache)
  if (results.length > 0) {
    const cacheKey = getDashboardCacheKey();
    await setCached(cacheKey, results, CACHE_TTL.DASHBOARD);
  }

  // Revalidate the page
  revalidatePath('/');

  return results;
}

// ============================================================
// UNIFIED DOCKET ANALYSIS (with deduplication + three-tier cache)
// ============================================================

/**
 * Analyzes a docket and returns comprehensive analysis for all positions.
 * This is the FIRST AI call in the two-call architecture.
 *
 * Optimizations:
 * 1. Promise coalescing - prevents duplicate AI calls for concurrent requests
 * 2. Three-tier cache: Redis (fast) → SQLite (persistent) → AI (expensive)
 */
export async function analyzeDocketContent(docketId: string): Promise<DocketAnalysis> {
  console.log(`[actions] analyzeDocketContent: docketId=${docketId}`);

  // Use promise coalescing to prevent duplicate in-flight requests
  return deduplicatedRequest(`analysis:${docketId}`, async () => {
    return performDocketAnalysis(docketId);
  });
}

/**
 * Internal function that performs the actual analysis.
 * Separated from analyzeDocketContent to work with promise coalescing.
 */
async function performDocketAnalysis(docketId: string): Promise<DocketAnalysis> {
  // 1. Fetch live metadata for "openForComment" status and deadline (always fresh)
  let isOpenForComment: boolean | undefined = undefined;
  let commentEndDate: string | undefined = undefined;
  try {
    const docMeta = await regulationsApi.getDocumentDetails(docketId);
    if (docMeta) {
      isOpenForComment = docMeta.openForComment;
      commentEndDate = docMeta.commentEndDate;
    }
  } catch (err) {
    console.warn(`[actions] performDocketAnalysis: failed to fetch live metadata`, err);
  }

  // 2. Tier 1: Check Redis cache (fastest)
  const cacheKey = getAnalysisCacheKey(docketId);
  const redisCached = await getCached<DocketAnalysis>(cacheKey);

  if (redisCached) {
    console.log(`[actions] performDocketAnalysis: Redis HIT for ${docketId}`);
    return applyOpenForCommentStatus(redisCached, isOpenForComment, undefined, commentEndDate);
  }

  // 3. Tier 2: Check SQLite cache (persistent)
  const sqliteCached = getAnalysisFromDb(docketId);

  if (sqliteCached) {
    console.log(`[actions] performDocketAnalysis: SQLite HIT for ${docketId}, backfilling Redis`);
    // Backfill Redis for faster subsequent access
    await setCached(cacheKey, sqliteCached, CACHE_TTL.ANALYSIS);
    return applyOpenForCommentStatus(sqliteCached, isOpenForComment, undefined, commentEndDate);
  }

  // 4. Tier 3: Perform AI analysis (expensive)
  console.log(`[actions] performDocketAnalysis: MISS, calling AI for ${docketId}`);

  // Fetch docket text (also uses three-tier cache)
  const { text: docketText, objectType } = await getDocketText(docketId);
  console.log(`[actions] performDocketAnalysis: got docket text (${docketText.length} chars), type: ${objectType}`);

  // Call AI analyzer
  console.log(`[actions] performDocketAnalysis: calling AI analyzer`);
  const analysis = await analyzeDocket(docketText);

  // Apply status, objectType, commentEndDate, and timestamp
  const result = {
    ...applyOpenForCommentStatus(analysis, isOpenForComment, objectType, commentEndDate),
    analyzedAt: new Date().toISOString(),
  };

  // Store in both caches
  await setCached(cacheKey, result, CACHE_TTL.ANALYSIS);
  setAnalysisInDb(docketId, result, docketText);

  console.log(`[actions] performDocketAnalysis: analysis complete and cached`);
  return result;
}

/**
 * Helper to merge openForComment status, commentEndDate, and objectType from API with cached/AI analysis.
 * Open if EITHER API confirmed true OR AI inferred true.
 */
function applyOpenForCommentStatus(
  analysis: DocketAnalysis,
  apiStatus: boolean | undefined,
  objectType?: 'document' | 'docket',
  apiCommentEndDate?: string
): DocketAnalysis {
  const apiSaysOpen = apiStatus === true;
  const aiSaysOpen = analysis.openForComment === true;

  // Use API commentEndDate if available, otherwise try to use AI-extracted deadline
  const commentEndDate = apiCommentEndDate || analysis.commentEndDate || analysis.commentingInstructions?.deadlineDate;

  return {
    ...analysis,
    openForComment: apiSaysOpen || aiSaysOpen,
    commentEndDate,
    // Preserve existing objectType if already set (from cache), otherwise use provided value
    objectType: analysis.objectType || objectType || 'document',
  };
}

/**
 * Force reanalyze a docket by clearing all caches and performing fresh AI analysis.
 * Useful when cached data is stale or incomplete.
 */
export async function forceReanalyzeDocket(docketId: string): Promise<DocketAnalysis> {
  console.log(`[actions] forceReanalyzeDocket: clearing caches for ${docketId}`);

  // Clear Redis analysis cache
  const analysisCacheKey = getAnalysisCacheKey(docketId);
  await deleteCached(analysisCacheKey);

  // Clear Redis docket text cache (to re-fetch with Federal Register fallback)
  const docketCacheKey = getDocketCacheKey(docketId);
  await deleteCached(docketCacheKey);
  await deleteCached(`${docketCacheKey}:type`);

  // Clear SQLite cache
  deleteAnalysisFromDb(docketId);

  console.log(`[actions] forceReanalyzeDocket: caches cleared, performing fresh analysis`);

  // Perform fresh analysis (will skip cache checks since we just cleared them)
  return performDocketAnalysis(docketId);
}

/**
 * Regenerates arguments for a specific reason card within a position.
 * Used when user wants fresh arguments for a particular topic.
 */
export async function regenerateReasonCardAction(
  docketId: string,
  position: Position,
  cardTopic: string,
  existingArgumentLabels: string[]
): Promise<ReasonCard> {
  console.log(`[actions] regenerateReasonCardAction: position=${position}, topic=${cardTopic}`);

  const { text: docketText } = await getDocketText(docketId);
  const newCard = await regenerateReasonCard(docketText, position, cardTopic, existingArgumentLabels);

  console.log(`[actions] regenerateReasonCardAction: regeneration complete`);
  return newCard;
}

// ============================================================
// NEW: FINAL COMMENT GENERATION (second AI call)
// ============================================================

/**
 * Generates the final formatted comment based on user selections.
 * This is the SECOND AI call in the two-call architecture.
 */
export async function generateCommentDraft(
  docketId: string,
  commentingInstructions: CommentingInstructions,
  position: Position,
  selectedArguments: ArgumentOption[],
  personalContext: {
    isExpert: boolean;
    affectsLivelihood: boolean;
    customText?: string;
  },
  docketMetadata?: {
    title?: string;
    agencyId?: string;
  }
): Promise<string> {
  console.log(`[actions] generateCommentDraft: position=${position}, args=${selectedArguments.length}`);

  const { text: docketText } = await getDocketText(docketId);

  const comment = await generateFinalComment(
    docketText,
    commentingInstructions,
    position,
    selectedArguments,
    personalContext
  );

  // Record statistics
  try {
    // Extract argument topics for tracking
    const argumentTopics = selectedArguments.map(arg => arg.label);

    recordCommentGenerated({
      docketId,
      docketTitle: docketMetadata?.title,
      agencyId: docketMetadata?.agencyId || extractAgencyFromDocketId(docketId),
      position,
      argumentCount: selectedArguments.length,
      argumentTopics,
      isExpert: personalContext.isExpert,
      affectsLivelihood: personalContext.affectsLivelihood,
    });
  } catch (err) {
    // Don't fail the comment generation if stats recording fails
    console.error('[actions] generateCommentDraft: failed to record stats', err);
  }

  console.log(`[actions] generateCommentDraft: draft generated (${comment.length} chars)`);
  return comment;
}

/**
 * Extract agency ID from docket ID pattern (e.g., NCUA-2025-1137 -> NCUA)
 */
function extractAgencyFromDocketId(docketId: string): string {
  const firstSegment = docketId.split('-')[0];
  if (firstSegment === 'USCBP') return 'CBP';
  return firstSegment || 'Unknown';
}

// ============================================================
// STATISTICS
// ============================================================

/**
 * Get comment count for a docket (public stat shown on cards).
 */
export async function getDocketCommentCount(docketId: string): Promise<number> {
  try {
    return getDbDocketCommentCount(docketId);
  } catch (err) {
    console.error('[actions] getDocketCommentCount: error', err);
    return 0;
  }
}

/**
 * Get comment counts for multiple dockets at once (batch query for dashboard).
 */
export async function getDocketCommentCounts(docketIds: string[]): Promise<Record<string, number>> {
  try {
    return getDbDocketCommentCounts(docketIds);
  } catch (err) {
    console.error('[actions] getDocketCommentCounts: error', err);
    return {};
  }
}

export interface TrendingDocket {
  docketId: string;
  docketTitle: string;
  agencyId: string;
  count: number;
}

/**
 * Get top dockets by comment count (for landing page "trending" section).
 */
export async function getTopRecentDockets(limit: number = 3): Promise<TrendingDocket[]> {
  try {
    return getDbTopRecentDockets(limit);
  } catch (err) {
    console.error('[actions] getTopRecentDockets: error', err);
    return [];
  }
}

/**
 * Get all admin statistics (requires secret key).
 */
export async function getAdminStats(secretKey: string): Promise<AdminStats | null> {
  const adminKey = process.env.ADMIN_SECRET_KEY;

  if (!adminKey || secretKey !== adminKey) {
    console.warn('[actions] getAdminStats: invalid secret key');
    return null;
  }

  try {
    return getDbAdminStats();
  } catch (err) {
    console.error('[actions] getAdminStats: error', err);
    return null;
  }
}

// ============================================================
// BACKGROUND CACHE WARMING
// ============================================================

export interface CacheWarmingResult {
  total: number;
  warmed: number;
  skipped: number;
  failed: number;
  docketIds: string[];
}

/**
 * Warm the cache for dashboard dockets in the background.
 * Called after dashboard loads to pre-analyze top dockets so users
 * clicking through get instant results.
 *
 * @param dockets List of docket summaries from dashboard
 * @param maxToWarm Maximum number of dockets to warm (default: 5)
 */
export async function warmDocketCache(
  dockets: DocketSummary[],
  maxToWarm: number = 5
): Promise<CacheWarmingResult> {
  console.log(`[actions] warmDocketCache: starting for ${dockets.length} dockets (max: ${maxToWarm})`);

  const result: CacheWarmingResult = {
    total: dockets.length,
    warmed: 0,
    skipped: 0,
    failed: 0,
    docketIds: [],
  };

  // Get already-cached docket IDs from SQLite
  const alreadyCached = new Set(getCachedDocketIds());
  console.log(`[actions] warmDocketCache: ${alreadyCached.size} dockets already cached`);

  // Filter to dockets that need warming
  const needsWarming = dockets
    .filter(d => !alreadyCached.has(d.id))
    .slice(0, maxToWarm);

  if (needsWarming.length === 0) {
    console.log(`[actions] warmDocketCache: all dockets already cached, skipping`);
    result.skipped = Math.min(dockets.length, maxToWarm);
    return result;
  }

  console.log(`[actions] warmDocketCache: warming ${needsWarming.length} dockets`);

  // Warm each docket sequentially to avoid overwhelming the AI API
  for (const docket of needsWarming) {
    try {
      console.log(`[actions] warmDocketCache: warming ${docket.id}`);
      await analyzeDocketContent(docket.id);
      result.warmed++;
      result.docketIds.push(docket.id);
    } catch (err) {
      console.error(`[actions] warmDocketCache: failed to warm ${docket.id}`, err);
      result.failed++;
    }
  }

  // Count skipped (already cached within the maxToWarm limit)
  result.skipped = Math.min(dockets.length, maxToWarm) - needsWarming.length;

  console.log(`[actions] warmDocketCache: complete - warmed: ${result.warmed}, skipped: ${result.skipped}, failed: ${result.failed}`);
  return result;
}

/**
 * Check which dockets from a list are already cached.
 * Useful for UI to show cache status indicators.
 */
export async function getDocketCacheStatus(docketIds: string[]): Promise<Record<string, boolean>> {
  const cachedSet = new Set(getCachedDocketIds());
  const status: Record<string, boolean> = {};

  for (const id of docketIds) {
    status[id] = cachedSet.has(id);
  }

  return status;
}

// ============================================================
// LEGACY: For backward compatibility with existing components
// ============================================================

export async function generateDynamicArguments(docketId: string, stance: string): Promise<ArgumentCategory[]> {
  console.log(`[generateDynamicArguments] LEGACY: Fetching document/docket: ${docketId}`);
  const doc = await getDocument(docketId);
  // Use abstract or content if available, otherwise just use title + ID
  const text = doc ? (doc.abstract || doc.title) : `Docket ID: ${docketId}`;
  console.log(`[generateDynamicArguments] Using text for AI (${text.length} chars): "${text.substring(0, 100)}..."`);

  return await generateArgumentsWithAI(text, stance);
}
