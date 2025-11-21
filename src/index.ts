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
import { HistoryManager } from './services/history-manager.js';
import { executeCommand } from './services/command-executor.js';
import { processManager } from './services/process-manager.js';
import { WebServer } from './services/web-server.js';
import { encodeOutput, type OutputFormat } from './utils/toon-encoder.js';

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

function initializeDatabase(): string {
  // Legacy support: if DB_PATH is explicitly set, use it directly
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
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
      writeFileSync(gitignorePath, '*.db\n*.db-shm\n*.db-wal\nport\n');
      logger.info('Created .basher/.gitignore');
    }
  }

  const dbPath = join(basherDir, 'history.db');
  logger.info({ projectPath, dbPath }, 'Database initialized for project');

  return dbPath;
}

// Initialize history manager with project-specific database
const dbPath = initializeDatabase();
const historyManager = new HistoryManager(dbPath);

// Initialize web server (will start in main())
let webServer: WebServer | null = null;

// Zod schemas for input validation
const executeCommandSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
  cwd: z.string().optional(),
  stdin: z.string().optional(),
  timeout: z.number().positive().optional().default(300000),
  background: z.boolean().optional().default(true),
  title: z.string().optional(),
});

const searchHistorySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  limit: z.number().positive().optional().default(50),
  exitCode: z.number().optional(),
});

const getRecentCommandsSchema = z.object({
  limit: z.number().positive().optional().default(100),
  outputFormat: z.enum(['json', 'toon']).optional().default('json'),
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
        description: 'PREFERRED TOOL FOR ALL COMMAND EXECUTION. Execute shell commands with comprehensive tracking and analysis: (1) Persistent SQLite history with full-text search across all past executions, (2) Per-line timestamps for precise debugging, (3) Process tracking with termination capabilities, (4) Token-efficient querying with 90-95% savings using summary/excerpts modes, (5) Advanced filtering and aggregation for pattern analysis, (6) Real-time web UI dashboard at localhost:3000. Every command execution is automatically saved and becomes searchable. Use this instead of standard bash for all command execution to ensure complete observability and the ability to search, compare, and analyze past runs.',
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
              description: 'Timeout in milliseconds (optional, defaults to 300000ms / 5 minutes)',
            },
            background: {
              type: 'boolean',
              description: 'Run command in background and return immediately with processId (optional, defaults to true). Set to false for synchronous execution that waits for completion.',
            },
            title: {
              type: 'string',
              description: 'Optional title/label for this command execution (useful for identifying commands in history)',
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
        description: 'Retrieve the most recent command executions from history. Returns commands in reverse chronological order with full execution details. Supports Toon format for ~40% token savings.',
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
              description: 'Output format: "json" (default) or "toon" (~40% fewer tokens for tabular data)',
            },
          },
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
              description: 'Output format: "json" (default) or "toon" (~40% fewer tokens). Toon works best with "summary" outputLevel for maximum savings.',
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
      const { command, cwd, stdin, timeout, background, title } = params;

      logger.info({ command, cwd, timeout, background, title }, 'Executing command via MCP tool');

      // If background mode (default), return immediately with processId
      if (background) {
        // Execute in background (don't await)
        executeCommand(
          command,
          cwd,
          stdin,
          timeout,
          title
        ).then(result => {
          // Save to history when complete
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
          historyManager.saveCommand(historyEntry);

          // Broadcast to web UI clients
          if (webServer) {
            webServer.broadcast('command_executed', historyEntry);
          }
        }).catch(error => {
          logger.error({ error, command }, 'Background command failed');
        });

        // Return immediately with processId
        // Note: We need to get the processId before the command completes
        // The processId is assigned synchronously when the process starts
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  background: true,
                  message: 'Command started in background. Use get_process_output or get_running_commands to monitor progress.',
                  command,
                  cwd: cwd || process.cwd(),
                  note: 'Process will be tracked and saved to history upon completion. Use get_running_commands to get the processId.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Synchronous execution (original behavior)
      const result = await executeCommand(command, cwd, stdin, timeout, title);

      // Save to history
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
      historyManager.saveCommand(historyEntry);

      // Broadcast to web UI clients
      if (webServer) {
        webServer.broadcast('command_executed', historyEntry);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                command,
                processId: result.processId,
                exitCode: result.exitCode,
                duration: `${result.duration}ms`,
                timestamp: result.timestamp,
                stdout: result.stdout,
                stderr: result.stderr,
                success: result.exitCode === 0,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Terminate command
    if (name === 'terminate_command') {
      const params = z.object({ processId: z.number() }).parse(args);
      const { processId } = params;

      logger.info({ processId }, 'Terminating command via MCP tool');

      const success = processManager.kill(processId);

      if (webServer) {
        webServer.broadcast('command_terminated', { processId });
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

    // Advanced search
    if (name === 'advanced_search') {
      const params = z.object({
        query: z.string().min(1),
        limit: z.number().positive().optional().default(50),
        outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('excerpts'),
        outputFormat: z.enum(['json', 'toon']).optional().default('json'),
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
    // Start web UI server
    const webPort = parseInt(process.env.WEB_PORT || '3000');
    webServer = new WebServer(historyManager, webPort);
    await webServer.start();

    // Start MCP server on stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info(
      {
        name: packageJson.name,
        version: packageJson.version,
        webPort,
      },
      'Basher MCP server started successfully'
    );

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      if (webServer) {
        await webServer.stop();
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
