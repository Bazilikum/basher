/**
 * History Tools for Basher MCP Server
 *
 * These tools handle command history operations:
 * - Searching command history
 * - Getting recent commands
 * - Getting commands by ID
 * - Getting command statistics
 * - Advanced search with filtering
 * - Aggregations and comparisons
 */
import { z } from 'zod';
import logger from '../../services/logger.config.js';
import { encodeOutput } from '../../utils/toon-encoder.js';
import { createToolResult } from '../index.js';
// Validation schemas
const searchHistorySchema = z.object({
    query: z.string().min(1, 'Query cannot be empty'),
    limit: z.number().positive().optional().default(50),
    exitCode: z.number().optional(),
});
const getRecentCommandsSchema = z.object({
    limit: z.number().positive().optional().default(100),
    outputFormat: z.enum(['json', 'toon']).optional().default('toon'),
});
const advancedSearchSchema = z.object({
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
});
const aggregationsSchema = z.object({
    groupBy: z.enum(['command', 'cwd', 'exitCode', 'hour', 'day']),
    includeStats: z.boolean().optional().default(true),
    limit: z.number().positive().optional().default(20),
    filters: z.object({
        dateRange: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
        }).optional(),
        workingDir: z.string().optional(),
        commandPattern: z.string().optional(),
        exitCodes: z.array(z.number()).optional(),
    }).optional(),
});
const lastFailuresSchema = z.object({
    limit: z.number().positive().optional().default(10),
    outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('summary'),
    since: z.string().optional(),
});
const similarCommandsSchema = z.object({
    commandId: z.number(),
    limit: z.number().positive().optional().default(10),
    outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('summary'),
});
const commandChainSchema = z.object({
    startId: z.number(),
    maxCommands: z.number().positive().optional().default(10),
    outputLevel: z.enum(['summary', 'preview', 'excerpts', 'full']).optional().default('summary'),
});
const compareExecutionsSchema = z.object({
    commandId1: z.number(),
    commandId2: z.number(),
});
/**
 * Search command history handler
 */
async function handleSearchHistory(args, context) {
    const params = searchHistorySchema.parse(args);
    const { query, limit, exitCode } = params;
    logger.info({ query, limit, exitCode }, 'Searching command history');
    let results = context.historyManager.searchHistory(query, limit);
    // Filter by exit code if specified
    if (exitCode !== undefined) {
        results = results.filter((r) => r.exitCode === exitCode);
    }
    return createToolResult({
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
    });
}
/**
 * Get recent commands handler
 */
async function handleGetRecentCommands(args, context) {
    const params = getRecentCommandsSchema.parse(args);
    const { limit, outputFormat } = params;
    logger.info({ limit, outputFormat }, 'Getting recent commands');
    const results = context.historyManager.getRecentHistory(limit);
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
        content: [{
                type: 'text',
                text: encodeOutput(data, outputFormat),
            }],
    };
}
/**
 * Get command by ID handler
 */
async function handleGetCommandById(args, context) {
    const params = z.object({ commandId: z.number() }).parse(args);
    const { commandId } = params;
    logger.info({ commandId }, 'Getting command by ID');
    const command = context.historyManager.getCommandById(commandId);
    if (!command) {
        return createToolResult({
            error: 'Command not found',
            commandId,
            message: 'No command exists with this ID. Use get_recent_commands or search_command_history to find available commands.',
        });
    }
    return createToolResult({
        id: command.id,
        command: command.command,
        title: command.title,
        cwd: command.cwd,
        timestamp: command.timestamp,
        exitCode: command.exitCode,
        duration: `${command.duration}ms`,
        stdout: command.stdout,
        stderr: command.stderr,
    });
}
/**
 * Get command by process ID handler
 */
async function handleGetCommandByProcessId(args, context) {
    const params = z.object({ processId: z.number() }).parse(args);
    const { processId } = params;
    logger.info({ processId }, 'Getting command by process ID');
    const command = context.historyManager.getCommandByProcessId(processId);
    if (!command) {
        return createToolResult({
            error: 'Command not found',
            processId,
            message: 'No command found with this process ID. The process may still be running or was never started.',
        });
    }
    return createToolResult({
        id: command.id,
        processId: command.processId,
        command: command.command,
        title: command.title,
        cwd: command.cwd,
        timestamp: command.timestamp,
        exitCode: command.exitCode,
        duration: `${command.duration}ms`,
        status: command.status,
        stdout: command.stdout,
        stderr: command.stderr,
    });
}
/**
 * Get command stats handler
 */
