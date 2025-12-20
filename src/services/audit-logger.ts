/**
 * Audit Logger Service
 *
 * Logs security-relevant events for compliance and debugging:
 * - Command executions (allowed and blocked)
 * - Whitelist changes
 * - Security events (blocked commands, rate limits)
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import logger from './logger.config.js';

export type AuditEventType =
  | 'command_executed'
  | 'command_blocked'
  | 'command_failed'
  | 'whitelist_added'
  | 'whitelist_removed'
  | 'rate_limit_exceeded'
  | 'session_started'
  | 'session_ended'
  | 'history_cleared';

export interface AuditEvent {
  timestamp: string;
  eventType: AuditEventType;
  command?: string;
  commandBase?: string;
  exitCode?: number;
  duration?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLoggerConfig {
  logFilePath?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
}

/**
 * Audit Logger for security-relevant events
 */
export class AuditLogger {
  private logFilePath: string | null = null;
  private enableConsole: boolean;
  private enableFile: boolean;

  constructor(config?: AuditLoggerConfig) {
    this.enableConsole = config?.enableConsole ?? false;
    this.enableFile = config?.enableFile ?? true;

    if (config?.logFilePath) {
      this.setLogFilePath(config.logFilePath);
    }
  }

  /**
   * Set the log file path
   */
  setLogFilePath(logFilePath: string): void {
    this.logFilePath = logFilePath;

    // Ensure directory exists
    const dir = dirname(logFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Log a command execution event
   */
  logCommandExecuted(
    command: string,
    exitCode: number,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'command_executed',
      command,
      exitCode,
      duration,
      metadata,
    });
  }

  /**
   * Log a blocked command event
   */
  logCommandBlocked(command: string, commandBase: string, reason: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'command_blocked',
      command,
      commandBase,
      reason,
    });
  }

  /**
   * Log a command failure event
   */
  logCommandFailed(command: string, exitCode: number, reason?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'command_failed',
      command,
      exitCode,
      reason,
    });
  }

  /**
   * Log whitelist addition
   */
  logWhitelistAdded(commandBase: string, description?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'whitelist_added',
      commandBase,
      metadata: description ? { description } : undefined,
    });
  }

  /**
   * Log whitelist removal
   */
  logWhitelistRemoved(commandBase: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'whitelist_removed',
      commandBase,
    });
  }

  /**
   * Log rate limit exceeded event
   */
  logRateLimitExceeded(command: string, commandBase: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'rate_limit_exceeded',
      command,
      commandBase,
      reason: 'Rate limit exceeded',
    });
  }

  /**
   * Log session start
   */
  logSessionStarted(sessionName: string, sessionId: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'session_started',
      metadata: { sessionName, sessionId },
    });
  }

  /**
   * Log session end
   */
  logSessionEnded(sessionName: string, sessionId: number, status: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'session_ended',
      metadata: { sessionName, sessionId, status },
    });
  }

  /**
   * Log history cleared
   */
  logHistoryCleared(): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'history_cleared',
      reason: 'User requested history clear',
    });
  }

  /**
   * Internal log method
   */
  private log(event: AuditEvent): void {
    const logLine = JSON.stringify(event);

    // Console logging (for debugging)
    if (this.enableConsole) {
      logger.info(event, `Audit: ${event.eventType}`);
    }

    // File logging
    if (this.enableFile && this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + '\n');
      } catch (error) {
        logger.error({ error, logFilePath: this.logFilePath }, 'Failed to write audit log');
      }
    }
  }

  /**
   * Get recent audit events (for debugging/monitoring)
   */
  getRecentEvents(limit: number = 100): AuditEvent[] {
    if (!this.logFilePath || !existsSync(this.logFilePath)) {
      return [];
    }

    try {
      const { readFileSync } = require('fs');
      const content = readFileSync(this.logFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      return lines
        .slice(-limit)
        .map((line: string) => {
          try {
            return JSON.parse(line) as AuditEvent;
          } catch {
            return null;
          }
        })
        .filter((e: AuditEvent | null): e is AuditEvent => e !== null);
    } catch (error) {
      logger.error({ error }, 'Failed to read audit log');
      return [];
    }
  }
}

// Default export for convenience
export default AuditLogger;
