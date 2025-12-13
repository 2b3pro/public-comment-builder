import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database path - stored in data directory
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'stats.db');

// Singleton database instance
let db: Database.Database | null = null;
let isDbFailed = false;

/**
 * Get the database instance (singleton pattern).
 * Creates the database and tables if they don't exist.
 * Returns null if database cannot be initialized (e.g. read-only fs on Vercel).
 */
export function getDb(): Database.Database | null {
  if (db) return db;
  if (isDbFailed) return null;

  // IMPORTANT: Only allow DB writing in local development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  try {
    // Check if we are in a read-only environment (like Vercel production typically, unless configured otherwise)
    // We try to write to the data dir.
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (err) {
        console.warn('[stats-db] Cannot create data directory (likely read-only filesystem). Stats disabled.');
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
      CREATE TABLE IF NOT EXISTS comment_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        docket_id TEXT NOT NULL,
        docket_title TEXT,
        agency_id TEXT,
        position TEXT NOT NULL,
        argument_count INTEGER DEFAULT 0,
        argument_topics TEXT,
        is_expert INTEGER DEFAULT 0,
        affects_livelihood INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_docket_id ON comment_stats(docket_id);
      CREATE INDEX IF NOT EXISTS idx_created_at ON comment_stats(created_at);
      CREATE INDEX IF NOT EXISTS idx_agency_id ON comment_stats(agency_id);
    `);

    return db;
  } catch (err) {
    console.error('[stats-db] Failed to initialize SQLite database:', err);
    isDbFailed = true;
    return null;
  }
}

// ============================================================
// TYPES
// ============================================================

export interface CommentStatRecord {
  docketId: string;
  docketTitle?: string;
  agencyId?: string;
  position: 'support' | 'oppose' | 'mixed';
  argumentCount: number;
  argumentTopics?: string[];  // Track which argument topics were selected
  isExpert: boolean;
  affectsLivelihood: boolean;
}

export interface DocketStats {
  docketId: string;
  total: number;
  support: number;
  oppose: number;
  mixed: number;
}

export interface AdminStats {
  totalComments: number;
  byPosition: { support: number; oppose: number; mixed: number };
  byAgency: { agencyId: string; count: number }[];
  topDockets: { docketId: string; docketTitle: string; count: number }[];
  popularTopics: { topic: string; count: number }[];
  expertCount: number;
  livelihoodCount: number;
}

// ============================================================
// WRITE OPERATIONS
// ============================================================

/**
 * Record a comment generation event.
 */
export function recordCommentGenerated(data: CommentStatRecord): void {
  const db = getDb();
  if (!db) return; // Fail silently if DB is not available

  try {
    const stmt = db.prepare(`
      INSERT INTO comment_stats (docket_id, docket_title, agency_id, position, argument_count, argument_topics, is_expert, affects_livelihood)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.docketId,
      data.docketTitle || null,
      data.agencyId || null,
      data.position,
      data.argumentCount,
      data.argumentTopics ? JSON.stringify(data.argumentTopics) : null,
      data.isExpert ? 1 : 0,
      data.affectsLivelihood ? 1 : 0
    );

    console.log(`[stats-db] Recorded comment for docket ${data.docketId}, position: ${data.position}`);
  } catch (err) {
    console.error('[stats-db] Error recording stats:', err);
  }
}

// ============================================================
// READ OPERATIONS (Public)
// ============================================================

/**
 * Get comment count for a specific docket (public stat).
 */
export function getDocketCommentCount(docketId: string): number {
  const db = getDb();
  if (!db) return 0;

  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM comment_stats WHERE docket_id = ?');
    const result = stmt.get(docketId) as { count: number };
    return result?.count || 0;
  } catch (err) {
    console.error('[stats-db] Error getting comment count:', err);
    return 0;
  }
}

/**
 * Get comment counts for multiple dockets at once.
 */