async function handleGetCommandStats(_args, context) {
    logger.info('Getting command stats');
    const stats = context.historyManager.getStats();
    return createToolResult({
        total: stats.total,
        failures: stats.failures,
        successRate: stats.total > 0
            ? `${Math.round(((stats.total - stats.failures) / stats.total) * 100)}%`
            : 'N/A',
        avgDuration: `${stats.avgDuration}ms`,
    });
}
/**
 * Advanced search handler
 */
async function handleAdvancedSearch(args, context) {
    const params = advancedSearchSchema.parse(args);
    logger.info({ query: params.query, outputLevel: params.outputLevel }, 'Advanced search');
    const results = context.historyManager.advanced.advancedSearch(params.query, params.limit, params.outputLevel, params.contextLines, params.filters);
    const data = {
        query: params.query,
        outputLevel: params.outputLevel,
        resultsCount: results.length,
        results,
    };
    return {
        content: [{
                type: 'text',
                text: encodeOutput(data, params.outputFormat),
            }],
    };
}
/**
 * Get aggregations handler
 */
async function handleGetAggregations(args, context) {
    const params = aggregationsSchema.parse(args);
    logger.info({ groupBy: params.groupBy }, 'Getting aggregations');
    const results = context.historyManager.advanced.getAggregations({
        groupBy: params.groupBy,
        includeStats: params.includeStats,
        limit: params.limit,
        filters: params.filters,
    });
    return createToolResult({
        groupBy: params.groupBy,
        count: results.length,
        aggregations: results,
    });
}
/**
 * Get last failures handler
 */
async function handleGetLastFailures(args, context) {
    const params = lastFailuresSchema.parse(args);
    logger.info({ limit: params.limit }, 'Getting last failures');
    const results = context.historyManager.advanced.getLastFailures(params.limit, params.outputLevel, params.since);
    return createToolResult({
        count: results.length,
        failures: results,
    });
}
/**
 * Get similar commands handler
 */
async function handleGetSimilarCommands(args, context) {
    const params = similarCommandsSchema.parse(args);
    logger.info({ commandId: params.commandId }, 'Getting similar commands');
    const results = context.historyManager.advanced.getSimilarCommands(params.commandId, params.limit, params.outputLevel);
    return createToolResult({
        referenceCommandId: params.commandId,
        count: results.length,
        similar: results,
    });
}
/**
 * Get command chain handler
 */
async function handleGetCommandChain(args, context) {
    const params = commandChainSchema.parse(args);
    logger.info({ startId: params.startId }, 'Getting command chain');
    const results = context.historyManager.advanced.getCommandChain(params.startId, params.maxCommands, params.outputLevel);
    return createToolResult({
        startId: params.startId,
        count: results.length,
        chain: results,
    });
}
/**
 * Compare executions handler
 */
async function handleCompareExecutions(args, context) {
    const params = compareExecutionsSchema.parse(args);
    logger.info({ id1: params.commandId1, id2: params.commandId2 }, 'Comparing executions');
    const result = context.historyManager.advanced.compareExecutions(params.commandId1, params.commandId2);
    if (!result) {
        return createToolResult({
            error: 'One or both commands not found',
            commandId1: params.commandId1,
            commandId2: params.commandId2,
        });
    }
    return createToolResult(result);
}
/**
 * History tool definitions
 */
