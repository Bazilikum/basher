/**
 * Session Tools for Basher MCP Server
 *
 * These tools manage command sessions for grouping related commands:
 * - Starting sessions
 * - Ending sessions
 * - Getting session details
 * - Listing sessions
 */
import { z } from 'zod';
import logger from '../../services/logger.config.js';
import { createToolResult } from '../index.js';
// Validation schemas
const startSessionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});
const endSessionSchema = z.object({
    status: z.enum(['completed', 'abandoned']).optional().default('completed'),
});
const getSessionSchema = z.object({
    name: z.string().optional(),
    id: z.number().optional(),
});
const listSessionsSchema = z.object({
    status: z.enum(['active', 'completed', 'abandoned']).optional(),
    limit: z.number().positive().optional().default(50),
});
/**
 * Start session handler
 */
async function handleStartSession(args, context) {
    const params = startSessionSchema.parse(args);
    logger.info({ sessionName: params.name }, 'Starting command session');
    const session = context.sessionManager.startSession(params.name, params.description);
    return createToolResult({
        success: true,
        message: `Session '${params.name}' started`,
        session,
    });
}
/**
 * End session handler
 */
async function handleEndSession(args, context) {
    const params = endSessionSchema.parse(args);
    logger.info({ status: params.status }, 'Ending command session');
    const session = context.sessionManager.endSession(params.status);
    if (!session) {
        return createToolResult({
            success: false,
            message: 'No active session to end',
        });
    }
    return createToolResult({
        success: true,
        message: `Session '${session.name}' ended with status: ${params.status}`,
        session,
    });
}
/**
 * Get session handler
 */
async function handleGetSession(args, context) {
    const params = getSessionSchema.parse(args);
    if (!params.name && !params.id) {
        // Return active session if no params
        const active = context.sessionManager.getActiveSession();
        if (!active) {
            return createToolResult({
                success: false,
                message: 'No active session. Provide name or id to look up a specific session.',
            });
        }
        const commandIds = context.sessionManager.getSessionCommandIds(active.id);
        return createToolResult({
            session: active,
            commandIds,
        });
    }
    const session = params.id
        ? context.sessionManager.getSession(params.id)
        : context.sessionManager.getSessionByName(params.name);
    if (!session) {
        return createToolResult({
            success: false,
            message: 'Session not found',
        });
    }
    const commandIds = context.sessionManager.getSessionCommandIds(session.id);
    return createToolResult({
        session,
        commandIds,
    });
}
/**
 * List sessions handler
 */
async function handleListSessions(args, context) {
    const params = listSessionsSchema.parse(args);
    logger.info({ status: params.status, limit: params.limit }, 'Listing sessions');
    const sessions = context.sessionManager.listSessions(params.status, params.limit);
    return createToolResult({
        count: sessions.length,
        sessions,
    });
}
/**
 * Session tool definitions
 */
export const sessionTools = [
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
        handler: handleStartSession,
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
        handler: handleEndSession,
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
        handler: handleGetSession,
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
        handler: handleListSessions,
    },
];
