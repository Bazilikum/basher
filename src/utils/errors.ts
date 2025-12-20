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
export enum BasherErrorCode {
  // Database errors (1xxx)
  DATABASE_ERROR = 1000,
  DATABASE_MIGRATION_FAILED = 1001,
  DATABASE_CORRUPTION = 1002,
  FTS_SYNC_ERROR = 1003,

  // Command execution errors (2xxx)
  COMMAND_EXECUTION_FAILED = 2000,
  COMMAND_TIMEOUT = 2001,
  COMMAND_NOT_WHITELISTED = 2002,
  PROCESS_NOT_FOUND = 2003,
  PROCESS_ALREADY_COMPLETED = 2004,

  // Configuration errors (3xxx)
  INVALID_CONFIGURATION = 3000,
  MISSING_PROJECT_PATH = 3001,
  WHITELIST_FILE_ERROR = 3002,

  // Web server errors (4xxx)
  SERVER_START_FAILED = 4000,
  PORT_UNAVAILABLE = 4001,

  // General errors (9xxx)
  UNKNOWN_ERROR = 9000,
  VALIDATION_ERROR = 9001,
}

/**
 * Base error class for Basher-specific errors
 */
export class BasherError extends Error {
  public readonly code: BasherErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly isRetryable: boolean;

  public readonly cause?: Error;

  constructor(
    code: BasherErrorCode,
    message: string,
    options?: {
      cause?: Error;
      details?: Record<string, unknown>;
      isRetryable?: boolean;
    }
  ) {
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
  toJSON(): Record<string, unknown> {
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
  constructor(
    message: string,
    options?: {
      cause?: Error;
      details?: Record<string, unknown>;
      code?: BasherErrorCode;
    }
  ) {
    super(
      options?.code ?? BasherErrorCode.DATABASE_ERROR,
      message,
      {
        cause: options?.cause,
        details: options?.details,
        isRetryable: true, // SQLite errors are often transient
      }
    );
    this.name = 'DatabaseError';
  }
}

/**
 * Command execution error
 */
export class CommandExecutionError extends BasherError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      details?: Record<string, unknown>;
      code?: BasherErrorCode;
    }
  ) {
    super(
      options?.code ?? BasherErrorCode.COMMAND_EXECUTION_FAILED,
      message,
      {
        cause: options?.cause,
        details: options?.details,
        isRetryable: false,
      }
    );
    this.name = 'CommandExecutionError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends BasherError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      details?: Record<string, unknown>;
      code?: BasherErrorCode;
    }
  ) {
    super(
      options?.code ?? BasherErrorCode.INVALID_CONFIGURATION,
      message,
      {
        cause: options?.cause,
        details: options?.details,
        isRetryable: false,
      }
    );
    this.name = 'ConfigurationError';
  }
}

/**
 * Result type for operations that can fail
 * Use this instead of throwing for expected failure cases
 */
export type Result<T, E = BasherError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wrap an async operation with standardized error handling
 * Logs errors and optionally transforms them
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options?: {
    logLevel?: 'error' | 'warn' | 'info';
    transformError?: (error: unknown) => BasherError;
    rethrow?: boolean;
  }
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const logLevel = options?.logLevel ?? 'error';
    const logData = {
      context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };

    if (logLevel === 'error') {
      logger.error(logData, `Error in ${context}`);
    } else if (logLevel === 'warn') {
      logger.warn(logData, `Warning in ${context}`);
    } else {
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
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts: number;
    initialDelayMs: number;
    backoff: 'none' | 'linear' | 'exponential';
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  }
): Promise<T> {
  let lastError: unknown;
  let delayMs = options.initialDelayMs;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
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
export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Assert a condition, throwing BasherError if false
 */
export function assert(
  condition: boolean,
  message: string,
  code: BasherErrorCode = BasherErrorCode.UNKNOWN_ERROR
): asserts condition {
  if (!condition) {
    throw new BasherError(code, message);
  }
}

/**
 * Assert a value is not null/undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
  code: BasherErrorCode = BasherErrorCode.UNKNOWN_ERROR
): asserts value is T {
  if (value === null || value === undefined) {
    throw new BasherError(code, message);
  }
}
