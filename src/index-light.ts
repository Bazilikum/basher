#!/usr/bin/env node

/**
 * Basher Light - Minimal MCP Server for Command Execution
 *
 * A lightweight version with only essential tools (~5 vs 27+):
 * - execute_command: Run commands with history tracking
 * - get_command: Look up command results by ID or processId
 * - get_running_commands: List currently running commands
 * - terminate_command: Stop a running command
 * - get_version: Get Basher version info
 *
 * Use this for reduced context overhead (~80% fewer tokens in tool definitions).
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
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import logger from './services/logger.config.js';
import { HistoryManager } from './services/history-manager.js';
import { executeCommand, type CommandExecutionCallbacks } from './services/command-executor.js';
import { processManager, ProcessManager } from './services/process-manager.js';
import { whitelistManager, WhitelistManager } from './services/whitelist-manager.js';

// Read package.json for version info
const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

/**
 * Tool context for light version handlers
 * Services can be injected for testing, otherwise falls back to singletons
 */
export interface LightToolContext {
  historyManager: HistoryManager;
  version: string;
  processManager?: ProcessManager;
  whitelistManager?: WhitelistManager;
}

/**
 * Get process manager from context or singleton
 */
function getProcessManager(context?: LightToolContext): ProcessManager {
  // For testing, we'd pass processManager in context
  // For runtime, use the singleton
  if (context?.processManager) {
    return context.processManager;
  }
  // Return a singleton wrapper
  return processManager as any;
}

/**
 * Get whitelist manager from context or singleton
 */
function getWhitelistManager(context?: LightToolContext): WhitelistManager {
  if (context?.whitelistManager) {
    return context.whitelistManager;
  }
  return whitelistManager;
}

// Determine project path
function determineProjectPath(): string {
  const argIndex = process.argv.indexOf('--project');
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return resolve(process.argv[argIndex + 1]);
  }
  if (process.env.BASHER_PROJECT_ROOT) {
    return resolve(process.env.BASHER_PROJECT_ROOT);
  }
  return homedir();
}

// Initialize database
function initializeDatabase(): { dbPath: string; basherDir: string } {
  if (process.env.DB_PATH) {
    const basherDir = dirname(process.env.DB_PATH);
    return { dbPath: process.env.DB_PATH, basherDir };
  }

  const projectPath = determineProjectPath();
  const basherDir = join(projectPath, '.basher');

  if (!existsSync(basherDir)) {
    mkdirSync(basherDir, { recursive: true });
  }

  const dbPath = join(basherDir, 'basher.db');
  return { dbPath, basherDir };
}

const { dbPath, basherDir } = initializeDatabase();
const historyManager = new HistoryManager(dbPath);

// Initialize whitelist
whitelistManager.initialize(basherDir);

// Zod schemas
const executeCommandSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().positive().optional(),
  background: z.boolean().optional().default(true),
  title: z.string().optional(),
  timestamps: z.boolean().optional().default(false),
});

/**
 * Format response as JSON string (light version response format)
 */