export const historyTools = [
    {
        name: 'search_command_history',
        description: 'Search past command executions using full-text search. Searches across command text, stdout, and stderr. Returns matching commands with their complete execution details.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query for full-text search (searches command, stdout, stderr)' },
                limit: { type: 'number', description: 'Maximum number of results to return (optional, defaults to 50)' },
                exitCode: { type: 'number', description: 'Filter results by exit code (optional)' },
            },
            required: ['query'],
        },
        handler: handleSearchHistory,
    },
    {
        name: 'get_recent_commands',
        description: 'Retrieve the most recent command executions from history. Returns commands in reverse chronological order with full execution details. Returns Toon format by default for ~40% token savings.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of recent commands to retrieve (optional, defaults to 100)' },
                outputFormat: { type: 'string', enum: ['json', 'toon'], description: 'Output format: "toon" (default, ~40% fewer tokens) or "json"' },
            },
        },
        handler: handleGetRecentCommands,
    },
    {
        name: 'get_command_by_id',
        description: 'Retrieve a specific command execution by its ID from the history database. Returns complete execution details including stdout, stderr, exit code, duration, and metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                commandId: { type: 'number', description: 'The ID of the command to retrieve' },
            },
            required: ['commandId'],
        },
        handler: handleGetCommandById,
    },
    {
        name: 'get_command_by_process_id',
        description: 'Look up a completed command by its process ID. Use this to find the database ID and full details of a background command after it completes.',
        inputSchema: {
            type: 'object',
            properties: {
                processId: { type: 'number', description: 'The process ID that was returned when the command was started' },
            },
            required: ['processId'],
        },
        handler: handleGetCommandByProcessId,
    },
    {
        name: 'get_command_stats',
        description: 'Get statistics about command execution history including total commands, failures, and average execution duration.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: handleGetCommandStats,
    },
    {
        name: 'advanced_search',
        description: 'Search command history with advanced filtering and tiered output levels for token efficiency. Use outputLevel to control response size.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query for full-text search' },
                limit: { type: 'number', description: 'Maximum results (default: 50)' },
                outputLevel: { type: 'string', enum: ['summary', 'preview', 'excerpts', 'full'], description: 'Output detail level' },
                outputFormat: { type: 'string', enum: ['json', 'toon'], description: 'Output format' },
                contextLines: { type: 'number', description: 'Lines of context around matches (default: 3)' },
                filters: { type: 'object', description: 'Advanced filters' },
            },
            required: ['query'],
        },
        handler: handleAdvancedSearch,
    },
    {
        name: 'get_aggregations',
        description: 'Get aggregated statistics grouped by command, directory, exit code, or time.',
        inputSchema: {
            type: 'object',
            properties: {
                groupBy: { type: 'string', enum: ['command', 'cwd', 'exitCode', 'hour', 'day'], description: 'Group results by this field' },
                includeStats: { type: 'boolean', description: 'Include detailed statistics' },
                limit: { type: 'number', description: 'Maximum number of groups to return' },
                filters: { type: 'object', description: 'Apply filters before aggregation' },
            },
            required: ['groupBy'],
        },
        handler: handleGetAggregations,
    },
    {
        name: 'get_last_failures',
        description: 'Quick access to recent failed commands. Token-efficient alternative to searching with exitCode filter.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum failures to return (default: 10)' },
                outputLevel: { type: 'string', enum: ['summary', 'preview', 'excerpts', 'full'], description: 'Output detail level' },
                since: { type: 'string', description: 'ISO date string - only failures after this date' },
            },
        },
        handler: handleGetLastFailures,
    },
    {
        name: 'get_similar_commands',
        description: 'Find commands similar to a given command (same base command and working directory).',
        inputSchema: {
            type: 'object',
            properties: {
                commandId: { type: 'number', description: 'Reference command ID' },
                limit: { type: 'number', description: 'Maximum results (default: 10)' },
                outputLevel: { type: 'string', enum: ['summary', 'preview', 'excerpts', 'full'], description: 'Output detail level' },
            },
            required: ['commandId'],
        },
        handler: handleGetSimilarCommands,
    },
    {
        name: 'get_command_chain',
        description: 'Get a sequence of commands executed in the same working directory around a specific command.',
        inputSchema: {
            type: 'object',
            properties: {
                startId: { type: 'number', description: 'Center the chain around this command ID' },
                maxCommands: { type: 'number', description: 'Maximum commands in the chain (default: 10)' },
                outputLevel: { type: 'string', enum: ['summary', 'preview', 'excerpts', 'full'], description: 'Output detail level' },
            },
            required: ['startId'],
        },
        handler: handleGetCommandChain,
    },
    {
        name: 'compare_executions',
        description: 'Compare output differences between two command executions.',
        inputSchema: {
            type: 'object',
            properties: {
                commandId1: { type: 'number', description: 'First command ID' },
                commandId2: { type: 'number', description: 'Second command ID' },
            },
            required: ['commandId1', 'commandId2'],
        },
        handler: handleCompareExecutions,
    },
];
