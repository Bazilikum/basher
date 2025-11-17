#!/usr/bin/env node

/**
 * Command N Conquer - MCP Server for Enhanced Command Execution
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
import logger from './services/logger.config.js';
import { HistoryManager } from './services/history-manager.js';
import { executeCommand } from './services/command-executor.js';

// Initialize history manager
const historyManager = new HistoryManager();

// Zod schemas for input validation
const executeCommandSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
  cwd: z.string().optional(),
  stdin: z.string().optional(),
  timeout: z.number().positive().optional().default(300000),
});

const searchHistorySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  limit: z.number().positive().optional().default(50),
  exitCode: z.number().optional(),
});

const getRecentCommandsSchema = z.object({
  limit: z.number().positive().optional().default(100),
});

// Create MCP server
const server = new Server(
  {
    name: 'command-n-conquer',
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
        description: 'Execute a shell command with enhanced logging, real-time output capture, and automatic history tracking. Returns stdout, stderr, exit code, and execution duration.',
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
        description: 'Retrieve the most recent command executions from history. Returns commands in reverse chronological order with full execution details.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of recent commands to retrieve (optional, defaults to 100)',
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
      const { command, cwd, stdin, timeout } = params;

      logger.info({ command, cwd, timeout }, 'Executing command via MCP tool');

      const result = await executeCommand(command, cwd, stdin, timeout);

      // Save to history
      historyManager.saveCommand({
        command,
        cwd: cwd || process.cwd(),
        timestamp: result.timestamp,
        exitCode: result.exitCode,
        duration: result.duration,
        stdout: result.stdout,
        stderr: result.stderr,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                command,
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
      const { limit } = params;

      logger.info({ limit }, 'Getting recent commands');

      const results = historyManager.getRecentHistory(limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
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
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info(
      {
        name: 'command-n-conquer',
        version: '1.0.0',
      },
      'Command N Conquer MCP server started successfully'
    );

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      historyManager.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      historyManager.close();
      process.exit(0);
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start MCP server');
    process.exit(1);
  }
}

main();
