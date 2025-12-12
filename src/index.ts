#!/usr/bin/env node

/**
 * Basher - MCP Server for Enhanced Command Execution
 *
 * This MCP server provides enhanced command execution with:
 * - Real-time output streaming
 * - Structured logging with Pino
 * - Persistent command history with SQLite
 * - Full-text search across commands and outputs
 * - Execution metadata tracking (duration, exit codes, etc.)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { join, resolve, dirname } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import logger from './services/logger.config.js';
import { HistoryManager, type HistoryManagerOptions } from './services/history-manager.js';
import { executeCommand, type CommandExecutionCallbacks } from './services/command-executor.js';
import { processManager } from './services/process-manager.js';
import { WebServer } from './services/web-server.js';
import { InstanceDetector, type ExistingInstance } from './services/instance-detector.js';
import { InstanceNotifier } from './services/instance-notifier.js';
import { encodeOutput, type OutputFormat } from './utils/toon-encoder.js';
import {
  parseOutput,
  getSmartSummary,
  estimateTokens,
  interpretExitCode,
  trackProgress,
  type ParserType,
} from './services/output-parser.js';
import { CommandTemplateManager, type CreateTemplateInput } from './services/command-templates.js';
import { CommandSessionManager } from './services/command-sessions.js';
import { analyzeFailure, diffOutputs } from './services/failure-analyzer.js';
import { whitelistManager, extractCommandBase } from './services/whitelist-manager.js';

// Read package.json for version info
const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

/**
 * Determine the project directory and database path
 * Priority order:
 * 1. --project command-line argument
 * 2. BASHER_PROJECT_ROOT environment variable
 * 3. DB_PATH environment variable (legacy, for backward compatibility)
 * 4. Home directory (fallback)
 */
function determineProjectPath(): string | null {
  // 1. Check for --project argument
  const argIndex = process.argv.indexOf('--project');
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return resolve(process.argv[argIndex + 1]);
  }

  // 2. Check for BASHER_PROJECT_ROOT environment variable
  if (process.env.BASHER_PROJECT_ROOT) {
    return resolve(process.env.BASHER_PROJECT_ROOT);
  }

  // 3. Check for legacy DB_PATH (return null to use DB_PATH directly)
  if (process.env.DB_PATH) {
    logger.info('Using legacy DB_PATH configuration');
    return null; // Will use DB_PATH directly
  }

  // 4. Fallback to home directory
  logger.warn(
    'No project directory specified. Using home directory as fallback. ' +
    'For project-specific isolation, use --project argument or BASHER_PROJECT_ROOT env variable.'
  );
  return homedir();
}

function initializeDatabase(): { dbPath: string; basherDir: string } {
  // Legacy support: if DB_PATH is explicitly set, use it directly
  if (process.env.DB_PATH) {
    const basherDir = dirname(process.env.DB_PATH);
    return { dbPath: process.env.DB_PATH, basherDir };
  }

  const projectPath = determineProjectPath();
  if (!projectPath) {
    throw new Error('Unable to determine project path');
  }

  const basherDir = join(projectPath, '.basher');

  // Create .basher directory if it doesn't exist
  if (!existsSync(basherDir)) {
    mkdirSync(basherDir, { recursive: true });
    logger.info({ basherDir }, 'Created .basher directory');

    // Create .gitignore to exclude database files and runtime files from version control
    const gitignorePath = join(basherDir, '.gitignore');
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, '*.db\n*.db-shm\n*.db-wal\nport\npid\n');
      logger.info('Created .basher/.gitignore');
    }
  }

  const dbPath = join(basherDir, 'history.db');
  logger.info({ projectPath, dbPath }, 'Database initialized for project');

  return { dbPath, basherDir };
}

// Initialize history manager with project-specific database and cleanup options
const { dbPath, basherDir } = initializeDatabase();

// Configure cleanup limits from environment variables
const historyOptions: HistoryManagerOptions = {
  // Max entries: BASHER_MAX_ENTRIES env var, default 1000
  maxEntries: process.env.BASHER_MAX_ENTRIES ? parseInt(process.env.BASHER_MAX_ENTRIES, 10) : 1000,
  // Max age: BASHER_MAX_AGE_DAYS env var (in days), default 7 days
  maxAgeMs: process.env.BASHER_MAX_AGE_DAYS
    ? parseInt(process.env.BASHER_MAX_AGE_DAYS, 10) * 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000,
};

const historyManager = new HistoryManager(dbPath, historyOptions);

// Initialize template and session managers (share the same database)
const templateManager = new CommandTemplateManager(historyManager.getDatabase());
const sessionManager = new CommandSessionManager(historyManager.getDatabase());

// Initialize process manager with basher directory for state persistence
processManager.initialize(basherDir);

// Initialize whitelist manager for command security
whitelistManager.initialize(basherDir);

// Instance detector for singleton pattern
const instanceDetector = new InstanceDetector({ basherDir });

// Track whether this instance is the primary (web server owner)
let isPrimaryInstance = false;

// Initialize web server (will start in main() if primary instance)
let webServer: WebServer | null = null;

// Initialize instance notifier (for secondary instances to notify primary)
let instanceNotifier: InstanceNotifier | null = null;

// Track existing instance info (when running in client mode)
let existingInstanceInfo: ExistingInstance | null = null;

// Zod schemas for input validation
const executeCommandSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
  cwd: z.string().optional(),
  stdin: z.string().optional(),
  timeout: z.number().positive().optional(),
  background: z.boolean().optional().default(true),
  title: z.string().optional(),
  waitFor: z.string().optional(), // Regex pattern to wait for in output
  waitTimeout: z.number().positive().optional().default(30000), // Timeout for waitFor in ms
  // New features
  parseAs: z.enum(['jest', 'pytest', 'eslint', 'tsc', 'typescript', 'json', 'generic', 'auto']).optional(),
  outputMode: z.enum(['full', 'smart', 'tail']).optional().default('full'),
  trackProgress: z.boolean().optional().default(false),
  retry: z.object({
    attempts: z.number().min(1).max(10),
    backoff: z.enum(['none', 'linear', 'exponential']).optional().default('none'),
    delayMs: z.number().positive().optional().default(1000),
  }).optional(),
  diffWithLast: z.boolean().optional().default(false),
  analyzeFailure: z.boolean().optional().default(true), // Auto-analyze failures
});

const searchHistorySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  limit: z.number().positive().optional().default(50),
  exitCode: z.number().optional(),
});

const getRecentCommandsSchema = z.object({
  limit: z.number().positive().optional().default(100),
  outputFormat: z.enum(['json', 'toon']).optional().default('toon'),
});

// Whitelist schemas
const whitelistCommandSchema = z.object({
  command_base: z.string().min(1, 'Command base cannot be empty'),
  description: z.string().optional(),
});

const removeWhitelistSchema = z.object({
  command_base: z.string().min(1, 'Command base cannot be empty'),
});