export function getDocketCommentCounts(docketIds: string[]): Record<string, number> {
  if (docketIds.length === 0) return {};

  const db = getDb();
  if (!db) return {};

  try {
    const placeholders = docketIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT docket_id, COUNT(*) as count
      FROM comment_stats
      WHERE docket_id IN (${placeholders})
      GROUP BY docket_id
    `);

    const results = stmt.all(...docketIds) as { docket_id: string; count: number }[];

    const counts: Record<string, number> = {};
    for (const row of results) {
      counts[row.docket_id] = row.count;
    }
    return counts;
  } catch (err) {
    console.error('[stats-db] Error getting batch comment counts:', err);
    return {};
  }
}

/**
 * Get top dockets by comment count (public - for landing page).
 * Returns dockets sorted by total comments, most recent activity first for ties.
 */
export function getTopRecentDockets(limit: number = 3): { docketId: string; docketTitle: string; agencyId: string; count: number }[] {
  const db = getDb();
  if (!db) return [];

  try {
    const stmt = db.prepare(`
      SELECT
        docket_id as docketId,
        docket_title as docketTitle,
        agency_id as agencyId,
        COUNT(*) as count,
        MAX(created_at) as lastActivity
      FROM comment_stats
      GROUP BY docket_id
      HAVING count > 0
      ORDER BY count DESC, lastActivity DESC
      LIMIT ?
    `);

    const results = stmt.all(limit) as { docketId: string; docketTitle: string; agencyId: string; count: number }[];
    return results;
  } catch (err) {
    console.error('[stats-db] Error getting top dockets:', err);
    return [];
  }
}

// ============================================================
// READ OPERATIONS (Admin)
// ============================================================

/**
 * Get detailed stats for a specific docket (admin).
 */
export function getStatsForDocket(docketId: string): DocketStats {
  const db = getDb();
  const emptyStats = {
    docketId,
    total: 0,
    support: 0,
    oppose: 0,
    mixed: 0,
  };

  if (!db) return emptyStats;

  try {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN position = 'support' THEN 1 ELSE 0 END) as support,
        SUM(CASE WHEN position = 'oppose' THEN 1 ELSE 0 END) as oppose,
        SUM(CASE WHEN position = 'mixed' THEN 1 ELSE 0 END) as mixed
      FROM comment_stats
      WHERE docket_id = ?
    `);

    const result = stmt.get(docketId) as { total: number; support: number; oppose: number; mixed: number };

    return {
      docketId,
      total: result.total || 0,
      support: result.support || 0,
      oppose: result.oppose || 0,
      mixed: result.mixed || 0,
    };
  } catch (err) {
    console.error('[stats-db] Error getting docket stats:', err);
    return emptyStats;
  }
}

/**
 * Get all admin statistics.
 */
export function getAdminStats(): AdminStats {
  const db = getDb();

  // Default empty stats
  const emptyStats: AdminStats = {
    totalComments: 0,
    byPosition: { support: 0, oppose: 0, mixed: 0 },
    byAgency: [],
    topDockets: [],
    popularTopics: [],
    expertCount: 0,
    livelihoodCount: 0,
  };

  if (!db) return emptyStats;

  try {
    // Total comments
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM comment_stats');
    const totalResult = totalStmt.get() as { count: number };

    // By position
    const positionStmt = db.prepare(`
      SELECT
        SUM(CASE WHEN position = 'support' THEN 1 ELSE 0 END) as support,
        SUM(CASE WHEN position = 'oppose' THEN 1 ELSE 0 END) as oppose,
        SUM(CASE WHEN position = 'mixed' THEN 1 ELSE 0 END) as mixed
      FROM comment_stats
    `);
    const positionResult = positionStmt.get() as { support: number; oppose: number; mixed: number };

    // By agency
    const agencyStmt = db.prepare(`
      SELECT agency_id as agencyId, COUNT(*) as count
      FROM comment_stats
      WHERE agency_id IS NOT NULL
      GROUP BY agency_id
      ORDER BY count DESC
      LIMIT 20
    `);
    const agencyResults = agencyStmt.all() as { agencyId: string; count: number }[];

    // Top dockets
    const docketStmt = db.prepare(`
      SELECT docket_id as docketId, docket_title as docketTitle, COUNT(*) as count
      FROM comment_stats
      GROUP BY docket_id
      ORDER BY count DESC
      LIMIT 10
    `);
    const docketResults = docketStmt.all() as { docketId: string; docketTitle: string; count: number }[];

    // Popular argument topics - parse JSON and count
    const topicsStmt = db.prepare(`
      SELECT argument_topics FROM comment_stats WHERE argument_topics IS NOT NULL
    `);
    const topicsRows = topicsStmt.all() as { argument_topics: string }[];

    const topicCounts: Record<string, number> = {};
    for (const row of topicsRows) {
      try {
        const topics = JSON.parse(row.argument_topics) as string[];
        for (const topic of topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      } catch {
        // Skip malformed JSON
      }
    }

    const popularTopics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Expert and livelihood counts
    const flagsStmt = db.prepare(`
      SELECT
        SUM(is_expert) as expertCount,
        SUM(affects_livelihood) as livelihoodCount
      FROM comment_stats
    `);
    const flagsResult = flagsStmt.get() as { expertCount: number; livelihoodCount: number };

    return {
      totalComments: totalResult.count || 0,
      byPosition: {
        support: positionResult.support || 0,
        oppose: positionResult.oppose || 0,
        mixed: positionResult.mixed || 0,
      },
      byAgency: agencyResults,
      topDockets: docketResults,
      popularTopics,
      expertCount: flagsResult.expertCount || 0,
      livelihoodCount: flagsResult.livelihoodCount || 0,
    };
  } catch (err) {
    console.error('[stats-db] Error getting admin stats:', err);
    return emptyStats;
  }
}
