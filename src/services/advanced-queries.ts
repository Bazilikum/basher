/**
 * Advanced query methods for command history
 * Token-efficient search and retrieval strategies
 */

import type Database from 'better-sqlite3';
import type {
  CommandHistoryEntry,
  SearchFilters,
  OutputLevel,
  AggregationParams,
  AggregationResult,
  DiffResult,
} from '../types/index.js';
import {
  formatCommandOutput,
  formatSummary,
  formatPreview,
  formatExcerpts,
  diffLines,
} from '../utils/output-formatter.js';
import logger from './logger.config.js';

export class AdvancedQueries {
  constructor(private db: Database.Database) {}

  /**
   * Apply advanced filters to SQL query
   */
  private buildFilterQuery(filters?: SearchFilters): {
    conditions: string[];
    params: any[];
  } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (!filters) {
      return { conditions, params };
    }

    // Date range
    if (filters.dateRange?.from) {
      conditions.push('timestamp >= ?');
      params.push(filters.dateRange.from);
    }
    if (filters.dateRange?.to) {
      conditions.push('timestamp <= ?');
      params.push(filters.dateRange.to);
    }

    // Working directory
    if (filters.workingDir) {
      conditions.push('cwd = ?');
      params.push(filters.workingDir);
    }

    // Command pattern (LIKE)
    if (filters.commandPattern) {
      conditions.push('command LIKE ?');
      params.push(filters.commandPattern.replace('*', '%'));
    }

    // Exit codes
    if (filters.exitCodes && filters.exitCodes.length > 0) {
      conditions.push(`exit_code IN (${filters.exitCodes.map(() => '?').join(',')})`);
      params.push(...filters.exitCodes);
    }

    // Duration range
    if (filters.minDuration !== undefined) {
      conditions.push('duration >= ?');
      params.push(filters.minDuration);
    }
    if (filters.maxDuration !== undefined) {
      conditions.push('duration <= ?');
      params.push(filters.maxDuration);
    }

    // Status
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    // Has stderr
    if (filters.hasStderr !== undefined) {
      if (filters.hasStderr) {
        conditions.push("stderr IS NOT NULL AND stderr != ''");
      } else {
        conditions.push("(stderr IS NULL OR stderr = '')");
      }
    }

