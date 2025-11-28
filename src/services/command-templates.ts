/**
 * Command Templates Service
 * Store and manage reusable command templates
 */

import Database from 'better-sqlite3';
import logger from './logger.config.js';
import type { ParserType } from './output-parser.js';

export interface CommandTemplate {
  name: string;
  command: string;
  title?: string;
  cwd?: string;
  timeout?: number;
  parseAs?: ParserType;
  waitFor?: string;
  waitTimeout?: number;
  retry?: {
    attempts: number;
    backoff: 'none' | 'linear' | 'exponential';
    delayMs?: number;
  };
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  command: string;
  title?: string;
  cwd?: string;
  timeout?: number;
  parseAs?: ParserType;
  waitFor?: string;
  waitTimeout?: number;
  retry?: {
    attempts: number;
    backoff?: 'none' | 'linear' | 'exponential';
    delayMs?: number;
  };
  description?: string;
  tags?: string[];
}

export class CommandTemplateManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeTable();
  }

  private initializeTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_templates (
        name TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        title TEXT,
        cwd TEXT,
        timeout INTEGER,
        parse_as TEXT,
        wait_for TEXT,
        wait_timeout INTEGER,
        retry_config TEXT,
        description TEXT,
        tags TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create index on tags for searching
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_templates_tags ON command_templates(tags)
    `);

    logger.info('Command templates table initialized');
  }

  /**
   * Create or update a command template
   */
  save(input: CreateTemplateInput): CommandTemplate {
    const now = new Date().toISOString();
    const existing = this.get(input.name);

    // Normalize retry config with default backoff
    const retry = input.retry ? {
      attempts: input.retry.attempts,
      backoff: input.retry.backoff || 'none' as const,
      delayMs: input.retry.delayMs,
    } : undefined;

    const template: CommandTemplate = {
      ...input,
      retry,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO command_templates
      (name, command, title, cwd, timeout, parse_as, wait_for, wait_timeout, retry_config, description, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      template.name,
      template.command,
      template.title || null,
      template.cwd || null,
      template.timeout || null,
      template.parseAs || null,
      template.waitFor || null,
      template.waitTimeout || null,
      template.retry ? JSON.stringify(template.retry) : null,
      template.description || null,
      template.tags ? JSON.stringify(template.tags) : null,
      template.createdAt,
      template.updatedAt
    );

    logger.info({ templateName: input.name }, 'Command template saved');
    return template;
  }

  /**
   * Get a template by name
   */
  get(name: string): CommandTemplate | null {
    const stmt = this.db.prepare(`
      SELECT * FROM command_templates WHERE name = ?
    `);

    const row = stmt.get(name) as any;
    if (!row) return null;

    return this.rowToTemplate(row);
  }

  /**
   * List all templates
   */
  list(tag?: string): CommandTemplate[] {
    let stmt;
    let rows: any[];

    if (tag) {
      stmt = this.db.prepare(`
        SELECT * FROM command_templates WHERE tags LIKE ? ORDER BY name
      `);
      rows = stmt.all(`%"${tag}"%`) as any[];
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM command_templates ORDER BY name
      `);
      rows = stmt.all() as any[];
    }

    return rows.map(row => this.rowToTemplate(row));
  }

  /**
   * Delete a template
   */
  delete(name: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM command_templates WHERE name = ?
    `);

    const result = stmt.run(name);
    const deleted = result.changes > 0;

    if (deleted) {
      logger.info({ templateName: name }, 'Command template deleted');
    }

    return deleted;
  }

  /**
   * Search templates by name or description
   */
  search(query: string): CommandTemplate[] {
    const stmt = this.db.prepare(`
      SELECT * FROM command_templates
      WHERE name LIKE ? OR description LIKE ? OR command LIKE ?
      ORDER BY name
    `);

    const pattern = `%${query}%`;
    const rows = stmt.all(pattern, pattern, pattern) as any[];

    return rows.map(row => this.rowToTemplate(row));
  }

  private rowToTemplate(row: any): CommandTemplate {
    return {
      name: row.name,
      command: row.command,
      title: row.title || undefined,
      cwd: row.cwd || undefined,
      timeout: row.timeout || undefined,
      parseAs: row.parse_as || undefined,
      waitFor: row.wait_for || undefined,
      waitTimeout: row.wait_timeout || undefined,
      retry: row.retry_config ? JSON.parse(row.retry_config) : undefined,
      description: row.description || undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
