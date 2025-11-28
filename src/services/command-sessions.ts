/**
 * Command Sessions Service
 * Group related commands into sessions for better organization
 */

import Database from 'better-sqlite3';
import logger from './logger.config.js';

export interface CommandSession {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  endedAt?: string;
  commandCount: number;
  metadata?: Record<string, any>;
}

export interface SessionCommand {
  sessionId: number;
  commandId: number;
  addedAt: string;
}

export class CommandSessionManager {
  private db: Database.Database;
  private activeSessionId: number | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeTables();
  }

  private initializeTables(): void {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TEXT NOT NULL,
        ended_at TEXT,
        metadata TEXT,
        UNIQUE(name, started_at)
      )
    `);

    // Session commands junction table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_commands (
        session_id INTEGER NOT NULL,
        command_id INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (session_id, command_id),
        FOREIGN KEY (session_id) REFERENCES command_sessions(id) ON DELETE CASCADE
      )
    `);

    // Index for efficient lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_commands_session ON session_commands(session_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_commands_command ON session_commands(command_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON command_sessions(status)
    `);

    logger.info('Command sessions tables initialized');
  }

  /**
   * Start a new session
   */
  startSession(name: string, description?: string, metadata?: Record<string, any>): CommandSession {
    // End any currently active session
    if (this.activeSessionId) {
      this.endSession();
    }

    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO command_sessions (name, description, status, started_at, metadata)
      VALUES (?, ?, 'active', ?, ?)
    `);

    const result = stmt.run(
      name,
      description || null,
      now,
      metadata ? JSON.stringify(metadata) : null
    );

    this.activeSessionId = result.lastInsertRowid as number;

    logger.info({ sessionId: this.activeSessionId, name }, 'Session started');

    return {
      id: this.activeSessionId,
      name,
      description,
      status: 'active',
      startedAt: now,
      commandCount: 0,
      metadata,
    };
  }

  /**
   * End the current active session
   */
  endSession(status: 'completed' | 'abandoned' = 'completed'): CommandSession | null {
    if (!this.activeSessionId) {
      return null;
    }

    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE command_sessions
      SET status = ?, ended_at = ?
      WHERE id = ?
    `);

    stmt.run(status, now, this.activeSessionId);

    const session = this.getSession(this.activeSessionId);
    this.activeSessionId = null;

    logger.info({ sessionId: session?.id, status }, 'Session ended');

    return session;
  }

  /**
   * Get current active session
   */
  getActiveSession(): CommandSession | null {
    if (!this.activeSessionId) {
      return null;
    }
    return this.getSession(this.activeSessionId);
  }

  /**
   * Get active session ID (for adding commands)
   */
  getActiveSessionId(): number | null {
    return this.activeSessionId;
  }

  /**
   * Add a command to the active session
   */
  addCommandToSession(commandId: number, sessionId?: number): boolean {
    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) {
      return false;
    }

    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO session_commands (session_id, command_id, added_at)
        VALUES (?, ?, ?)
      `);

      stmt.run(targetSessionId, commandId, now);
      return true;
    } catch (error) {
      logger.error({ error, commandId, sessionId: targetSessionId }, 'Failed to add command to session');
      return false;
    }
  }

  /**
   * Get a session by ID
   */
  getSession(id: number): CommandSession | null {
    const stmt = this.db.prepare(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM session_commands WHERE session_id = s.id) as command_count
      FROM command_sessions s
      WHERE s.id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.rowToSession(row);
  }

  /**
   * Get a session by name (most recent)
   */
  getSessionByName(name: string): CommandSession | null {
    const stmt = this.db.prepare(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM session_commands WHERE session_id = s.id) as command_count
      FROM command_sessions s
      WHERE s.name = ?
      ORDER BY s.started_at DESC
      LIMIT 1
    `);

    const row = stmt.get(name) as any;
    if (!row) return null;

    return this.rowToSession(row);
  }

  /**
   * List all sessions
   */
  listSessions(status?: 'active' | 'completed' | 'abandoned', limit: number = 50): CommandSession[] {
    let stmt;
    let rows: any[];

    if (status) {
      stmt = this.db.prepare(`
        SELECT
          s.*,
          (SELECT COUNT(*) FROM session_commands WHERE session_id = s.id) as command_count
        FROM command_sessions s
        WHERE s.status = ?
        ORDER BY s.started_at DESC
        LIMIT ?
      `);
      rows = stmt.all(status, limit) as any[];
    } else {
      stmt = this.db.prepare(`
        SELECT
          s.*,
          (SELECT COUNT(*) FROM session_commands WHERE session_id = s.id) as command_count
        FROM command_sessions s
        ORDER BY s.started_at DESC
        LIMIT ?
      `);
      rows = stmt.all(limit) as any[];
    }

    return rows.map(row => this.rowToSession(row));
  }

  /**
   * Get all command IDs in a session
   */
  getSessionCommandIds(sessionId: number): number[] {
    const stmt = this.db.prepare(`
      SELECT command_id FROM session_commands
      WHERE session_id = ?
      ORDER BY added_at ASC
    `);

    const rows = stmt.all(sessionId) as any[];
    return rows.map(r => r.command_id);
  }

  /**
   * Delete a session and its command associations
   */
  deleteSession(id: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM command_sessions WHERE id = ?
    `);

    const result = stmt.run(id);
    const deleted = result.changes > 0;

    if (deleted) {
      logger.info({ sessionId: id }, 'Session deleted');
    }

    return deleted;
  }

  /**
   * Resume a session (set it as active)
   */
  resumeSession(id: number): CommandSession | null {
    // End current active session first
    if (this.activeSessionId) {
      this.endSession('abandoned');
    }

    const session = this.getSession(id);
    if (!session) return null;

    // Update session status to active
    const stmt = this.db.prepare(`
      UPDATE command_sessions
      SET status = 'active', ended_at = NULL
      WHERE id = ?
    `);

    stmt.run(id);
    this.activeSessionId = id;

    logger.info({ sessionId: id }, 'Session resumed');

    return this.getSession(id);
  }

  private rowToSession(row: any): CommandSession {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at || undefined,
      commandCount: row.command_count || 0,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