    return { conditions, params };
  }

  /**
   * Get commands with filters and output level
   */
  getFilteredCommands(
    filters?: SearchFilters,
    limit: number = 100,
    outputLevel: OutputLevel = 'summary'
  ): any[] {
    try {
      const { conditions, params } = this.buildFilterQuery(filters);

      let sql = 'SELECT * FROM command_history';
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => this.mapRowToEntry(row, outputLevel));
    } catch (error) {
      logger.error({ error, filters }, 'Failed to get filtered commands');
      return [];
    }
  }

  /**
   * Search with advanced output levels
   */
  advancedSearch(
    query: string,
    limit: number = 50,
    outputLevel: OutputLevel = 'excerpts',
    contextLines: number = 3,
    filters?: SearchFilters
  ): any[] {
    try {
      const { conditions, params: filterParams } = this.buildFilterQuery(filters);

      // FTS5 search
      let sql = `
        SELECT ch.* FROM command_history ch
        INNER JOIN command_history_fts fts ON ch.id = fts.rowid
        WHERE command_history_fts MATCH ?
      `;

      const params: any[] = [query];

      if (conditions.length > 0) {
        sql += ` AND ${conditions.join(' AND ')}`;
        params.push(...filterParams);
      }

      sql += ' ORDER BY ch.timestamp DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => {
        const entry = this.rowToEntry(row);
        if (outputLevel === 'excerpts') {
          return formatExcerpts(entry, query, contextLines);
        }
        return this.mapRowToEntry(row, outputLevel);
      });
    } catch (error) {
      logger.error({ error, query }, 'Failed to perform advanced search');
      return [];
    }
  }

  /**
   * Get aggregations
   */
  getAggregations(params: AggregationParams): AggregationResult[] {
    try {
      const { groupBy, includeStats, filters, limit } = params;
      const { conditions, params: filterParams } = this.buildFilterQuery(filters);

      let groupColumn: string;
      switch (groupBy) {
        case 'command':
          groupColumn = 'command';
          break;
        case 'cwd':
          groupColumn = 'cwd';
          break;
        case 'exitCode':
          groupColumn = 'exit_code';
          break;
        case 'hour':
          groupColumn = "strftime('%Y-%m-%d %H:00', timestamp)";
          break;
        case 'day':
          groupColumn = "strftime('%Y-%m-%d', timestamp)";
          break;
        default:
          groupColumn = 'command';
      }

      let sql = `
        SELECT
          ${groupColumn} as groupKey,
          COUNT(*) as count
      `;

      if (includeStats) {
        sql += `,
          AVG(duration) as avgDuration,
          SUM(CASE WHEN exit_code != 0 THEN 1 ELSE 0 END) as failures,
          MAX(timestamp) as lastExecuted
        `;
      }

      sql += ' FROM command_history';

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ` GROUP BY ${groupColumn}`;
      sql += ' ORDER BY count DESC';

      if (limit) {
        sql += ` LIMIT ${limit}`;
      }

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...filterParams) as any[];

      return rows.map(row => {
        const result: AggregationResult = {
          key: String(row.groupKey),
          count: row.count,
        };

        if (includeStats) {
          result.avgDuration = Math.round(row.avgDuration);
          result.failures = row.failures;
          result.successRate = row.count > 0
            ? Number(((row.count - row.failures) / row.count * 100).toFixed(2))
            : 0;
          result.lastExecuted = row.lastExecuted;
        }

        return result;
      });
    } catch (error) {
      logger.error({ error, params }, 'Failed to get aggregations');
      return [];
    }
  }

  /**
   * Compare two command executions
   */
  compareExecutions(commandId1: number, commandId2: number): DiffResult | null {
    try {
      const cmd1 = this.getCommandById(commandId1);
      const cmd2 = this.getCommandById(commandId2);

      if (!cmd1 || !cmd2) {
        return null;
      }

      const stdoutDiff = diffLines(cmd1.stdout || '', cmd2.stdout || '');
      const stderrDiff = diffLines(cmd1.stderr || '', cmd2.stderr || '');

      return {
        commandId1: cmd1.id!,
        commandId2: cmd2.id!,
        command1: cmd1.command,
        command2: cmd2.command,
        stdoutDiff,
        stderrDiff,
      };
    } catch (error) {
      logger.error({ error, commandId1, commandId2 }, 'Failed to compare executions');
      return null;
    }
  }

  /**
   * Get last failures
   */
  getLastFailures(
    limit: number = 10,
    outputLevel: OutputLevel = 'summary',
    since?: string
  ): any[] {
    try {
      let sql = 'SELECT * FROM command_history WHERE exit_code != 0';

      const params: any[] = [];
      if (since) {
        sql += ' AND timestamp >= ?';
        params.push(since);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => this.mapRowToEntry(row, outputLevel));
    } catch (error) {
      logger.error({ error }, 'Failed to get last failures');
      return [];
    }
  }

  /**
   * Get commands similar to a given command
   */
  getSimilarCommands(
    commandId: number,
    limit: number = 10,
    outputLevel: OutputLevel = 'summary'
  ): any[] {
    try {
      const reference = this.getCommandById(commandId);
      if (!reference) {
        return [];
      }

      // Find commands with similar:
      // 1. Same command name (first word)
      // 2. Same working directory
      const commandBase = reference.command.split(' ')[0];

      const sql = `
        SELECT * FROM command_history
        WHERE id != ?
          AND command LIKE ?
          AND cwd = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(commandId, `${commandBase}%`, reference.cwd, limit) as any[];

      return rows.map(row => this.mapRowToEntry(row, outputLevel));
    } catch (error) {
      logger.error({ error, commandId }, 'Failed to get similar commands');
      return [];
    }
  }

  /**
   * Get command chain (sequential commands in same working dir)
   */
  getCommandChain(
    startId: number,
    maxCommands: number = 10,
    outputLevel: OutputLevel = 'summary'
  ): any[] {
    try {
      const start = this.getCommandById(startId);
      if (!start) {
        return [];
      }

      // Get commands before and after in the same cwd
      const sql = `
        SELECT * FROM command_history
        WHERE cwd = ?
          AND ABS(id - ?) <= ?
        ORDER BY id
        LIMIT ?
      `;

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(start.cwd, startId, maxCommands, maxCommands * 2) as any[];

      return rows.map(row => this.mapRowToEntry(row, outputLevel));
    } catch (error) {
      logger.error({ error, startId }, 'Failed to get command chain');
      return [];
    }
  }

  /**
   * Helper: Get command by ID
   */
  private getCommandById(id: number): CommandHistoryEntry | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM command_history WHERE id = ?');
      const row = stmt.get(id) as any;
      return row ? this.rowToEntry(row) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Map database row to entry
   */
  private rowToEntry(row: any): CommandHistoryEntry {
    return {
      id: row.id,
      command: row.command,
      cwd: row.cwd,
      timestamp: row.timestamp,
      exitCode: row.exit_code,
      duration: row.duration,
      stdout: row.stdout || '',
      stderr: row.stderr || '',
      processId: row.process_id,
      status: row.status,
    };
  }

  /**
   * Helper: Map row to entry with output level
   */
  private mapRowToEntry(row: any, outputLevel: OutputLevel): any {
    const entry = this.rowToEntry(row);
    return formatCommandOutput(entry, outputLevel);
  }
}
