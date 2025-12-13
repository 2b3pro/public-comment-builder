/**
 * Analysis Cache - SQLite Persistence Layer
 *
 * Provides durable storage for AI analysis results that survives:
 * - Redis eviction
 * - Server restarts
 * - Deployment changes
 *
 * This is the "source of truth" for analysis data, with Redis as a fast cache layer.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { DocketAnalysis } from './ai-generator';

// Database path - stored in data directory alongside stats.db
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'analysis-cache.db');

// Singleton database instance
let db: Database.Database | null = null;
let isDbFailed = false;

// Cache TTL in milliseconds (7 days - same as Redis)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get the database instance (singleton pattern).
 * Creates the database and tables if they don't exist.
 * Returns null if database cannot be initialized (e.g., read-only fs on Vercel).
 */
function getDb(): Database.Database | null {
  if (db) return db;
  if (isDbFailed) return null;

  try {
    // Check if we are in a read-only environment
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {
        console.warn('[analysis-cache] Cannot create data directory (likely read-only filesystem). Persistent cache disabled.');
        isDbFailed = true;
        return null;
      }
    }

    // Try to open/create the DB
    db = new Database(DB_PATH);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Create tables if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS docket_analysis (
        docket_id TEXT PRIMARY KEY,
        analysis_json TEXT NOT NULL,
        docket_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS docket_text (
        docket_id TEXT PRIMARY KEY,
        text_content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analysis_updated_at ON docket_analysis(updated_at);
      CREATE INDEX IF NOT EXISTS idx_text_created_at ON docket_text(created_at);
    `);

    console.log('[analysis-cache] SQLite database initialized');
    return db;
  } catch (err) {
    console.error('[analysis-cache] Failed to initialize SQLite database:', err);
    isDbFailed = true;
    return null;
  }
}

// ============================================================
// DOCKET TEXT STORAGE
// ============================================================

/**
 * Get cached docket text from SQLite.
 */
export function getDocketTextFromDb(docketId: string): string | null {
  const db = getDb();
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT text_content, created_at
      FROM docket_text
      WHERE docket_id = ?
    `);

    const row = stmt.get(docketId) as { text_content: string; created_at: number } | undefined;

    if (!row) {
      console.log(`[analysis-cache] Docket text MISS: ${docketId}`);
      return null;
    }

    // Check if expired (older than TTL)
    const age = Date.now() - row.created_at;
    if (age > CACHE_TTL_MS) {
      console.log(`[analysis-cache] Docket text EXPIRED: ${docketId} (age: ${Math.round(age / 1000 / 60 / 60)}h)`);
      return null;
    }

    console.log(`[analysis-cache] Docket text HIT: ${docketId}`);
    return row.text_content;
  } catch (err) {
    console.error('[analysis-cache] Error getting docket text:', err);
    return null;
  }
}

/**
 * Store docket text in SQLite.
 */
export function setDocketTextInDb(docketId: string, text: string): void {
  const db = getDb();
  if (!db) return;

  try {
    const stmt = db.prepare(`
      INSERT INTO docket_text (docket_id, text_content, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(docket_id) DO UPDATE SET
        text_content = excluded.text_content,
        created_at = excluded.created_at
    `);

    stmt.run(docketId, text, Date.now());
    console.log(`[analysis-cache] Docket text STORED: ${docketId} (${text.length} chars)`);
  } catch (err) {
    console.error('[analysis-cache] Error storing docket text:', err);
  }
}

// ============================================================
// ANALYSIS STORAGE
// ============================================================

/**
 * Get cached analysis from SQLite.
 * Returns null if not found or expired.
 */
