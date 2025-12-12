'use server';

import { regulationsApi, DocketSummary, buildDocketTextForAnalysis } from '@/lib/regulations-api';
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
  getAdminStats as getDbAdminStats,
  AdminStats
} from '@/lib/stats-db';

// ============================================================
// DOCKET TEXT FETCHING (with Redis caching)
// ============================================================

/**
 * Fetch the full text content of a docket/document for AI analysis.
 * Uses Redis caching with 7-day TTL since docket content rarely changes.
 */
async function getDocketText(docketId: string): Promise<string> {
  const cacheKey = getDocketCacheKey(docketId);

  // Check Redis cache first
  const cached = await getCached<string>(cacheKey);
  if (cached) {
    console.log(`[actions] getDocketText: Redis cache hit for ${docketId}`);
    return cached;
  }

  console.log(`[actions] getDocketText: fetching from API for ${docketId}`);

  // Try fetching as a document first (most common case from dashboard)
  const docDetails = await regulationsApi.getDocumentFullDetails(docketId);

  if (docDetails) {
    const text = buildDocketTextForAnalysis(docDetails);
    console.log(`[actions] getDocketText: built text from document (${text.length} chars)`);
    await setCached(cacheKey, text, CACHE_TTL.DOCKET);
    return text;
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
    await setCached(cacheKey, text, CACHE_TTL.DOCKET);
    return text;
  }

  // Fallback if nothing found
  console.warn(`[actions] getDocketText: no data found for ${docketId}, using fallback`);
  const fallback = `Document ID: ${docketId}\n\nUnable to retrieve full docket content. Please refer to the Regulations.gov website for complete details.`;
  return fallback;
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

export async function refreshDockets() {
  console.log(`[actions] refreshDockets: revalidating path /`);
  revalidatePath('/');
}

// ============================================================
// NEW: UNIFIED DOCKET ANALYSIS (single AI call)
// ============================================================

/**
 * Analyzes a docket and returns comprehensive analysis for all positions.
 * This is the FIRST AI call in the two-call architecture.
 * Uses Redis caching with 7-day TTL since analysis is expensive.
 */
export async function analyzeDocketContent(docketId: string): Promise<DocketAnalysis> {
  console.log(`[actions] analyzeDocketContent: docketId=${docketId}`);

  // Check cache first
  const cacheKey = getAnalysisCacheKey(docketId);
  const cached = await getCached<DocketAnalysis>(cacheKey);
  if (cached) {
    console.log(`[actions] analyzeDocketContent: Redis cache hit for ${docketId}`);
    return cached;
  }

  // Fetch docket text
  const docketText = await getDocketText(docketId);
  console.log(`[actions] analyzeDocketContent: got docket text (${docketText.length} chars)`);

  // Call AI analyzer
  console.log(`[actions] analyzeDocketContent: calling AI analyzer`);
  const analysis = await analyzeDocket(docketText);

  // Cache the analysis
  await setCached(cacheKey, analysis, CACHE_TTL.ANALYSIS);

  console.log(`[actions] analyzeDocketContent: analysis complete and cached`);
  return analysis;
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

  const docketText = await getDocketText(docketId);
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

  const docketText = await getDocketText(docketId);

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
