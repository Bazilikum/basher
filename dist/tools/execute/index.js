/**
 * Execute Tools for Basher MCP Server
 *
 * These tools handle process management operations:
 * - Terminating running commands
 * - Getting running commands list
 * - Getting process output
 * - Polling until command completes
 *
 * Note: execute_command and run_template remain in main index.ts
 * due to their complexity and tight integration with callbacks.
 */
import { z } from 'zod';
import logger from '../../services/logger.config.js';
import { processManager } from '../../services/process-manager.js';
import { STALE_COMMAND_THRESHOLD_MS } from '../../constants.js';
import { createToolResult } from '../index.js';
// Validation schemas
const terminateCommandSchema = z.object({
    processId: z.number(),
});
const getProcessOutputSchema = z.object({
    processId: z.number(),
    lines: z.number().positive().optional(),
});
const pollUntilCompleteSchema = z.object({
    processId: z.number(),
    pollInterval: z.number().min(500).optional().default(1000),
    timeout: z.number().positive().optional().default(300000),
});
/**
 * Terminate command handler
 */
async function handleTerminateCommand(args, context) {
    const params = terminateCommandSchema.parse(args);
    const { processId } = params;
    logger.info({ processId }, 'Terminating command via MCP tool');
    const success = processManager.kill(processId);
    // Broadcast to web UI clients
    if (context.webServer) {
        context.webServer.broadcast('command_terminated', { processId });
    }
    return createToolResult({
        processId,
        success,
        message: success
            ? `Process ${processId} terminated successfully`
            : `Process ${processId} not found or already completed`,
    });
}
/**
 * Get running commands handler
 */
async function handleGetRunningCommands(_args, _context) {
    const running = processManager.getRunning();
    return createToolResult({
        count: running.length,
        running: running.map((r) => ({
            ...r,
            duration: `${r.duration}ms`,
        })),
    });
}
/**
 * Get process output handler
 */
async function handleGetProcessOutput(args, _context) {
    const params = getProcessOutputSchema.parse(args);
    logger.info({ processId: params.processId, lines: params.lines }, 'Getting process output');
    const output = processManager.getOutput(params.processId, params.lines);
    if (!output) {
        return createToolResult({
            error: 'Process not found',
            processId: params.processId,
            message: 'The process may have already completed or does not exist. Use search_command_history or get_recent_commands to find completed executions.',
        });
    }
    return createToolResult({
        processId: output.processId,
        command: output.command,
        status: output.status,
        duration: `${output.duration}ms`,
        stdoutLines: output.stdout.split('\n').length - 1,
        stderrLines: output.stderr.split('\n').length - 1,
        stdout: output.stdout,
        stderr: output.stderr,
    });
}
/**
 * Poll until complete handler
 */
async function handlePollUntilComplete(args, context) {
    const params = pollUntilCompleteSchema.parse(args);
    const { processId, pollInterval, timeout } = params;
    logger.info({ processId, pollInterval, timeout }, 'Polling until command completes');
    // Check if process is currently running
    if (processManager.isRunning(processId)) {
        logger.debug({ processId }, 'Process is running, will poll for completion');
    }
    else {
        // Process is not running - check if it completed recently (in history)
        const existingCommand = context.historyManager.getCommandByProcessId(processId);
        if (existingCommand) {
            // Verify this is a recent command to avoid returning stale data
            const commandTime = new Date(existingCommand.timestamp).getTime();
            const cutoffTime = Date.now() - STALE_COMMAND_THRESHOLD_MS;
            if (commandTime > cutoffTime) {
                return createToolResult({
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
                });
            }
            else {
                // Found a stale command from a previous session
                logger.warn({ processId, foundCommandId: existingCommand.id, foundTimestamp: existingCommand.timestamp }, 'Found stale command with reused process ID');
            }
        }
        // Process not running and no recent history entry
        return createToolResult({
            status: 'not_found',
            processId,
            message: 'Process not found. It may have completed before polling started, or the process ID may be from a previous session.',
        });
    }
    // Poll until complete
    const startTime = Date.now();
    const pollResult = await new Promise((resolve) => {
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
            const completedCommand = context.historyManager.getCommandByProcessId(processId);
            if (completedCommand) {
                resolve({
                    status: 'completed',
                    data: completedCommand,
                });
            }
            else {
                // Give it a moment for the save to complete
                setTimeout(() => {
                    const retryCommand = context.historyManager.getCommandByProcessId(processId);
                    if (retryCommand) {
                        resolve({
                            status: 'completed',
                            data: retryCommand,
                        });
                    }
                    else {
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
        return createToolResult({
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
        });
    }
    // Timeout or error
    return createToolResult({
        status: pollResult.status,
        processId,
        polledFor: `${Date.now() - startTime}ms`,
        error: pollResult.error,
        hint: pollResult.status === 'timeout'
            ? 'Command is still running. You can call poll_until_complete again or use terminate_command to stop it.'
            : 'Try get_command_by_process_id to check if the command completed.',
    });
}
/**
 * Execute tool definitions (process management tools)
 */
export const executeTools = [
    {
        name: 'terminate_command',
        description: 'Terminate a running command by process ID (SIGTERM, then SIGKILL).',
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
        handler: handleTerminateCommand,
    },
    {
        name: 'get_running_commands',
        description: 'List all currently running commands with processId and duration.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: handleGetRunningCommands,
    },
    {
        name: 'get_process_output',
        description: 'Get stdout/stderr from a running command. Optionally limit to last N lines.',
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
        handler: handleGetProcessOutput,
    },
    {
        name: 'poll_until_complete',
        description: 'Wait for background command to complete. More efficient than manual polling.',
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
        handler: handlePollUntilComplete,
    },
];