export function getAnalysisFromDb(docketId: string): DocketAnalysis | null {
  const db = getDb();
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT analysis_json, updated_at
      FROM docket_analysis
      WHERE docket_id = ?
    `);

    const row = stmt.get(docketId) as { analysis_json: string; updated_at: number } | undefined;

    if (!row) {
      console.log(`[analysis-cache] Analysis MISS: ${docketId}`);
      return null;
    }

    // Check if expired (older than TTL)
    const age = Date.now() - row.updated_at;
    if (age > CACHE_TTL_MS) {
      console.log(`[analysis-cache] Analysis EXPIRED: ${docketId} (age: ${Math.round(age / 1000 / 60 / 60)}h)`);
      return null;
    }

    console.log(`[analysis-cache] Analysis HIT: ${docketId}`);
    return JSON.parse(row.analysis_json) as DocketAnalysis;
  } catch (err) {
    console.error('[analysis-cache] Error getting analysis:', err);
    return null;
  }
}

/**
 * Store analysis in SQLite.
 */
export function setAnalysisInDb(
  docketId: string,
  analysis: DocketAnalysis,
  docketText?: string
): void {
  const db = getDb();
  if (!db) return;

  try {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO docket_analysis (docket_id, analysis_json, docket_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(docket_id) DO UPDATE SET
        analysis_json = excluded.analysis_json,
        docket_text = COALESCE(excluded.docket_text, docket_analysis.docket_text),
        updated_at = excluded.updated_at
    `);

    stmt.run(docketId, JSON.stringify(analysis), docketText || null, now, now);
    console.log(`[analysis-cache] Analysis STORED: ${docketId}`);
  } catch (err) {
    console.error('[analysis-cache] Error storing analysis:', err);
  }
}

/**
 * Delete cached analysis (for manual invalidation).
 */
export function deleteAnalysisFromDb(docketId: string): void {
  const db = getDb();
  if (!db) return;

  try {
    const stmt = db.prepare('DELETE FROM docket_analysis WHERE docket_id = ?');
    stmt.run(docketId);
    console.log(`[analysis-cache] Analysis DELETED: ${docketId}`);
  } catch (err) {
    console.error('[analysis-cache] Error deleting analysis:', err);
  }
}

// ============================================================
// CACHE STATISTICS & MAINTENANCE
// ============================================================

export interface CacheStats {
  totalAnalyses: number;
  totalDocketTexts: number;
  oldestAnalysis: string | null;
  newestAnalysis: string | null;
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): CacheStats {
  const db = getDb();
  const empty: CacheStats = {
    totalAnalyses: 0,
    totalDocketTexts: 0,
    oldestAnalysis: null,
    newestAnalysis: null,
  };

  if (!db) return empty;

  try {
    const analysisCount = db.prepare('SELECT COUNT(*) as count FROM docket_analysis').get() as { count: number };
    const textCount = db.prepare('SELECT COUNT(*) as count FROM docket_text').get() as { count: number };

    const oldest = db.prepare(`
      SELECT docket_id FROM docket_analysis ORDER BY updated_at ASC LIMIT 1
    `).get() as { docket_id: string } | undefined;

    const newest = db.prepare(`
      SELECT docket_id FROM docket_analysis ORDER BY updated_at DESC LIMIT 1
    `).get() as { docket_id: string } | undefined;

    return {
      totalAnalyses: analysisCount.count,
      totalDocketTexts: textCount.count,
      oldestAnalysis: oldest?.docket_id || null,
      newestAnalysis: newest?.docket_id || null,
    };
  } catch (err) {
    console.error('[analysis-cache] Error getting cache stats:', err);
    return empty;
  }
}

/**
 * Clean up expired entries from the cache.
 * Run periodically to keep database size manageable.
 */
export function cleanupExpiredEntries(): { analysesRemoved: number; textsRemoved: number } {
  const db = getDb();
  if (!db) return { analysesRemoved: 0, textsRemoved: 0 };

  try {
    const cutoff = Date.now() - CACHE_TTL_MS;

    const analysisResult = db.prepare('DELETE FROM docket_analysis WHERE updated_at < ?').run(cutoff);
    const textResult = db.prepare('DELETE FROM docket_text WHERE created_at < ?').run(cutoff);

    console.log(`[analysis-cache] Cleanup: removed ${analysisResult.changes} analyses, ${textResult.changes} texts`);

    return {
      analysesRemoved: analysisResult.changes,
      textsRemoved: textResult.changes,
    };
  } catch (err) {
    console.error('[analysis-cache] Error during cleanup:', err);
    return { analysesRemoved: 0, textsRemoved: 0 };
  }
}

/**
 * Get list of all cached docket IDs (for cache warming status).
 */
export function getCachedDocketIds(): string[] {
  const db = getDb();
  if (!db) return [];

  try {
    const rows = db.prepare('SELECT docket_id FROM docket_analysis').all() as { docket_id: string }[];
    return rows.map(r => r.docket_id);
  } catch (err) {
    console.error('[analysis-cache] Error getting cached docket IDs:', err);
    return [];
  }
}
