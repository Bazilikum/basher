/**
 * Audit Logger Service
 *
 * Logs security-relevant events for compliance and debugging:
 * - Command executions (allowed and blocked)
 * - Whitelist changes
 * - Security events (blocked commands, rate limits)
 */
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import logger from './logger.config.js';
/**
 * Audit Logger for security-relevant events
 */
export class AuditLogger {
    constructor(config) {
        this.logFilePath = null;
        this.enableConsole = config?.enableConsole ?? false;
        this.enableFile = config?.enableFile ?? true;
        if (config?.logFilePath) {
            this.setLogFilePath(config.logFilePath);
        }
    }
    /**
     * Set the log file path
     */
    setLogFilePath(logFilePath) {
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
    logCommandExecuted(command, exitCode, duration, metadata) {
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
    logCommandBlocked(command, commandBase, reason) {
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
    logCommandFailed(command, exitCode, reason) {
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
    logWhitelistAdded(commandBase, description) {
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
    logWhitelistRemoved(commandBase) {
        this.log({
            timestamp: new Date().toISOString(),
            eventType: 'whitelist_removed',
            commandBase,
        });
    }
    /**
     * Log rate limit exceeded event
     */
    logRateLimitExceeded(command, commandBase) {
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
    logSessionStarted(sessionName, sessionId) {
        this.log({
            timestamp: new Date().toISOString(),
            eventType: 'session_started',
            metadata: { sessionName, sessionId },
        });
    }
    /**
     * Log session end
     */
    logSessionEnded(sessionName, sessionId, status) {
        this.log({
            timestamp: new Date().toISOString(),
            eventType: 'session_ended',
            metadata: { sessionName, sessionId, status },
        });
    }
    /**
     * Log history cleared
     */
    logHistoryCleared() {
        this.log({
            timestamp: new Date().toISOString(),
            eventType: 'history_cleared',
            reason: 'User requested history clear',
        });
    }
    /**
     * Internal log method
     */
    log(event) {
        const logLine = JSON.stringify(event);
        // Console logging (for debugging)
        if (this.enableConsole) {
            logger.info(event, `Audit: ${event.eventType}`);
        }
        // File logging
        if (this.enableFile && this.logFilePath) {
            try {
                appendFileSync(this.logFilePath, logLine + '\n');
            }
            catch (error) {
                logger.error({ error, logFilePath: this.logFilePath }, 'Failed to write audit log');
            }
        }
    }
    /**
     * Get recent audit events (for debugging/monitoring)
     */
    getRecentEvents(limit = 100) {
        if (!this.logFilePath || !existsSync(this.logFilePath)) {
            return [];
        }
        try {
            const { readFileSync } = require('fs');
            const content = readFileSync(this.logFilePath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            return lines
                .slice(-limit)
                .map((line) => {
                try {
                    return JSON.parse(line);
                }
                catch {
                    return null;
                }
            })
                .filter((e) => e !== null);
        }
        catch (error) {
            logger.error({ error }, 'Failed to read audit log');
            return [];
        }
    }
}
// Default export for convenience
export default AuditLogger;