// Create MCP server
const server = new Server(
  {
    name: 'basher',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_command',
        description: 'PREFERRED TOOL FOR ALL COMMAND EXECUTION. Execute shell commands with comprehensive tracking and analysis: (1) Persistent SQLite history with full-text search across all past executions, (2) Per-line timestamps for precise debugging, (3) Process tracking with termination capabilities, (4) Token-efficient querying with 90-95% savings using summary/excerpts modes, (5) Advanced filtering and aggregation for pattern analysis, (6) Real-time web UI dashboard at localhost:3000. Every command execution is automatically saved and becomes searchable. Use this instead of standard bash for all command execution to ensure complete observability and the ability to search, compare, and analyze past runs. IMPORTANT: Do NOT use for sleep/wait commands with default background execution (they return immediately). For sleep/wait commands, set background=false or use waitFor parameter.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute',
            },
            cwd: {
              type: 'string',
              description: 'Working directory for command execution (optional, defaults to current directory)',
            },
            stdin: {
              type: 'string',
              description: 'Input to pipe to the command via stdin (optional)',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (optional, no timeout by default)',
            },
            background: {
              type: 'boolean',
              description: 'Run command in background and return immediately with processId (optional, defaults to true). Set to false for synchronous execution that waits for completion.',
            },
            title: {
              type: 'string',
              description: 'Optional title/label for this command execution (useful for identifying commands in history)',
            },
            waitFor: {
              type: 'string',
              description: 'Regex pattern to wait for in stdout/stderr. When matched, returns immediately with the match context. Use this instead of polling get_process_output. Example: "Listening on port" or "(PASS|FAIL)".',
            },
            waitTimeout: {
              type: 'number',
              description: 'Timeout in ms for waitFor pattern (default: 30000). If pattern not matched within timeout, returns with timeout status.',
            },
            parseAs: {
              type: 'string',
              enum: ['jest', 'pytest', 'eslint', 'tsc', 'typescript', 'json', 'generic', 'auto'],
              description: 'Parse output as specific format. Returns structured data (passed/failed tests, errors, etc). "auto" detects from command.',
            },
            outputMode: {
              type: 'string',
              enum: ['full', 'smart', 'tail'],
              description: 'Output mode: "full" (default), "smart" (errors/warnings/key lines only), "tail" (last 20 lines).',
            },
            trackProgress: {
              type: 'boolean',
              description: 'Track progress indicators in output (percentage, X/Y counts, ETA). Returns progress info.',
            },
            retry: {
              type: 'object',
              description: 'Retry configuration for flaky commands.',
              properties: {
                attempts: { type: 'number', description: 'Number of retry attempts (1-10)' },
                backoff: { type: 'string', enum: ['none', 'linear', 'exponential'], description: 'Backoff strategy' },
                delayMs: { type: 'number', description: 'Delay between retries in ms (default: 1000)' },
              },
            },
            diffWithLast: {
              type: 'boolean',
              description: 'Compare output with last similar command. Shows added/removed lines.',
            },
            analyzeFailure: {
              type: 'boolean',
              description: 'Auto-analyze failures (default: true). Returns error type, suggestions, related commands.',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'search_command_history',
        description: 'Search past command executions using full-text search. Searches across command text, stdout, and stderr. Returns matching commands with their complete execution details.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for full-text search (searches command, stdout, stderr)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (optional, defaults to 50)',
            },
            exitCode: {
              type: 'number',
              description: 'Filter results by exit code (optional)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_recent_commands',
        description: 'Retrieve the most recent command executions from history. Returns commands in reverse chronological order with full execution details. Returns Toon format by default for ~40% token savings.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of recent commands to retrieve (optional, defaults to 100)',
            },
            outputFormat: {
              type: 'string',
              enum: ['json', 'toon'],
              description: 'Output format: "toon" (default, ~40% fewer tokens for tabular data) or "json"',
            },
          },
        },
      },
      {
        name: 'get_command_by_id',
        description: 'Retrieve a specific command execution by its ID from the history database. Returns complete execution details including stdout, stderr, exit code, duration, and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            commandId: {
              type: 'number',
              description: 'The ID of the command to retrieve',
            },
          },
          required: ['commandId'],
        },
      },
      {
        name: 'get_command_by_process_id',
        description: 'Look up a completed command by its process ID. Use this to find the database ID and full details of a background command after it completes. The process ID is returned when you start a background command.',
        inputSchema: {
          type: 'object',
          properties: {
            processId: {
              type: 'number',
              description: 'The process ID that was returned when the command was started',
            },
          },
          required: ['processId'],
        },
      },
      {
        name: 'get_command_stats',
        description: 'Get statistics about command execution history including total commands, failures, and average execution duration.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_version',
        description: 'Get the current version of Basher MCP server including name, version number, and description.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'clear_history',
        description: 'Clear all command history from the database. This permanently deletes all stored command executions and cannot be undone. Use with caution.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'terminate_command',
        description: 'Terminate a running command by its process ID. Sends SIGTERM for graceful shutdown, followed by SIGKILL after 5 seconds if process is still running.',
        inputSchema: {
          type: 'object',
          properties: {
            processId: {
              type: 'number',
              description: 'The process ID of the command to terminate (returned by execute_command)',
            },
          },
          required: ['processId'],
        },
      },
      {
        name: 'get_running_commands',
        description: 'Get a list of all currently running commands with their process IDs, command text, and duration.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_process_output',
        description: 'Get the current output (stdout/stderr) from a running command by process ID. Essential for monitoring long-running commands and allowing AI self-monitoring. Returns the last N lines if specified, or all output. Use this to check progress of builds, tests, or any long-running process.',
        inputSchema: {
          type: 'object',
          properties: {
            processId: {
              type: 'number',
              description: 'The process ID of the running command (returned by execute_command)',
            },
            lines: {
              type: 'number',
              description: 'Optional: Number of last lines to retrieve from stdout/stderr. If not specified, returns all output.',
            },
          },
          required: ['processId'],
        },
      },
      {
        name: 'poll_until_complete',
        description: 'Wait for a background command to complete and return the final result. This is MORE EFFICIENT than repeatedly calling get_process_output because polling happens server-side without consuming your context. Use this instead of manual polling loops.',
        inputSchema: {
          type: 'object',
          properties: {
            processId: {
              type: 'number',
              description: 'The process ID of the running command (returned by execute_command)',
            },
            pollInterval: {
              type: 'number',
              description: 'How often to check for completion in milliseconds (default: 1000, min: 500)',
            },
            timeout: {
              type: 'number',
              description: 'Maximum time to wait in milliseconds (default: 300000 = 5 minutes)',
            },
          },
          required: ['processId'],
        },
      },
      {
        name: 'advanced_search',
        description: 'Search command history with advanced filtering and tiered output levels for token efficiency. Use outputLevel to control response size: "summary" (90% token savings), "preview" (first/last lines), "excerpts" (matching lines only), or "full" (complete output). Supports Toon format for additional ~40% savings.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for full-text search',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 50)',
            },
            outputLevel: {
              type: 'string',
              enum: ['summary', 'preview', 'excerpts', 'full'],
              description: 'Output detail level: summary (metadata only), preview (first/last lines), excerpts (matching lines + context), full (complete output)',
            },
            outputFormat: {
              type: 'string',
              enum: ['json', 'toon'],
              description: 'Output format: "toon" (default, ~40% fewer tokens) or "json". Toon works best with "summary" outputLevel for maximum savings.',
            },
            contextLines: {
              type: 'number',
              description: 'Lines of context around matches for excerpts mode (default: 3)',
            },
            filters: {
              type: 'object',
              description: 'Advanced filters',
              properties: {
                dateRange: {
                  type: 'object',
                  properties: {
                    from: { type: 'string', description: 'ISO date string' },
                    to: { type: 'string', description: 'ISO date string' },
                  },
                },
                workingDir: { type: 'string', description: 'Filter by working directory' },
                commandPattern: { type: 'string', description: 'Glob pattern (e.g., "npm*")' },
                exitCodes: { type: 'array', items: { type: 'number' }, description: 'Filter by exit codes' },
                minDuration: { type: 'number', description: 'Minimum duration in ms' },
                maxDuration: { type: 'number', description: 'Maximum duration in ms' },
                status: { type: 'string', enum: ['completed', 'running', 'terminated'] },
                hasStderr: { type: 'boolean', description: 'Filter commands with/without stderr' },
              },
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_aggregations',
        description: 'Get aggregated statistics grouped by command, directory, exit code, or time. Returns counts, averages, and success rates in a single query - much more token-efficient than multiple searches.',
        inputSchema: {
          type: 'object',
          properties: {
            groupBy: {
              type: 'string',
              enum: ['command', 'cwd', 'exitCode', 'hour', 'day'],
              description: 'Group results by this field',
            },
            includeStats: {
              type: 'boolean',
              description: 'Include detailed statistics (avg duration, failures, success rate)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of groups to return',
            },
            filters: {
              type: 'object',
              description: 'Apply filters before aggregation',
            },
          },
          required: ['groupBy'],
        },
      },
      {
        name: 'compare_executions',
        description: 'Compare output differences between two command executions. Shows added, removed, and common lines for both stdout and stderr.',
        inputSchema: {
          type: 'object',
          properties: {
            commandId1: {
              type: 'number',
              description: 'First command ID',
            },
            commandId2: {
              type: 'number',
              description: 'Second command ID',
            },
          },
          required: ['commandId1', 'commandId2'],
        },
      },
      {
        name: 'get_last_failures',
        description: 'Quick access to recent failed commands. Token-efficient alternative to searching with exitCode filter.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum failures to return (default: 10)',
            },
            outputLevel: {
              type: 'string',
              enum: ['summary', 'preview', 'excerpts', 'full'],
              description: 'Output detail level (default: summary)',
            },
            since: {
              type: 'string',
              description: 'ISO date string - only failures after this date',
            },
          },
        },
      },
      {
        name: 'get_similar_commands',
        description: 'Find commands similar to a given command (same base command and working directory). Useful for tracking patterns and history.',
        inputSchema: {
          type: 'object',
          properties: {
            commandId: {
              type: 'number',
              description: 'Reference command ID',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 10)',
            },
            outputLevel: {
              type: 'string',
              enum: ['summary', 'preview', 'excerpts', 'full'],
              description: 'Output detail level (default: summary)',
            },
          },
          required: ['commandId'],
        },
      },
      {
        name: 'get_command_chain',
        description: 'Get a sequence of commands executed in the same working directory around a specific command. Useful for understanding command context and workflows.',
        inputSchema: {
          type: 'object',
          properties: {
            startId: {
              type: 'number',
              description: 'Center the chain around this command ID',
            },
            maxCommands: {
              type: 'number',
              description: 'Maximum commands in the chain (default: 10)',
            },
            outputLevel: {
              type: 'string',
              enum: ['summary', 'preview', 'excerpts', 'full'],
              description: 'Output detail level (default: summary)',
            },
          },
          required: ['startId'],
        },
      },
      // Template tools
      {
        name: 'save_template',
        description: 'Save a reusable command template. Templates store command configurations for quick re-execution.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Unique template name (e.g., "test", "build", "lint")' },
            command: { type: 'string', description: 'Shell command to execute' },
            title: { type: 'string', description: 'Display title for the command' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in ms' },
            parseAs: { type: 'string', enum: ['jest', 'pytest', 'eslint', 'tsc', 'json', 'auto'], description: 'Output parser' },
            waitFor: { type: 'string', description: 'Pattern to wait for' },
            waitTimeout: { type: 'number', description: 'Wait timeout in ms' },
            retry: { type: 'object', description: 'Retry configuration', properties: { attempts: { type: 'number' }, backoff: { type: 'string' }, delayMs: { type: 'number' } } },
            description: { type: 'string', description: 'Template description' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organization' },
          },
          required: ['name', 'command'],
        },
      },
      {
        name: 'run_template',
        description: 'Run a saved command template by name. Much faster than re-specifying all options.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Template name to run' },
            overrides: {
              type: 'object',
              description: 'Override template settings',
              properties: {
                cwd: { type: 'string' },
                timeout: { type: 'number' },
                background: { type: 'boolean' },
              },
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_templates',
        description: 'List all saved command templates, optionally filtered by tag.',
        inputSchema: {
          type: 'object',
          properties: {
            tag: { type: 'string', description: 'Filter by tag (optional)' },
          },
        },
      },
      {
        name: 'delete_template',
        description: 'Delete a saved command template.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Template name to delete' },
          },
          required: ['name'],
        },
      },
      // Session tools
      {
        name: 'start_session',
        description: 'Start a new command session. All subsequent commands are grouped under this session for organization.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name (e.g., "Fix auth bug", "Feature implementation")' },
            description: { type: 'string', description: 'Session description' },
          },
          required: ['name'],
        },
      },
      {
        name: 'end_session',
        description: 'End the current active session.',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['completed', 'abandoned'], description: 'Session end status (default: completed)' },
          },
        },
      },
      {
        name: 'get_session',
        description: 'Get session details and associated commands.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name (gets most recent with this name)' },
            id: { type: 'number', description: 'Session ID (alternative to name)' },
          },
        },
      },
      {
        name: 'list_sessions',
        description: 'List all command sessions.',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'completed', 'abandoned'], description: 'Filter by status' },
            limit: { type: 'number', description: 'Maximum sessions to return (default: 50)' },
          },
        },
      },
      // ========================================================================
      // COMMAND WHITELIST TOOLS
      // ========================================================================
      {
        name: 'whitelist_command',
        description: `Add a command to the whitelist, allowing it to be executed.

⚠️ CRITICAL: You MUST get explicit user approval before calling this tool!

Before whitelisting any command, you MUST ask the user:
"May I whitelist the '{command_base}' command to allow this operation?"

Only proceed with this tool call AFTER the user explicitly approves.
Never call this tool proactively without user consent.`,
        inputSchema: {
          type: 'object',
          properties: {
            command_base: {
              type: 'string',
              description: 'The base command to whitelist (e.g., "npm", "git", "docker"). This is the first word/program of the command.',
            },
            description: {
              type: 'string',
              description: 'Optional description of why this command is being whitelisted',
            },
          },
          required: ['command_base'],
        },
      },
      {
        name: 'list_whitelisted_commands',
        description: 'List all currently whitelisted commands that are allowed to execute.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'remove_whitelisted_command',
        description: 'Remove a command from the whitelist. After removal, that command will be blocked from execution until re-whitelisted.',
        inputSchema: {
          type: 'object',
          properties: {
            command_base: {
              type: 'string',
              description: 'The base command to remove from the whitelist',
            },
          },
          required: ['command_base'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Execute command
    if (name === 'execute_command') {
      const params = executeCommandSchema.parse(args);
      const {
        command, cwd, stdin, timeout, background, title, waitFor, waitTimeout,
        parseAs, outputMode, trackProgress: doTrackProgress, retry, diffWithLast, analyzeFailure: doAnalyzeFailure
      } = params;

      // ========================================================================
      // WHITELIST CHECK - Block non-whitelisted commands
      // ========================================================================
      const whitelistCheck = whitelistManager.check(command);
      if (!whitelistCheck.allowed) {
        logger.warn(
          { command, commandBase: whitelistCheck.commandBase },
          'Command blocked: not whitelisted'
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'blocked',
              error: 'COMMAND_NOT_WHITELISTED',
              commandBase: whitelistCheck.commandBase,
              message: whitelistCheck.reason,
              instructions: `To proceed, ask the user for permission to whitelist '${whitelistCheck.commandBase}', then use the whitelist_command tool.`,
            }, null, 2),
          }],
        };
      }

      logger.info({ command, cwd, timeout, background, title, waitFor, waitTimeout, parseAs, outputMode }, 'Executing command via MCP tool');

      // Helper to enhance result with new features
      const enhanceResult = (result: { stdout: string; stderr: string; exitCode: number; duration: number; processId: number; timestamp: string }, commandId?: number) => {
        const enhanced: Record<string, any> = {
          status: 'completed',
          id: commandId,
          command,
          processId: result.processId,
          exitCode: result.exitCode,
          duration: `${result.duration}ms`,
          timestamp: result.timestamp,
          success: result.exitCode === 0,
        };

        // Token estimate
        enhanced.tokenEstimate = estimateTokens(result.stdout + result.stderr);

        // Exit code interpretation
        enhanced.exitCodeInfo = interpretExitCode(result.exitCode);

        // Output based on mode
        if (outputMode === 'smart') {
          const summary = getSmartSummary(result.stdout, result.stderr, result.exitCode);
          enhanced.output = summary;
        } else if (outputMode === 'tail') {
          const lines = (result.stdout + result.stderr).split('\n');
          enhanced.output = {
            lastLines: lines.slice(-20).join('\n'),
            totalLines: lines.length,
          };
        } else {
          enhanced.stdout = result.stdout;
          enhanced.stderr = result.stderr;
        }

        // Parse output if requested
        if (parseAs) {
          enhanced.parsed = parseOutput(result.stdout, result.stderr, result.exitCode, parseAs, command);
        }

        // Track progress if requested
        if (doTrackProgress) {
          enhanced.progress = trackProgress(result.stdout + result.stderr);
        }

        // Analyze failure if command failed and analysis enabled
        if (result.exitCode !== 0 && doAnalyzeFailure !== false) {
          enhanced.failureAnalysis = analyzeFailure(command, result.stdout, result.stderr, result.exitCode);
        }

        // Diff with last similar command
        if (diffWithLast && commandId) {
          const similar = historyManager.advanced.getSimilarCommands(commandId, 1, 'summary');
          if (similar.length > 0) {
            const lastCmd = historyManager.getCommandById(similar[0].id);
            if (lastCmd) {
              enhanced.diff = diffOutputs(lastCmd.stdout, lastCmd.stderr, result.stdout, result.stderr);
            }
          }
        }

        // Add to active session if any
        const activeSessionId = sessionManager.getActiveSessionId();
        if (activeSessionId && commandId) {
          sessionManager.addCommandToSession(commandId);
          enhanced.sessionId = activeSessionId;
        }

        return enhanced;
      };

      // Shared state for capturing processId and output
      let capturedProcessId: number | null = null;
      let accumulatedStdout = '';
      let accumulatedStderr = '';

      // Helper to save completed command to history and broadcast
      const saveAndBroadcast = (result: { processId: number; exitCode: number; duration: number; stdout: string; stderr: string; timestamp: string }) => {
        const historyEntry = {
          command,
          title: title || command,
          cwd: cwd || process.cwd(),
          timestamp: result.timestamp,
          exitCode: result.exitCode,
          duration: result.duration,
          stdout: result.stdout,
          stderr: result.stderr,
          processId: result.processId,
          status: 'completed',
        };
        const commandId = historyManager.saveCommand(historyEntry);

        // IMPORTANT: Unregister from processManager AFTER saving to history
        // This ensures VS Code extension can find the command in history when it polls
        processManager.unregister(result.processId);

        if (webServer) {
          webServer.broadcast('command_executed', { ...historyEntry, id: commandId });
        }

        if (instanceNotifier) {
          instanceNotifier.notifyCommandComplete(
            result.processId,
            command,
            title || command,
            cwd || process.cwd(),
            result.exitCode,
            result.duration,
            result.stdout,
            result.stderr,
            commandId
          );
        }

        return commandId;
      };

      // ============================================
      // MODE 1: waitFor - wait for pattern in output
      // ============================================
      if (waitFor) {
        const regex = new RegExp(waitFor);
        let patternMatched = false;
        let matchedLine: string | null = null;
        let matchedStream: 'stdout' | 'stderr' | null = null;
        let resolveWait: ((value: any) => void) | null = null;

        // Set up callbacks with pattern matching
        const callbacks: CommandExecutionCallbacks = {
          onStart: (processId, cmd, cmdTitle, cmdCwd) => {
            capturedProcessId = processId;
            // Broadcast to web UI
            if (webServer) {
              webServer.broadcast('command_started', {
                processId,
                command: cmd,
                title: cmdTitle,
                cwd: cmdCwd,
              });
            }
            if (instanceNotifier) {
              instanceNotifier.notifyCommandStart(processId, cmd, cmdTitle, cmdCwd);
            }
          },
          onStdout: (processId, data) => {
            accumulatedStdout += data;
            // Broadcast output to web UI
            if (webServer) {
              webServer.broadcast('command_output', {
                processId,
                stream: 'stdout',
                data,
              });
            }
            if (instanceNotifier) {
              instanceNotifier.notifyCommandOutput(processId, 'stdout', data);
            }
            // Check for pattern match
            if (!patternMatched && regex.test(data)) {
              patternMatched = true;
              matchedLine = data.trim();
              matchedStream = 'stdout';
              if (resolveWait) {
                resolveWait({ type: 'pattern_matched' });
              }
            }
          },
          onStderr: (processId, data) => {
            accumulatedStderr += data;
            // Broadcast output to web UI
            if (webServer) {
              webServer.broadcast('command_output', {
                processId,
                stream: 'stderr',
                data,
              });
            }
            if (instanceNotifier) {
              instanceNotifier.notifyCommandOutput(processId, 'stderr', data);
            }
            // Check for pattern match
            if (!patternMatched && regex.test(data)) {
              patternMatched = true;
              matchedLine = data.trim();
              matchedStream = 'stderr';
              if (resolveWait) {
                resolveWait({ type: 'pattern_matched' });
              }
            }
          },
        };

        // Start command execution (don't await - we want to monitor as it runs)
        const commandPromise = executeCommand(command, cwd, stdin, timeout, title, callbacks);

        // Set up completion handler
        commandPromise.then(result => {
          saveAndBroadcast(result);
          if (!patternMatched && resolveWait) {
            resolveWait({ type: 'completed', result });
          }
        }).catch(error => {
          logger.error({ error, command }, 'Command failed during waitFor');
          if (resolveWait) {
            resolveWait({ type: 'error', error });
          }
        });

        // Wait for pattern match, completion, or timeout
        const waitResult = await Promise.race([
          new Promise<any>((resolve) => {
            resolveWait = resolve;
            // Check if pattern already matched (from sync callbacks)
            if (patternMatched) {
              resolve({ type: 'pattern_matched' });
            }
          }),
          new Promise<any>((resolve) => {
            setTimeout(() => resolve({ type: 'timeout' }), waitTimeout);
          }),
        ]);

        // Get last N lines of output for context
        const getLastLines = (text: string, n: number = 10) => {
          const lines = text.split('\n').filter(l => l.trim());
          return lines.slice(-n).join('\n');
        };

        if (waitResult.type === 'pattern_matched') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'pattern_matched',
                processId: capturedProcessId,
                command,
                pattern: waitFor,
                matchedLine,
                matchedStream,
                stillRunning: processManager.isRunning(capturedProcessId!),
                outputTail: getLastLines(accumulatedStdout + accumulatedStderr),
                message: 'Pattern matched. Command may still be running.',
              }, null, 2),
            }],
          };
        } else if (waitResult.type === 'completed') {
          const result = waitResult.result;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'completed_without_match',
                processId: result.processId,
                command,
                pattern: waitFor,
                exitCode: result.exitCode,
                duration: `${result.duration}ms`,
                success: result.exitCode === 0,
                stdout: result.stdout,
                stderr: result.stderr,
                message: 'Command completed but pattern was not matched.',
              }, null, 2),
            }],
          };
        } else if (waitResult.type === 'timeout') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'timeout',
                processId: capturedProcessId,
                command,
                pattern: waitFor,
                waitTimeout,
                stillRunning: capturedProcessId ? processManager.isRunning(capturedProcessId) : false,
                outputTail: getLastLines(accumulatedStdout + accumulatedStderr),
                message: `Pattern not matched within ${waitTimeout}ms. Command may still be running.`,
              }, null, 2),
            }],
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                command,
                error: String(waitResult.error),
              }, null, 2),
            }],
          };
        }
      }

      // ============================================
      // MODE 2: background - fire and return processId
      // ============================================
      if (background) {
        // Set up callbacks that capture processId
        const callbacks: CommandExecutionCallbacks = {
          onStart: (processId, cmd, cmdTitle, cmdCwd) => {
            capturedProcessId = processId;
            // Broadcast to web UI
            if (webServer) {
              webServer.broadcast('command_started', {
                processId,
                command: cmd,
                title: cmdTitle,
                cwd: cmdCwd,
              });
            }
            if (instanceNotifier) {
              instanceNotifier.notifyCommandStart(processId, cmd, cmdTitle, cmdCwd);
            }
          },
          onStdout: (processId, data) => {
            // Broadcast output to web UI
            if (webServer) {
              webServer.broadcast('command_output', {
                processId,
                stream: 'stdout',
                data,
              });
            }
            if (instanceNotifier) {
              instanceNotifier.notifyCommandOutput(processId, 'stdout', data);
            }
          },
          onStderr: (processId, data) => {
            // Broadcast output to web UI
            if (webServer) {
              webServer.broadcast('command_output', {
                processId,
                stream: 'stderr',
                data,
              });
            }
            if (instanceNotifier) {
              instanceNotifier.notifyCommandOutput(processId, 'stderr', data);
            }
          },
        };

        // Execute in background (don't await)
        executeCommand(command, cwd, stdin, timeout, title, callbacks)
          .then(saveAndBroadcast)
          .catch(error => {
            logger.error({ error, command }, 'Background command failed');
          });

        // Small delay to ensure onStart callback has fired
        await new Promise(resolve => setImmediate(resolve));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'running',
              background: true,
              processId: capturedProcessId,
              command,
              cwd: cwd || process.cwd(),
              message: 'Command started in background.',
              recommendations: {
                preferred: 'Use poll_until_complete({ processId }) to wait for completion without wasting context on repeated polling.',
                alternative: 'Next time, use waitFor parameter (e.g., waitFor: "PASS|FAIL") to wait for specific output patterns.',
                avoid: 'Do NOT repeatedly call get_process_output in a loop - this wastes context tokens. Use poll_until_complete instead.',
              },
            }, null, 2),
          }],
        };
      }

      // ============================================
      // MODE 3: synchronous - wait for completion
      // ============================================
      const callbacks: CommandExecutionCallbacks = {
        onStart: (processId, cmd, cmdTitle, cmdCwd) => {
          capturedProcessId = processId;
          // Broadcast to web UI
          if (webServer) {
            webServer.broadcast('command_started', {
              processId,
              command: cmd,
              title: cmdTitle,
              cwd: cmdCwd,
            });
          }
          if (instanceNotifier) {
            instanceNotifier.notifyCommandStart(processId, cmd, cmdTitle, cmdCwd);
          }
        },
        onStdout: (processId, data) => {
          // Broadcast output to web UI
          if (webServer) {
            webServer.broadcast('command_output', {
              processId,
              stream: 'stdout',
              data,
            });
          }
          if (instanceNotifier) {
            instanceNotifier.notifyCommandOutput(processId, 'stdout', data);
          }
        },
        onStderr: (processId, data) => {
          // Broadcast output to web UI
          if (webServer) {
            webServer.broadcast('command_output', {
              processId,
              stream: 'stderr',
              data,
            });
          }
          if (instanceNotifier) {
            instanceNotifier.notifyCommandOutput(processId, 'stderr', data);
          }
        },
      };

      const result = await executeCommand(command, cwd, stdin, timeout, title, callbacks);
      const commandId = saveAndBroadcast(result);

      // Use enhanced result with new features
      const enhanced = enhanceResult(result, commandId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(enhanced, null, 2),
        }],
      };
    }

    // Terminate command
    if (name === 'terminate_command') {
      const params = z.object({ processId: z.number() }).parse(args);
      const { processId } = params;

      logger.info({ processId }, 'Terminating command via MCP tool');

      const success = processManager.kill(processId);

      // Broadcast to web UI clients (primary instance)
      if (webServer) {
        webServer.broadcast('command_terminated', { processId });
      }

      // Notify primary instance (secondary instance)
      if (instanceNotifier) {
        instanceNotifier.notifyCommandTerminated(processId);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                processId,
                success,
                message: success
                  ? `Process ${processId} terminated successfully`
                  : `Process ${processId} not found or already completed`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get running commands
    if (name === 'get_running_commands') {
      const running = processManager.getRunning();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                count: running.length,
                running: running.map((r) => ({
                  ...r,
                  duration: `${r.duration}ms`,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get process output (for monitoring running commands)
    if (name === 'get_process_output') {
      const params = z.object({
        processId: z.number(),
        lines: z.number().positive().optional(),
      }).parse(args);

      logger.info({ processId: params.processId, lines: params.lines }, 'Getting process output');

      const output = processManager.getOutput(params.processId, params.lines);

      if (!output) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Process not found',
                  processId: params.processId,
                  message: 'The process may have already completed or does not exist. Use search_command_history or get_recent_commands to find completed executions.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                processId: output.processId,
                command: output.command,
                status: output.status,
                duration: `${output.duration}ms`,
                stdoutLines: output.stdout.split('\n').length - 1,
                stderrLines: output.stderr.split('\n').length - 1,
                stdout: output.stdout,
                stderr: output.stderr,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Poll until command completes (efficient server-side polling)
    if (name === 'poll_until_complete') {
      const params = z.object({
        processId: z.number(),
        pollInterval: z.number().min(500).optional().default(1000),
        timeout: z.number().positive().optional().default(300000),
      }).parse(args);

      const { processId, pollInterval, timeout } = params;

      logger.info({ processId, pollInterval, timeout }, 'Polling until command completes');

      // IMPORTANT: Check if process is currently running FIRST
      // Process IDs are reused across sessions, so we can't rely on history lookup
      // before confirming the process isn't currently running
      if (processManager.isRunning(processId)) {
        // Process is running - proceed to poll loop below
        logger.debug({ processId }, 'Process is running, will poll for completion');
      } else {
        // Process is not running - check if it completed recently (in history)
        const existingCommand = historyManager.getCommandByProcessId(processId);
        if (existingCommand) {
          // Verify this is a recent command (within last hour) to avoid returning stale data
          // from previous sessions where process IDs were reused
          const commandTime = new Date(existingCommand.timestamp).getTime();
          const oneHourAgo = Date.now() - (60 * 60 * 1000);

          if (commandTime > oneHourAgo) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  status: 'already_completed',
                  id: existingCommand.id,
                  processId: existingCommand.processId,
                  command: existingCommand.command,
                  title: existingCommand.title,
                  exitCode: existingCommand.exitCode,
                  duration: `${existingCommand.duration}ms`,
                  success: existingCommand.exitCode === 0,
                  stdout: existingCommand.stdout,
                  stderr: existingCommand.stderr,
                }, null, 2),
              }],
            };
          } else {
            // Found a stale command from a previous session - process ID was reused
            logger.warn({ processId, foundCommandId: existingCommand.id, foundTimestamp: existingCommand.timestamp },
              'Found stale command with reused process ID');
          }
        }

        // Process not running and no recent history entry
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'not_found',
              processId,
              message: 'Process not found. It may have completed before polling started, or the process ID may be from a previous session.',
            }, null, 2),
          }],
        };
      }

      // Poll until complete
      const startTime = Date.now();

      const pollResult = await new Promise<{ status: string; data?: any; error?: string }>((resolve) => {
        const checkCompletion = () => {
          // Check timeout
          if (Date.now() - startTime > timeout) {
            resolve({
              status: 'timeout',
              error: `Timed out after ${timeout}ms. Command is still running.`,
            });
            return;
          }

          // Check if still running
          if (processManager.isRunning(processId)) {
            // Still running, check again later
            setTimeout(checkCompletion, pollInterval);
            return;
          }

          // No longer running - get from history
          const completedCommand = historyManager.getCommandByProcessId(processId);
          if (completedCommand) {
            resolve({
              status: 'completed',
              data: completedCommand,
            });
          } else {
            // Give it a moment for the save to complete
            setTimeout(() => {
              const retryCommand = historyManager.getCommandByProcessId(processId);
              if (retryCommand) {
                resolve({
                  status: 'completed',
                  data: retryCommand,
                });
              } else {
                resolve({
                  status: 'completed_but_not_saved',
                  error: 'Command completed but history entry not found.',
                });
              }
            }, 500);
          }
        };

        checkCompletion();
      });

      if (pollResult.status === 'completed' && pollResult.data) {
        const cmd = pollResult.data;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'completed',
              id: cmd.id,
              processId: cmd.processId,
              command: cmd.command,
              title: cmd.title,
              exitCode: cmd.exitCode,
              duration: `${cmd.duration}ms`,
              polledFor: `${Date.now() - startTime}ms`,
              success: cmd.exitCode === 0,
              stdout: cmd.stdout,
              stderr: cmd.stderr,
            }, null, 2),
          }],
        };
      }

      // Timeout or error
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: pollResult.status,
            processId,
            polledFor: `${Date.now() - startTime}ms`,
            error: pollResult.error,
            hint: pollResult.status === 'timeout'
              ? 'Command is still running. You can call poll_until_complete again or use terminate_command to stop it.'
              : 'Try get_command_by_process_id to check if the command completed.',
          }, null, 2),
        }],
      };
    }

    // Search command history
    if (name === 'search_command_history') {
      const params = searchHistorySchema.parse(args);
      const { query, limit, exitCode } = params;

      logger.info({ query, limit, exitCode }, 'Searching command history');

      let results = historyManager.searchHistory(query, limit);

      // Filter by exit code if specified
      if (exitCode !== undefined) {
        results = results.filter((r) => r.exitCode === exitCode);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                resultsCount: results.length,
                results: results.map((r) => ({
                  id: r.id,
                  command: r.command,
                  cwd: r.cwd,
                  timestamp: r.timestamp,
                  exitCode: r.exitCode,
                  duration: `${r.duration}ms`,
                  stdoutPreview: r.stdout.substring(0, 200),
                  stderrPreview: r.stderr.substring(0, 200),
                  stdoutLength: r.stdout.length,
                  stderrLength: r.stderr.length,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get recent commands
    if (name === 'get_recent_commands') {
      const params = getRecentCommandsSchema.parse(args);
      const { limit, outputFormat } = params;

      logger.info({ limit, outputFormat }, 'Getting recent commands');

      const results = historyManager.getRecentHistory(limit);

      const data = {
        count: results.length,
        commands: results.map((r) => ({
          id: r.id,
          command: r.command,
          cwd: r.cwd,
          timestamp: r.timestamp,
          exitCode: r.exitCode,
          duration: `${r.duration}ms`,
          success: r.exitCode === 0,
        })),
      };

      return {
        content: [
          {
            type: 'text',
            text: encodeOutput(data, outputFormat as OutputFormat),
          },
        ],
      };
    }

    // Get command by ID
    if (name === 'get_command_by_id') {
      const params = z.object({ commandId: z.number() }).parse(args);
      const { commandId } = params;

      logger.info({ commandId }, 'Getting command by ID');

      const command = historyManager.getCommandById(commandId);

      if (!command) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Command not found',
                  commandId,
                  message: 'No command exists with this ID. Use get_recent_commands or search_command_history to find available commands.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: command.id,
                command: command.command,
                title: command.title,
                cwd: command.cwd,
                timestamp: command.timestamp,
                exitCode: command.exitCode,
                duration: `${command.duration}ms`,
                success: command.exitCode === 0,
                processId: command.processId,
                status: command.status,
                stdout: command.stdout,
                stderr: command.stderr,
                stdoutLength: command.stdout?.length || 0,
                stderrLength: command.stderr?.length || 0,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get command by process ID (for finding completed background commands)
    if (name === 'get_command_by_process_id') {
      const params = z.object({ processId: z.number() }).parse(args);
      const { processId } = params;

      logger.info({ processId }, 'Getting command by process ID');

      // First check if it's still running
      const isRunning = processManager.isRunning(processId);
      if (isRunning) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'running',
                  processId,
                  message: 'Command is still running. Use get_process_output to monitor progress.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Look up in history
      const command = historyManager.getCommandByProcessId(processId);

      if (!command) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'not_found',
                  processId,
                  message: 'No completed command found with this process ID. The command may not have been saved to history yet, or the process ID may be from a previous session.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Check if this is a stale result from a previous session
      // Process IDs are reused across sessions, so we warn if the command is old
      const commandTime = new Date(command.timestamp).getTime();
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const isStale = commandTime < oneHourAgo;

      if (isStale) {
        logger.warn({ processId, foundCommandId: command.id, foundTimestamp: command.timestamp },
          'Found potentially stale command - process ID may have been reused');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'completed',
                id: command.id,
                processId: command.processId,
                command: command.command,
                title: command.title,
                cwd: command.cwd,
                timestamp: command.timestamp,
                exitCode: command.exitCode,
                duration: `${command.duration}ms`,
                success: command.exitCode === 0,
                stdout: command.stdout,
                stderr: command.stderr,
                stdoutLength: command.stdout?.length || 0,
                stderrLength: command.stderr?.length || 0,
                warning: isStale ? 'This result may be from a previous session. Process IDs are reused across restarts.' : undefined,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get command statistics
    if (name === 'get_command_stats') {
      logger.info('Getting command statistics');

      const stats = historyManager.getStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                totalCommands: stats.total,
                failedCommands: stats.failures,
                successRate: stats.total > 0
                  ? `${(((stats.total - stats.failures) / stats.total) * 100).toFixed(2)}%`
                  : 'N/A',
                averageDuration: `${stats.avgDuration}ms`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get version
    if (name === 'get_version') {
      logger.info('Getting Basher version');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: packageJson.name,
                version: packageJson.version,
                description: packageJson.description,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Clear history
    if (name === 'clear_history') {
      logger.info('Clearing command history');

      try {
        historyManager.clearHistory();

        // Broadcast to web UI clients
        if (webServer) {
          webServer.broadcast('history_cleared', {});
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Command history cleared successfully. All stored command executions have been permanently deleted.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error({ error }, 'Failed to clear history');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error.message || 'Failed to clear history',
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }

    // Advanced search
    if (name === 'advanced_search') {
      const params = z.object({
        query: z.string().min(1),
        limit: z.number().positive().optional().default(50),
        outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('excerpts'),
        outputFormat: z.enum(['json', 'toon']).optional().default('toon'),
        contextLines: z.number().positive().optional().default(3),
        filters: z.object({
          dateRange: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
          }).optional(),
          workingDir: z.string().optional(),
          commandPattern: z.string().optional(),
          exitCodes: z.array(z.number()).optional(),
          minDuration: z.number().optional(),
          maxDuration: z.number().optional(),
          status: z.enum(['completed', 'running', 'terminated']).optional(),
          hasStderr: z.boolean().optional(),
        }).optional(),
      }).parse(args);

      logger.info({ query: params.query, outputLevel: params.outputLevel, outputFormat: params.outputFormat }, 'Advanced search');

      const results = historyManager.advanced.advancedSearch(
        params.query,
        params.limit,
        params.outputLevel,
        params.contextLines,
        params.filters
      );

      const data = {
        query: params.query,
        outputLevel: params.outputLevel,
        resultsCount: results.length,
        results,
      };

      return {
        content: [
          {
            type: 'text',
            text: encodeOutput(data, params.outputFormat as OutputFormat),
          },
        ],
      };
    }

    // Get aggregations
    if (name === 'get_aggregations') {
      const params = z.object({
        groupBy: z.enum(['command', 'cwd', 'exitCode', 'hour', 'day']),
        includeStats: z.boolean().optional().default(true),
        limit: z.number().positive().optional(),
        filters: z.object({
          dateRange: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
          }).optional(),
          workingDir: z.string().optional(),
          commandPattern: z.string().optional(),
          exitCodes: z.array(z.number()).optional(),
          minDuration: z.number().optional(),
          maxDuration: z.number().optional(),
          status: z.enum(['completed', 'running', 'terminated']).optional(),
          hasStderr: z.boolean().optional(),
        }).optional(),
      }).parse(args);

      logger.info({ groupBy: params.groupBy }, 'Getting aggregations');

      const results = historyManager.advanced.getAggregations(params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                groupBy: params.groupBy,
                resultsCount: results.length,
                aggregations: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Compare executions
    if (name === 'compare_executions') {
      const params = z.object({
        commandId1: z.number(),
        commandId2: z.number(),
      }).parse(args);

      logger.info({ commandId1: params.commandId1, commandId2: params.commandId2 }, 'Comparing executions');

      const diff = historyManager.advanced.compareExecutions(
        params.commandId1,
        params.commandId2
      );

      if (!diff) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'One or both commands not found',
                  commandId1: params.commandId1,
                  commandId2: params.commandId2,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                commandId1: diff.commandId1,
                commandId2: diff.commandId2,
                command1: diff.command1,
                command2: diff.command2,
                stdoutDiff: {
                  addedLines: diff.stdoutDiff.added.length,
                  removedLines: diff.stdoutDiff.removed.length,
                  commonLines: diff.stdoutDiff.common,
                  added: diff.stdoutDiff.added,
                  removed: diff.stdoutDiff.removed,
                },
                stderrDiff: {
                  addedLines: diff.stderrDiff.added.length,
                  removedLines: diff.stderrDiff.removed.length,
                  commonLines: diff.stderrDiff.common,
                  added: diff.stderrDiff.added,
                  removed: diff.stderrDiff.removed,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get last failures
    if (name === 'get_last_failures') {
      const params = z.object({
        limit: z.number().positive().optional().default(10),
        outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('summary'),
        since: z.string().optional(),
      }).parse(args);

      logger.info({ limit: params.limit, outputLevel: params.outputLevel }, 'Getting last failures');

      const results = historyManager.advanced.getLastFailures(
        params.limit,
        params.outputLevel,
        params.since
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                outputLevel: params.outputLevel,
                failuresCount: results.length,
                failures: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get similar commands
    if (name === 'get_similar_commands') {
      const params = z.object({
        commandId: z.number(),
        limit: z.number().positive().optional().default(10),
        outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('summary'),
      }).parse(args);

      logger.info({ commandId: params.commandId, limit: params.limit }, 'Getting similar commands');

      const results = historyManager.advanced.getSimilarCommands(
        params.commandId,
        params.limit,
        params.outputLevel
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                referenceCommandId: params.commandId,
                outputLevel: params.outputLevel,
                similarCount: results.length,
                similar: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get command chain
    if (name === 'get_command_chain') {
      const params = z.object({
        startId: z.number(),
        maxCommands: z.number().positive().optional().default(10),
        outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('summary'),
      }).parse(args);

      logger.info({ startId: params.startId, maxCommands: params.maxCommands }, 'Getting command chain');

      const results = historyManager.advanced.getCommandChain(
        params.startId,
        params.maxCommands,
        params.outputLevel
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                centerCommandId: params.startId,
                outputLevel: params.outputLevel,
                chainLength: results.length,
                chain: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // ============================================
    // Template tools
    // ============================================

    if (name === 'save_template') {
      const params = z.object({
        name: z.string().min(1),
        command: z.string().min(1),
        title: z.string().optional(),
        cwd: z.string().optional(),
        timeout: z.number().positive().optional(),
        parseAs: z.enum(['jest', 'pytest', 'eslint', 'tsc', 'json', 'auto']).optional(),
        waitFor: z.string().optional(),
        waitTimeout: z.number().positive().optional(),
        retry: z.object({
          attempts: z.number(),
          backoff: z.enum(['none', 'linear', 'exponential']).optional(),
          delayMs: z.number().optional(),
        }).optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }).parse(args);

      logger.info({ templateName: params.name }, 'Saving command template');

      const template = templateManager.save(params);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Template '${params.name}' saved successfully`,
            template,
          }, null, 2),
        }],
      };
    }

    if (name === 'run_template') {
      const params = z.object({
        name: z.string().min(1),
        overrides: z.object({
          cwd: z.string().optional(),
          timeout: z.number().positive().optional(),
          background: z.boolean().optional(),
        }).optional(),
      }).parse(args);

      logger.info({ templateName: params.name }, 'Running command template');

      const template = templateManager.get(params.name);
      if (!template) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Template '${params.name}' not found`,
            }, null, 2),
          }],
        };
      }

      // Build execute_command params from template + overrides
      const execParams = {
        command: template.command,
        cwd: params.overrides?.cwd || template.cwd,
        timeout: params.overrides?.timeout || template.timeout,
        background: params.overrides?.background ?? true,
        title: template.title,
        waitFor: template.waitFor,
        waitTimeout: template.waitTimeout,
        parseAs: template.parseAs,
      };

      // Re-invoke execute_command with template params
      // This is a simplified execution - in production you'd call the full handler
      const callbacks: CommandExecutionCallbacks = {
        onStart: (processId, cmd, cmdTitle, cmdCwd) => {
          // Broadcast to web UI
          if (webServer) {
            webServer.broadcast('command_started', {
              processId,
              command: cmd,
              title: cmdTitle,
              cwd: cmdCwd,
            });
          }
          if (instanceNotifier) {
            instanceNotifier.notifyCommandStart(processId, cmd, cmdTitle, cmdCwd);
          }
        },
        onStdout: (processId, data) => {
          // Broadcast output to web UI
          if (webServer) {
            webServer.broadcast('command_output', {
              processId,
              stream: 'stdout',
              data,
            });
          }
          if (instanceNotifier) {
            instanceNotifier.notifyCommandOutput(processId, 'stdout', data);
          }
        },
        onStderr: (processId, data) => {
          // Broadcast output to web UI
          if (webServer) {
            webServer.broadcast('command_output', {
              processId,
              stream: 'stderr',
              data,
            });
          }
          if (instanceNotifier) {
            instanceNotifier.notifyCommandOutput(processId, 'stderr', data);
          }
        },
      };

      const result = await executeCommand(
        execParams.command,
        execParams.cwd,
        undefined,
        execParams.timeout,
        execParams.title,
        callbacks
      );

      const historyEntry = {
        command: execParams.command,
        title: execParams.title || execParams.command,
        cwd: execParams.cwd || process.cwd(),
        timestamp: result.timestamp,
        exitCode: result.exitCode,
        duration: result.duration,
        stdout: result.stdout,
        stderr: result.stderr,
        processId: result.processId,
        status: 'completed',
      };
      const commandId = historyManager.saveCommand(historyEntry);

      // IMPORTANT: Unregister from processManager AFTER saving to history
      processManager.unregister(result.processId);

      // Add to session if active
      const activeSessionId = sessionManager.getActiveSessionId();
      if (activeSessionId) {
        sessionManager.addCommandToSession(commandId);
      }

      // Parse output if template specifies
      let parsed;
      if (execParams.parseAs) {
        parsed = parseOutput(result.stdout, result.stderr, result.exitCode, execParams.parseAs, execParams.command);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'completed',
            templateName: params.name,
            id: commandId,
            command: execParams.command,
            processId: result.processId,
            exitCode: result.exitCode,
            duration: `${result.duration}ms`,
            success: result.exitCode === 0,
            parsed,
            stdout: result.stdout,
            stderr: result.stderr,
            sessionId: activeSessionId,
          }, null, 2),
        }],
      };
    }

    if (name === 'list_templates') {
      const params = z.object({
        tag: z.string().optional(),
      }).parse(args);

      logger.info({ tag: params.tag }, 'Listing command templates');

      const templates = templateManager.list(params.tag);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: templates.length,
            templates: templates.map(t => ({
              name: t.name,
              command: t.command,
              description: t.description,
              tags: t.tags,
              parseAs: t.parseAs,
              waitFor: t.waitFor,
            })),
          }, null, 2),
        }],
      };
    }

    if (name === 'delete_template') {
      const params = z.object({
        name: z.string().min(1),
      }).parse(args);

      logger.info({ templateName: params.name }, 'Deleting command template');

      const deleted = templateManager.delete(params.name);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: deleted,
            message: deleted
              ? `Template '${params.name}' deleted successfully`
              : `Template '${params.name}' not found`,
          }, null, 2),
        }],
      };
    }

    // ============================================
    // Session tools
    // ============================================

    if (name === 'start_session') {
      const params = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }).parse(args);

      logger.info({ sessionName: params.name }, 'Starting command session');

      const session = sessionManager.startSession(params.name, params.description);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Session '${params.name}' started`,
            session,
          }, null, 2),
        }],
      };
    }

    if (name === 'end_session') {
      const params = z.object({
        status: z.enum(['completed', 'abandoned']).optional().default('completed'),
      }).parse(args);

      logger.info({ status: params.status }, 'Ending command session');

      const session = sessionManager.endSession(params.status);

      if (!session) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: 'No active session to end',
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Session '${session.name}' ended with status: ${params.status}`,
            session,
          }, null, 2),
        }],
      };
    }

    if (name === 'get_session') {
      const params = z.object({
        name: z.string().optional(),
        id: z.number().optional(),
      }).parse(args);

      if (!params.name && !params.id) {
        // Return active session if no params
        const active = sessionManager.getActiveSession();
        if (!active) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'No active session. Provide name or id to look up a specific session.',
              }, null, 2),
            }],
          };
        }
        const commandIds = sessionManager.getSessionCommandIds(active.id);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              session: active,
              commandIds,
            }, null, 2),
          }],
        };
      }

      const session = params.id
        ? sessionManager.getSession(params.id)
        : sessionManager.getSessionByName(params.name!);

      if (!session) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: `Session not found`,
            }, null, 2),
          }],
        };
      }

      const commandIds = sessionManager.getSessionCommandIds(session.id);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session,
            commandIds,
          }, null, 2),
        }],
      };
    }

    if (name === 'list_sessions') {
      const params = z.object({
        status: z.enum(['active', 'completed', 'abandoned']).optional(),
        limit: z.number().positive().optional().default(50),
      }).parse(args);

      logger.info({ status: params.status, limit: params.limit }, 'Listing sessions');

      const sessions = sessionManager.listSessions(params.status, params.limit);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: sessions.length,
            activeSessionId: sessionManager.getActiveSessionId(),
            sessions,
          }, null, 2),
        }],
      };
    }

    // ========================================================================
    // WHITELIST TOOLS
    // ========================================================================

    if (name === 'whitelist_command') {
      const params = whitelistCommandSchema.parse(args);
      const { command_base, description } = params;

      logger.info({ commandBase: command_base, description }, 'Whitelisting command');

      const result = whitelistManager.add(command_base, description);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: result.message,
            commandBase: command_base,
            whitelistPath: whitelistManager.getConfigPath(),
          }, null, 2),
        }],
      };
    }

    if (name === 'list_whitelisted_commands') {
      logger.info('Listing whitelisted commands');

      const whitelist = whitelistManager.list();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            enabled: whitelist.enabled,
            count: whitelist.commands.length,
            commands: whitelist.commands,
            configPath: whitelistManager.getConfigPath(),
          }, null, 2),
        }],
      };
    }

    if (name === 'remove_whitelisted_command') {
      const params = removeWhitelistSchema.parse(args);
      const { command_base } = params;

      logger.info({ commandBase: command_base }, 'Removing command from whitelist');

      const result = whitelistManager.remove(command_base);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: result.message,
            commandBase: command_base,
          }, null, 2),
        }],
      };
    }

    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}`
    );
  } catch (error) {
    logger.error({ error, tool: name, args }, 'Tool execution error');

    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    throw error;
  }
});

// Start server
async function main() {
  try {
    const webPort = parseInt(process.env.WEB_PORT || '3000');

    // Check for existing Basher instance (singleton pattern)
    existingInstanceInfo = await instanceDetector.checkExistingInstance();

    if (existingInstanceInfo) {
      // Another instance is already running - run in client mode (no web server)
      isPrimaryInstance = false;

      // Initialize notifier to send events to primary instance
      instanceNotifier = new InstanceNotifier({
        primaryPort: existingInstanceInfo.port,
      });

      logger.info(
        {
          existingPort: existingInstanceInfo.port,
          existingPid: existingInstanceInfo.pid,
        },
        'Existing Basher instance detected, running in client mode (shared web server)'
      );
      console.log(`\n🔗 Connected to existing Basher instance at: http://localhost:${existingInstanceInfo.port}\n`);
    } else {
      // No existing instance - become the primary instance with web server
      isPrimaryInstance = true;
      webServer = new WebServer(historyManager, webPort);
      await webServer.start();

      // Write instance files for other terminals to detect
      instanceDetector.writeInstanceFiles(webServer.getPort());

      logger.info(
        {
          name: packageJson.name,
          version: packageJson.version,
          webPort: webServer.getPort(),
          isPrimary: true,
        },
        'Basher MCP server started as primary instance'
      );
    }

    // Start MCP server on stdio (always starts, regardless of primary/client mode)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info(
      {
        name: packageJson.name,
        version: packageJson.version,
        isPrimaryInstance,
        webPort: isPrimaryInstance ? webServer?.getPort() : existingInstanceInfo?.port,
      },
      'Basher MCP server started successfully'
    );

    // Graceful shutdown
    const shutdown = async () => {
      logger.info({ isPrimaryInstance }, 'Shutting down gracefully...');

      // Save or cleanup process state before exit
      processManager.cleanup();

      if (isPrimaryInstance) {
        // Primary instance: stop web server and clean up instance files
        if (webServer) {
          await webServer.stop();
        }
        instanceDetector.cleanup();
        logger.info('Primary instance shutdown complete, instance files cleaned up');
      }

      historyManager.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.fatal({
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name
    }, 'Failed to start MCP server');
    console.error('Startup error details:', error);
    process.exit(1);
  }
}

main();
