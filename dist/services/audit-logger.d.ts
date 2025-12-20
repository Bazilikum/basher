/**
 * Audit Logger Service
 *
 * Logs security-relevant events for compliance and debugging:
 * - Command executions (allowed and blocked)
 * - Whitelist changes
 * - Security events (blocked commands, rate limits)
 */
export type AuditEventType = 'command_executed' | 'command_blocked' | 'command_failed' | 'whitelist_added' | 'whitelist_removed' | 'rate_limit_exceeded' | 'session_started' | 'session_ended' | 'history_cleared';
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
export declare class AuditLogger {
    private logFilePath;
    private enableConsole;
    private enableFile;
    constructor(config?: AuditLoggerConfig);
    /**
     * Set the log file path
     */
    setLogFilePath(logFilePath: string): void;
    /**
     * Log a command execution event
     */
    logCommandExecuted(command: string, exitCode: number, duration: number, metadata?: Record<string, unknown>): void;
    /**
     * Log a blocked command event
     */
    logCommandBlocked(command: string, commandBase: string, reason: string): void;
    /**
     * Log a command failure event
     */
    logCommandFailed(command: string, exitCode: number, reason?: string): void;
    /**
     * Log whitelist addition
     */
    logWhitelistAdded(commandBase: string, description?: string): void;
    /**
     * Log whitelist removal
     */
    logWhitelistRemoved(commandBase: string): void;
    /**
     * Log rate limit exceeded event
     */
    logRateLimitExceeded(command: string, commandBase: string): void;
    /**
     * Log session start
     */
    logSessionStarted(sessionName: string, sessionId: number): void;
    /**
     * Log session end
     */
    logSessionEnded(sessionName: string, sessionId: number, status: string): void;
    /**
     * Log history cleared
     */
    logHistoryCleared(): void;
    /**
     * Internal log method
     */
    private log;
    /**
     * Get recent audit events (for debugging/monitoring)
     */
    getRecentEvents(limit?: number): AuditEvent[];
}
export default AuditLogger;
