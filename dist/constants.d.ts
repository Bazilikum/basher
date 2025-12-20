/**
 * Centralized constants for Basher MCP Server
 *
 * This file contains all magic numbers and configuration defaults
 * to ensure consistency and easy modification across the codebase.
 */
/** Timeout before sending SIGKILL after SIGTERM (ms) */
export declare const SIGKILL_TIMEOUT_MS = 5000;
/** Interval for flushing process output to database (ms) */
export declare const FLUSH_INTERVAL_MS = 2000;
/** Interval for checking if orphaned process is still alive (ms) */
export declare const ORPHAN_CHECK_INTERVAL_MS = 1000;
/** Debounce delay for saving process state to file (ms) */
export declare const STATE_SAVE_DEBOUNCE_MS = 100;
/** Default maximum number of history entries to keep */
export declare const DEFAULT_MAX_ENTRIES = 1000;
/** Default maximum age of history entries (days) */
export declare const DEFAULT_MAX_AGE_DAYS = 7;
/** SQLite busy timeout for handling concurrent access (ms) */
export declare const SQLITE_BUSY_TIMEOUT_MS = 1000;
/** Number of saves between automatic cleanup runs */
export declare const CLEANUP_INTERVAL_SAVES = 100;
/** Time between automatic cleanup runs (ms) - 5 minutes */
export declare const CLEANUP_INTERVAL_MS: number;
/** Default timeout for waitFor pattern matching (ms) */
export declare const DEFAULT_WAIT_FOR_TIMEOUT_MS = 30000;
/** Default poll interval for poll_until_complete (ms) */
export declare const DEFAULT_POLL_INTERVAL_MS = 1000;
/** Minimum poll interval allowed (ms) */
export declare const MIN_POLL_INTERVAL_MS = 500;
/** Default timeout for poll_until_complete (ms) - 5 minutes */
export declare const DEFAULT_POLL_TIMEOUT_MS = 300000;
/** Threshold for considering a command stale/from previous session (ms) - 1 hour */
export declare const STALE_COMMAND_THRESHOLD_MS: number;
/** Default web server port */
export declare const DEFAULT_WEB_PORT = 3000;
/** Rate limit: requests per minute for general API endpoints */
export declare const RATE_LIMIT_GENERAL_PER_MIN = 200;
/** Rate limit: requests per minute for command execution */
export declare const RATE_LIMIT_EXECUTE_PER_MIN = 60;
/** Rate limit: requests per minute for destructive operations */
export declare const RATE_LIMIT_DESTRUCTIVE_PER_MIN = 10;
/** Maximum request body size */
export declare const MAX_REQUEST_BODY_SIZE = "10mb";
/** Maximum command length in web requests */
export declare const MAX_COMMAND_LENGTH = 10000;
/** Maximum title length */
export declare const MAX_TITLE_LENGTH = 500;
/** Maximum search query length */
export declare const MAX_SEARCH_QUERY_LENGTH = 1000;
/** Maximum results per search query */
export declare const MAX_SEARCH_RESULTS = 1000;
/** Default number of recent commands to retrieve */
export declare const DEFAULT_RECENT_COMMANDS_LIMIT = 100;
/** Default search result limit */
export declare const DEFAULT_SEARCH_LIMIT = 50;
/** Default context lines for excerpts mode */
export declare const DEFAULT_CONTEXT_LINES = 3;
/** Number of tail lines for 'tail' output mode */
export declare const TAIL_OUTPUT_LINES = 20;
/** Maximum retry attempts for flaky commands */
export declare const MAX_RETRY_ATTEMPTS = 10;
/** Default retry delay (ms) */
export declare const DEFAULT_RETRY_DELAY_MS = 1000;
/** Exit code for command timeout */
export declare const EXIT_CODE_TIMEOUT = 124;
/** Exit code for general failure */
export declare const EXIT_CODE_FAILURE = 1;
/** Placeholder exit code for running commands */
export declare const EXIT_CODE_RUNNING = -1;
