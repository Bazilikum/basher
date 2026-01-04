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
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { join, resolve, dirname } from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import logger from './services/logger.config.js';
import { HistoryManager } from './services/history-manager.js';
import { executeCommand } from './services/command-executor.js';
import { processManager } from './services/process-manager.js';
import { whitelistManager } from './services/whitelist-manager.js';
// Read package.json for version info
const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
// Determine project path
function determineProjectPath() {
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
function initializeDatabase() {
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
// Create MCP server
const server = new Server({ name: 'basher-light', version: packageJson.version }, { capabilities: { tools: {} } });
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
        // Execute command
        if (name === 'execute_command') {
            const params = executeCommandSchema.parse(args);
            const { command, cwd, timeout, background, title, timestamps } = params;
            // Whitelist check
            const whitelistCheck = whitelistManager.check(command);
            if (!whitelistCheck.allowed) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                status: 'blocked',
                                error: 'COMMAND_NOT_WHITELISTED',
                                commandBase: whitelistCheck.commandBase,
                                message: whitelistCheck.reason,
                            }, null, 2),
                        }],
                };
            }
            let capturedProcessId = null;
            let capturedDatabaseId = null;
            const callbacks = {
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
                    capturedDatabaseId = historyManager.saveCommand(historyEntry);
                    processManager.setDatabaseId(processId, capturedDatabaseId);
                },
            };
            const updateOnComplete = (result) => {
                if (capturedDatabaseId) {
                    historyManager.updateStatus(capturedDatabaseId, 'completed', result.exitCode, result.duration, result.stdout, result.stderr);
                }
                processManager.unregister(result.processId);
                return capturedDatabaseId;
            };
            if (background) {
                executeCommand(command, cwd, undefined, timeout, title, callbacks, timestamps)
                    .then(updateOnComplete)
                    .catch(error => logger.error({ error }, 'Background command failed'));
                // Wait for processId
                await new Promise(resolve => setTimeout(resolve, 50));
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                status: 'started',
                                processId: capturedProcessId,
                                id: capturedDatabaseId,
                                command,
                                background: true,
                            }, null, 2),
                        }],
                };
            }
            // Synchronous execution
            const result = await executeCommand(command, cwd, undefined, timeout, title, callbacks, timestamps);
            const commandId = updateOnComplete(result);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'completed',
                            id: commandId,
                            processId: result.processId,
                            exitCode: result.exitCode,
                            duration: `${result.duration}ms`,
                            stdout: result.stdout,
                            stderr: result.stderr,
                        }, null, 2),
                    }],
            };
        }
        // Get command
        if (name === 'get_command') {
            const params = z.object({
                commandId: z.number().optional(),
                processId: z.number().optional(),
            }).parse(args);
            let command;
            if (params.commandId !== undefined) {
                command = historyManager.getCommandById(params.commandId);
            }
            else if (params.processId !== undefined) {
                command = historyManager.getCommandByProcessId(params.processId);
            }
            else {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({ error: 'Either commandId or processId required' }, null, 2),
                        }],
                };
            }
            if (!command) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({ error: 'Command not found' }, null, 2),
                        }],
                };
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            id: command.id,
                            processId: command.processId,
                            command: command.command,
                            exitCode: command.exitCode,
                            duration: `${command.duration}ms`,
                            stdout: command.stdout,
                            stderr: command.stderr,
                        }, null, 2),
                    }],
            };
        }
        // Get running commands
        if (name === 'get_running_commands') {
            const running = processManager.getRunning();
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            count: running.length,
                            running: running.map(r => ({ ...r, duration: `${r.duration}ms` })),
                        }, null, 2),
                    }],
            };
        }
        // Terminate command
        if (name === 'terminate_command') {
            const params = z.object({ processId: z.number() }).parse(args);
            const success = processManager.kill(params.processId);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            processId: params.processId,
                            success,
                            message: success ? 'Process terminated' : 'Process not found',
                        }, null, 2),
                    }],
            };
        }
        // Get version
        if (name === 'get_version') {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            name: 'basher-light',
                            version: packageJson.version,
                            description: 'Minimal Basher with 5 essential tools',
                        }, null, 2),
                    }],
            };
        }
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    catch (error) {
        logger.error({ error, tool: name }, 'Tool execution failed');
        if (error instanceof McpError)
            throw error;
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
