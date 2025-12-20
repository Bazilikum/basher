/**
 * Error handling utilities for Basher
 *
 * This module provides standardized error types and handling patterns
 * to ensure consistent error handling across the codebase.
 *
 * ERROR HANDLING STRATEGY:
 * - Database operations: Throw on critical errors, return null for "not found"
 * - Command execution: Throw on spawn errors, return result with exitCode for failures
 * - Validation: Throw ZodError for invalid input
 * - MCP tools: Throw McpError for protocol errors, return error content for tool failures
 */
import logger from '../services/logger.config.js';
/**
 * Error codes for Basher-specific errors
 */
export var BasherErrorCode;
(function (BasherErrorCode) {
    // Database errors (1xxx)
    BasherErrorCode[BasherErrorCode["DATABASE_ERROR"] = 1000] = "DATABASE_ERROR";
    BasherErrorCode[BasherErrorCode["DATABASE_MIGRATION_FAILED"] = 1001] = "DATABASE_MIGRATION_FAILED";
    BasherErrorCode[BasherErrorCode["DATABASE_CORRUPTION"] = 1002] = "DATABASE_CORRUPTION";
    BasherErrorCode[BasherErrorCode["FTS_SYNC_ERROR"] = 1003] = "FTS_SYNC_ERROR";
    // Command execution errors (2xxx)
    BasherErrorCode[BasherErrorCode["COMMAND_EXECUTION_FAILED"] = 2000] = "COMMAND_EXECUTION_FAILED";
    BasherErrorCode[BasherErrorCode["COMMAND_TIMEOUT"] = 2001] = "COMMAND_TIMEOUT";
    BasherErrorCode[BasherErrorCode["COMMAND_NOT_WHITELISTED"] = 2002] = "COMMAND_NOT_WHITELISTED";
    BasherErrorCode[BasherErrorCode["PROCESS_NOT_FOUND"] = 2003] = "PROCESS_NOT_FOUND";
    BasherErrorCode[BasherErrorCode["PROCESS_ALREADY_COMPLETED"] = 2004] = "PROCESS_ALREADY_COMPLETED";
    // Configuration errors (3xxx)
    BasherErrorCode[BasherErrorCode["INVALID_CONFIGURATION"] = 3000] = "INVALID_CONFIGURATION";
    BasherErrorCode[BasherErrorCode["MISSING_PROJECT_PATH"] = 3001] = "MISSING_PROJECT_PATH";
    BasherErrorCode[BasherErrorCode["WHITELIST_FILE_ERROR"] = 3002] = "WHITELIST_FILE_ERROR";
    // Web server errors (4xxx)
    BasherErrorCode[BasherErrorCode["SERVER_START_FAILED"] = 4000] = "SERVER_START_FAILED";
    BasherErrorCode[BasherErrorCode["PORT_UNAVAILABLE"] = 4001] = "PORT_UNAVAILABLE";
    // General errors (9xxx)
    BasherErrorCode[BasherErrorCode["UNKNOWN_ERROR"] = 9000] = "UNKNOWN_ERROR";
    BasherErrorCode[BasherErrorCode["VALIDATION_ERROR"] = 9001] = "VALIDATION_ERROR";
})(BasherErrorCode || (BasherErrorCode = {}));
/**
 * Base error class for Basher-specific errors
 */
export class BasherError extends Error {
    constructor(code, message, options) {
        super(message);
        this.name = 'BasherError';
        this.code = code;
        this.cause = options?.cause;
        this.details = options?.details;
        this.isRetryable = options?.isRetryable ?? false;
        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BasherError);
        }
    }
    /**
     * Convert to a JSON-serializable object for API responses
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            isRetryable: this.isRetryable,
            cause: this.cause?.message,
        };
    }
}
/**
 * Database-specific error
 */
export class DatabaseError extends BasherError {
    constructor(message, options) {
        super(options?.code ?? BasherErrorCode.DATABASE_ERROR, message, {
            cause: options?.cause,
            details: options?.details,
            isRetryable: true, // SQLite errors are often transient
        });
        this.name = 'DatabaseError';
    }
}
/**
 * Command execution error
 */
export class CommandExecutionError extends BasherError {
    constructor(message, options) {
        super(options?.code ?? BasherErrorCode.COMMAND_EXECUTION_FAILED, message, {
            cause: options?.cause,
            details: options?.details,
            isRetryable: false,
        });
        this.name = 'CommandExecutionError';
    }
}
/**
 * Configuration error
 */
export class ConfigurationError extends BasherError {
    constructor(message, options) {
        super(options?.code ?? BasherErrorCode.INVALID_CONFIGURATION, message, {
            cause: options?.cause,
            details: options?.details,
            isRetryable: false,
        });
        this.name = 'ConfigurationError';
    }
}
/**
 * Create a successful result
 */
export function ok(data) {
    return { success: true, data };
}
/**
 * Create a failed result
 */
export function err(error) {
    return { success: false, error };
}
/**
 * Wrap an async operation with standardized error handling
 * Logs errors and optionally transforms them
 */
export async function withErrorHandling(operation, context, options) {
    try {
        return await operation();
    }
    catch (error) {
        const logLevel = options?.logLevel ?? 'error';
        const logData = {
            context,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        };
        if (logLevel === 'error') {
            logger.error(logData, `Error in ${context}`);
        }
        else if (logLevel === 'warn') {
            logger.warn(logData, `Warning in ${context}`);
        }
        else {
            logger.info(logData, `Info in ${context}`);
        }
        if (options?.rethrow) {
            if (options.transformError) {
                throw options.transformError(error);
            }
            throw error;
        }
        return null;
    }
}
/**
 * Retry an operation with exponential backoff
 */
export async function withRetry(operation, options) {
    let lastError;
    let delayMs = options.initialDelayMs;
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            // Check if we should retry
            const shouldRetry = options.shouldRetry?.(error, attempt) ??
                (error instanceof BasherError ? error.isRetryable : false);
            if (!shouldRetry || attempt === options.maxAttempts) {
                throw error;
            }
            // Notify about retry
            options.onRetry?.(error, attempt, delayMs);
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delayMs));
            // Calculate next delay
            switch (options.backoff) {
                case 'linear':
                    delayMs += options.initialDelayMs;
                    break;
                case 'exponential':
                    delayMs *= 2;
                    break;
                // 'none': keep same delay
            }
        }
    }
    throw lastError;
}
/**
 * Safe JSON parse that returns null on failure instead of throwing
 */
export function safeJsonParse(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
/**
 * Assert a condition, throwing BasherError if false
 */
export function assert(condition, message, code = BasherErrorCode.UNKNOWN_ERROR) {
    if (!condition) {
        throw new BasherError(code, message);
    }
}
/**
 * Assert a value is not null/undefined
 */
export function assertDefined(value, message, code = BasherErrorCode.UNKNOWN_ERROR) {
    if (value === null || value === undefined) {
        throw new BasherError(code, message);
    }
}
