/**
 * Admin Tools for Basher MCP Server
 *
 * These tools handle administrative operations like:
 * - Getting version information
 * - Getting server information
 * - Clearing command history
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../../services/logger.config.js';
import { createToolResult } from '../index.js';
// Read package.json for version info
const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
/**
 * Get version tool handler
 */
async function handleGetVersion(_args, _context) {
    logger.info('Getting Basher version');
    return createToolResult({
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
    });
}
/**
 * Get server info tool handler
 */
async function handleGetServerInfo(_args, context) {
    logger.info('Getting server info');
    const port = context.webServer?.getPort() || null;
    const webUrl = port ? `http://localhost:${port}` : null;
    return createToolResult({
        version: packageJson.version,
        webUI: webUrl ? {
            url: webUrl,
            port: port,
            status: 'running',
        } : {
            status: 'not running',
        },
        projectDirectory: process.cwd(),
        pid: process.pid,
        uptime: `${Math.round(process.uptime())}s`,
    });
}
/**
 * Clear history tool handler
 */
async function handleClearHistory(_args, context) {
    logger.info('Clearing command history');
    try {
        context.historyManager.clearHistory();
        // Broadcast to web UI clients
        if (context.webServer) {
            context.webServer.broadcast('history_cleared', {});
        }
        return createToolResult({
            success: true,
            message: 'Command history cleared successfully. All stored command executions have been permanently deleted.',
        });
    }
    catch (error) {
        logger.error({ error }, 'Failed to clear history');
        return createToolResult({
            success: false,
            error: error.message || 'Failed to clear history',
        });
    }
}
/**
 * Admin tool definitions
 */
export const adminTools = [
    {
        name: 'get_version',
        description: 'Get Basher version info.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: handleGetVersion,
    },
    {
        name: 'get_server_info',
        description: 'Get server info: Web UI URL, project directory, uptime.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: handleGetServerInfo,
    },
    {
        name: 'clear_history',
        description: 'Clear all command history. Permanent, cannot be undone.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: handleClearHistory,
    },
];
