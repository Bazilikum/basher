/**
 * Centralized constants for Basher MCP Server
 *
 * This file contains all magic numbers and configuration defaults
 * to ensure consistency and easy modification across the codebase.
 */
// =============================================================================
// PROCESS MANAGEMENT
// =============================================================================
/** Timeout before sending SIGKILL after SIGTERM (ms) */
export const SIGKILL_TIMEOUT_MS = 5000;
/** Interval for flushing process output to database (ms) */
export const FLUSH_INTERVAL_MS = 2000;
/** Interval for checking if orphaned process is still alive (ms) */
export const ORPHAN_CHECK_INTERVAL_MS = 1000;
/** Debounce delay for saving process state to file (ms) */
export const STATE_SAVE_DEBOUNCE_MS = 100;
// =============================================================================
// HISTORY MANAGEMENT
// =============================================================================
/** Default maximum number of history entries to keep */
export const DEFAULT_MAX_ENTRIES = 1000;
/** Default maximum age of history entries (days) */
export const DEFAULT_MAX_AGE_DAYS = 7;
/** SQLite busy timeout for handling concurrent access (ms) */
export const SQLITE_BUSY_TIMEOUT_MS = 1000;
/** Number of saves between automatic cleanup runs */
export const CLEANUP_INTERVAL_SAVES = 100;
/** Time between automatic cleanup runs (ms) - 5 minutes */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
// =============================================================================
// POLLING & TIMEOUTS
// =============================================================================
/** Default timeout for waitFor pattern matching (ms) */
export const DEFAULT_WAIT_FOR_TIMEOUT_MS = 30000;
/** Default poll interval for poll_until_complete (ms) */
export const DEFAULT_POLL_INTERVAL_MS = 1000;
/** Minimum poll interval allowed (ms) */
export const MIN_POLL_INTERVAL_MS = 500;
/** Default timeout for poll_until_complete (ms) - 5 minutes */
export const DEFAULT_POLL_TIMEOUT_MS = 300000;
/** Threshold for considering a command stale/from previous session (ms) - 1 hour */
export const STALE_COMMAND_THRESHOLD_MS = 60 * 60 * 1000;
// =============================================================================
// WEB SERVER
// =============================================================================
/** Default web server port */
export const DEFAULT_WEB_PORT = 3000;
/** Rate limit: requests per minute for general API endpoints */
export const RATE_LIMIT_GENERAL_PER_MIN = 200;
/** Rate limit: requests per minute for command execution */
export const RATE_LIMIT_EXECUTE_PER_MIN = 60;
/** Rate limit: requests per minute for destructive operations */
export const RATE_LIMIT_DESTRUCTIVE_PER_MIN = 10;
/** Maximum request body size */
export const MAX_REQUEST_BODY_SIZE = '10mb';
/** Maximum command length in web requests */
export const MAX_COMMAND_LENGTH = 10000;
/** Maximum title length */
export const MAX_TITLE_LENGTH = 500;
/** Maximum search query length */
export const MAX_SEARCH_QUERY_LENGTH = 1000;
/** Maximum results per search query */
export const MAX_SEARCH_RESULTS = 1000;
// =============================================================================
// OUTPUT & DISPLAY
// =============================================================================
/** Default number of recent commands to retrieve */
export const DEFAULT_RECENT_COMMANDS_LIMIT = 100;
/** Default search result limit */
export const DEFAULT_SEARCH_LIMIT = 50;
/** Default context lines for excerpts mode */
export const DEFAULT_CONTEXT_LINES = 3;
/** Number of tail lines for 'tail' output mode */
export const TAIL_OUTPUT_LINES = 20;
/** Maximum retry attempts for flaky commands */
export const MAX_RETRY_ATTEMPTS = 10;
/** Default retry delay (ms) */
export const DEFAULT_RETRY_DELAY_MS = 1000;
// =============================================================================
// EXIT CODES
// =============================================================================
/** Exit code for command timeout */
export const EXIT_CODE_TIMEOUT = 124;
/** Exit code for general failure */
export const EXIT_CODE_FAILURE = 1;
/** Placeholder exit code for running commands */
export const EXIT_CODE_RUNNING = -1;
