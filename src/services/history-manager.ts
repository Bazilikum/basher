/**
 * HistoryManager class for managing command execution history
 * Uses SQLite with full-text search (FTS5) for searchable command history
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import type { CommandHistoryEntry } from '../types/index.js';
import logger from './logger.config.js';
import { AdvancedQueries } from './advanced-queries.js';

export class HistoryManager {
  private db: Database.Database;
  public advanced: AdvancedQueries;

  constructor(dbPath: string = join(process.cwd(), 'data', 'command-history.db')) {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    try {
      mkdirSync(dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }

    this.db = new Database(dbPath);
    this.initDatabase();
    this.advanced = new AdvancedQueries(this.db);
    logger.info({ dbPath }, 'History database initialized with advanced queries');
  }

  private initDatabase(): void {
    // Create main history table (without new columns initially for compatibility)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL,
        cwd TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        exit_code INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        stdout TEXT,
        stderr TEXT
      );

      -- Indexes for faster queries
      CREATE INDEX IF NOT EXISTS idx_timestamp ON command_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_command ON command_history(command);
      CREATE INDEX IF NOT EXISTS idx_exit_code ON command_history(exit_code);

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS command_history_fts
        USING fts5(command, stdout, stderr, content='command_history', content_rowid='id');

      -- Trigger to keep FTS table in sync with main table
      CREATE TRIGGER IF NOT EXISTS command_history_ai AFTER INSERT ON command_history BEGIN
        INSERT INTO command_history_fts(rowid, command, stdout, stderr)
        VALUES (new.id, new.command, new.stdout, new.stderr);
      END;

      CREATE TRIGGER IF NOT EXISTS command_history_ad AFTER DELETE ON command_history BEGIN
        DELETE FROM command_history_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS command_history_au AFTER UPDATE ON command_history BEGIN
        UPDATE command_history_fts SET command = new.command, stdout = new.stdout, stderr = new.stderr
        WHERE rowid = new.id;
      END;
    `);

    // Migrate existing databases to add new columns if they don't exist
    this.migrateDatabase();

    logger.debug('Database schema initialized');
  }

  private migrateDatabase(): void {
    try {
      // Check if columns exist
      const columns = this.db.prepare("PRAGMA table_info(command_history)").all() as any[];
      const hasProcessId = columns.some((col: any) => col.name === 'process_id');
      const hasStatus = columns.some((col: any) => col.name === 'status');
      const hasTitle = columns.some((col: any) => col.name === 'title');

      if (!hasProcessId) {
        this.db.exec('ALTER TABLE command_history ADD COLUMN process_id INTEGER');
        logger.info('Added process_id column to command_history');
      }

      if (!hasStatus) {
        this.db.exec("ALTER TABLE command_history ADD COLUMN status TEXT DEFAULT 'completed'");
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_status ON command_history(status)');
        logger.info('Added status column to command_history');
      }

      if (!hasTitle) {
        this.db.exec('ALTER TABLE command_history ADD COLUMN title TEXT');
        logger.info('Added title column to command_history');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to migrate database');
    }
  }

  /**
   * Save a command execution to history
   */
  saveCommand(entry: CommandHistoryEntry & { processId?: number; status?: string; title?: string }): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO command_history (command, title, cwd, timestamp, exit_code, duration, stdout, stderr, process_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        entry.command,
        entry.title || entry.command,
        entry.cwd,
        entry.timestamp,
        entry.exitCode,
        entry.duration,
        entry.stdout,
        entry.stderr,
        entry.processId || null,
        entry.status || 'completed'
      );

      const id = result.lastInsertRowid as number;
      logger.debug({ id, command: entry.command, title: entry.title, processId: entry.processId, status: entry.status }, 'Command saved to history');
      return id;
    } catch (error) {
      logger.error({ error, entry }, 'Failed to save command to history');
      throw error;
    }
  }

  /**
   * Update command status (e.g., from 'running' to 'completed')
   */
  updateStatus(id: number, status: string, exitCode?: number, duration?: number, stdout?: string, stderr?: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE command_history
        SET status = ?,
            exit_code = COALESCE(?, exit_code),
            duration = COALESCE(?, duration),
            stdout = COALESCE(?, stdout),
            stderr = COALESCE(?, stderr)
        WHERE id = ?
      `);

      stmt.run(status, exitCode, duration, stdout, stderr, id);
      logger.debug({ id, status }, 'Command status updated');
    } catch (error) {
      logger.error({ error, id, status }, 'Failed to update command status');
    }
  }

  /**
   * Search command history using full-text search
   */
  searchHistory(query: string, limit: number = 50): CommandHistoryEntry[] {
    try {
      const stmt = this.db.prepare(`
        SELECT h.* FROM command_history h
        INNER JOIN command_history_fts fts ON h.id = fts.rowid
        WHERE command_history_fts MATCH ?
        ORDER BY h.timestamp DESC
        LIMIT ?
      `);

      const results = stmt.all(query, limit) as any[];

      return results.map(row => ({
        id: row.id,
        command: row.command,
        cwd: row.cwd,
        timestamp: row.timestamp,
        exitCode: row.exit_code,
        duration: row.duration,
        stdout: row.stdout,
        stderr: row.stderr,
      }));
    } catch (error) {
      logger.error({ error, query }, 'Failed to search command history');
      throw error;
    }
  }

  /**
   * Get recent command history
   */
  getRecentHistory(limit: number = 100): CommandHistoryEntry[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM command_history
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const results = stmt.all(limit) as any[];

      return results.map(row => ({
        id: row.id,
        command: row.command,
        cwd: row.cwd,
        timestamp: row.timestamp,
        exitCode: row.exit_code,
        duration: row.duration,
        stdout: row.stdout,
        stderr: row.stderr,
      }));
    } catch (error) {
      logger.error({ error, limit }, 'Failed to get recent history');
      throw error;
    }
  }

  /**
   * Get command history by exit code
   */
  getByExitCode(exitCode: number, limit: number = 50): CommandHistoryEntry[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM command_history
        WHERE exit_code = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const results = stmt.all(exitCode, limit) as any[];

      return results.map(row => ({
        id: row.id,
        command: row.command,
        cwd: row.cwd,
        timestamp: row.timestamp,
        exitCode: row.exit_code,
        duration: row.duration,
        stdout: row.stdout,
        stderr: row.stderr,
      }));
    } catch (error) {
      logger.error({ error, exitCode }, 'Failed to get history by exit code');
      throw error;
    }
  }

  /**
   * Get statistics about command history
   */
  getStats(): { total: number; failures: number; avgDuration: number } {
    try {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN exit_code != 0 THEN 1 ELSE 0 END) as failures,
          AVG(duration) as avg_duration
        FROM command_history
      `).get() as any;

      return {
        total: stats.total || 0,
        failures: stats.failures || 0,
        avgDuration: Math.round(stats.avg_duration || 0),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get history stats');
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    logger.info('History database connection closed');
  }
}
