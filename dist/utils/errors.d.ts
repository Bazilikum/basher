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
/**
 * Error codes for Basher-specific errors
 */
export declare enum BasherErrorCode {
    DATABASE_ERROR = 1000,
    DATABASE_MIGRATION_FAILED = 1001,
    DATABASE_CORRUPTION = 1002,
    FTS_SYNC_ERROR = 1003,
    COMMAND_EXECUTION_FAILED = 2000,
    COMMAND_TIMEOUT = 2001,
    COMMAND_NOT_WHITELISTED = 2002,
    PROCESS_NOT_FOUND = 2003,
    PROCESS_ALREADY_COMPLETED = 2004,
    INVALID_CONFIGURATION = 3000,
    MISSING_PROJECT_PATH = 3001,
    WHITELIST_FILE_ERROR = 3002,
    SERVER_START_FAILED = 4000,
    PORT_UNAVAILABLE = 4001,
    UNKNOWN_ERROR = 9000,
    VALIDATION_ERROR = 9001
}
/**
 * Base error class for Basher-specific errors
 */
export declare class BasherError extends Error {
    readonly code: BasherErrorCode;
    readonly details?: Record<string, unknown>;
    readonly isRetryable: boolean;
    readonly cause?: Error;
    constructor(code: BasherErrorCode, message: string, options?: {
        cause?: Error;
        details?: Record<string, unknown>;
        isRetryable?: boolean;
    });
    /**
     * Convert to a JSON-serializable object for API responses
     */
    toJSON(): Record<string, unknown>;
}
/**
 * Database-specific error
 */
export declare class DatabaseError extends BasherError {
    constructor(message: string, options?: {
        cause?: Error;
        details?: Record<string, unknown>;
        code?: BasherErrorCode;
    });
}
/**
 * Command execution error
 */
export declare class CommandExecutionError extends BasherError {
    constructor(message: string, options?: {
        cause?: Error;
        details?: Record<string, unknown>;
        code?: BasherErrorCode;
    });
}
/**
 * Configuration error
 */
export declare class ConfigurationError extends BasherError {
    constructor(message: string, options?: {
        cause?: Error;
        details?: Record<string, unknown>;
        code?: BasherErrorCode;
    });
}
/**
 * Result type for operations that can fail
 * Use this instead of throwing for expected failure cases
 */
export type Result<T, E = BasherError> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};
/**
 * Create a successful result
 */
export declare function ok<T>(data: T): Result<T, never>;
/**
 * Create a failed result
 */
export declare function err<E>(error: E): Result<never, E>;
/**
 * Wrap an async operation with standardized error handling
 * Logs errors and optionally transforms them
 */
export declare function withErrorHandling<T>(operation: () => Promise<T>, context: string, options?: {
    logLevel?: 'error' | 'warn' | 'info';
    transformError?: (error: unknown) => BasherError;
    rethrow?: boolean;
}): Promise<T | null>;
/**
 * Retry an operation with exponential backoff
 */
export declare function withRetry<T>(operation: () => Promise<T>, options: {
    maxAttempts: number;
    initialDelayMs: number;
    backoff: 'none' | 'linear' | 'exponential';
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}): Promise<T>;
/**
 * Safe JSON parse that returns null on failure instead of throwing
 */
export declare function safeJsonParse<T>(json: string): T | null;
/**
 * Assert a condition, throwing BasherError if false
 */
export declare function assert(condition: boolean, message: string, code?: BasherErrorCode): asserts condition;
/**
 * Assert a value is not null/undefined
 */
export declare function assertDefined<T>(value: T | null | undefined, message: string, code?: BasherErrorCode): asserts value is T;