function jsonResponse(data: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Execute command handler
 */
export async function handleExecuteCommand(
  args: unknown,
  context: LightToolContext
) {
  const params = executeCommandSchema.parse(args);
  const { command, cwd, timeout, background, title, timestamps } = params;

  const wlManager = getWhitelistManager(context);
  const pm = getProcessManager(context);

  // Whitelist check
  const whitelistCheck = wlManager.check(command);
  if (!whitelistCheck.allowed) {
    return jsonResponse({
      status: 'blocked',
      error: 'COMMAND_NOT_WHITELISTED',
      commandBase: whitelistCheck.commandBase,
      message: whitelistCheck.reason,
    });
  }

  let capturedProcessId: number | null = null;
  let capturedDatabaseId: number | null = null;

  const callbacks: CommandExecutionCallbacks = {
    onStart: (processId, cmd, cmdTitle, cmdCwd) => {
      capturedProcessId = processId;
      const historyEntry = {
        command: cmd,
        title: cmdTitle,
        cwd: cmdCwd,
        timestamp: new Date().toISOString(),
        exitCode: -1,
        duration: 0,
        stdout: '',
        stderr: '',
        processId,
        status: 'running',
      };
      capturedDatabaseId = context.historyManager.saveCommand(historyEntry);
      pm.setDatabaseId(processId, capturedDatabaseId);
    },
  };

  const updateOnComplete = (result: any) => {
    if (capturedDatabaseId) {
      context.historyManager.updateStatus(
        capturedDatabaseId,
        'completed',
        result.exitCode,
        result.duration,
        result.stdout,
        result.stderr
      );
    }
    pm.unregister(result.processId);
    return capturedDatabaseId;
  };

  if (background) {
    executeCommand(command, cwd, undefined, timeout, title, callbacks, timestamps)
      .then(updateOnComplete)
      .catch(error => logger.error({ error }, 'Background command failed'));

    // Wait for processId
    await new Promise(resolve => setTimeout(resolve, 50));

    return jsonResponse({
      status: 'started',
      processId: capturedProcessId,
      id: capturedDatabaseId,
      command,
      background: true,
    });
  }

  // Synchronous execution
  const result = await executeCommand(command, cwd, undefined, timeout, title, callbacks, timestamps);
  const commandId = updateOnComplete(result);

  return jsonResponse({
    status: 'completed',
    id: commandId,
    processId: result.processId,
    exitCode: result.exitCode,
    duration: `${result.duration}ms`,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

/**
 * Get command handler (by ID or processId)
 */
export async function handleGetCommand(
  args: unknown,
  context: LightToolContext
) {
  const params = z.object({
    commandId: z.number().optional(),
    processId: z.number().optional(),
  }).parse(args);

  let command;
  if (params.commandId !== undefined) {
    command = context.historyManager.getCommandById(params.commandId);
  } else if (params.processId !== undefined) {
    command = context.historyManager.getCommandByProcessId(params.processId);
  } else {
    return jsonResponse({ error: 'Either commandId or processId required' });
  }

  if (!command) {
    return jsonResponse({ error: 'Command not found' });
  }

  return jsonResponse({
    id: command.id,
    processId: command.processId,
    command: command.command,
    exitCode: command.exitCode,
    duration: `${command.duration}ms`,
    stdout: command.stdout,
    stderr: command.stderr,
  });
}

/**
 * Get running commands handler
 */
export async function handleGetRunningCommands(context?: LightToolContext) {
  const pm = getProcessManager(context);
  const running = pm.getRunning();
  return jsonResponse({
    count: running.length,
    running: running.map((r: { id: number; pid: number; command: string; title: string; duration: number }) => ({ ...r, duration: `${r.duration}ms` })),
  });
}

/**
 * Terminate command handler
 */
export async function handleTerminateCommand(args: unknown, context?: LightToolContext) {
  const params = z.object({ processId: z.number() }).parse(args);
  const pm = getProcessManager(context);
  const success = pm.kill(params.processId);
  return jsonResponse({
    processId: params.processId,
    success,
    message: success ? 'Process terminated' : 'Process not found',
  });
}

/**
 * Get version handler
 */
export async function handleGetVersion(context: LightToolContext) {
  return jsonResponse({
    name: 'basher-light',
    version: context.version,
    description: 'Minimal Basher with 5 essential tools',
  });
}

// Create MCP server
const server = new Server(
  { name: 'basher-light', version: packageJson.version },
  { capabilities: { tools: {} } }
);

// List available tools (minimal set)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_command',
        description: 'Execute commands with history tracking. Runs in background by default.',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
            timeout: { type: 'number', description: 'Timeout in ms (optional)' },
            background: { type: 'boolean', description: 'Run in background (default: true)' },
            title: { type: 'string', description: 'Label for this command (optional)' },
            timestamps: { type: 'boolean', description: 'Add per-line timestamps (default: false)' },
          },
          required: ['command'],
        },
      },
      {
        name: 'get_command',
        description: 'Get command details by ID or process ID.',
        inputSchema: {
          type: 'object',
          properties: {
            commandId: { type: 'number', description: 'Command ID from history' },
            processId: { type: 'number', description: 'Process ID from execute_command' },
          },
        },
      },
      {
        name: 'get_running_commands',
        description: 'List all currently running commands.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'terminate_command',
        description: 'Terminate a running command by process ID.',
        inputSchema: {
          type: 'object',
          properties: {
            processId: { type: 'number', description: 'Process ID to terminate' },
          },
          required: ['processId'],
        },
      },
      {
        name: 'get_version',
        description: 'Get Basher Light version info.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const context: LightToolContext = {
      historyManager,
      version: packageJson.version,
      // In runtime mode, singletons will be used via getProcessManager/getWhitelistManager
    };

    switch (name) {
      case 'execute_command':
        return await handleExecuteCommand(args, context);
      case 'get_command':
        return await handleGetCommand(args, context);
      case 'get_running_commands':
        return await handleGetRunningCommands(context);
      case 'terminate_command':
        return await handleTerminateCommand(args, context);
      case 'get_version':
        return await handleGetVersion(context);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    logger.error({ error, tool: name }, 'Tool execution failed');
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, error.message || 'Tool execution failed');
  }
});

// Start server
async function main() {
  logger.info({ version: packageJson.version, mode: 'light' }, 'Starting Basher Light MCP server');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Basher Light MCP server running');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start Basher Light server');
  process.exit(1);
});
