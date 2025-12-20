/**
 * Whitelist Tools for Basher MCP Server
 *
 * These tools manage the command whitelist for security:
 * - Adding commands to the whitelist
 * - Listing whitelisted commands
 * - Removing commands from the whitelist
 */
import { z } from 'zod';
import logger from '../../services/logger.config.js';
import { whitelistManager } from '../../services/whitelist-manager.js';
import { createToolResult } from '../index.js';
// Validation schemas
const whitelistCommandSchema = z.object({
    command_base: z.string().min(1, 'Command base cannot be empty'),
    description: z.string().optional(),
});
const removeWhitelistSchema = z.object({
    command_base: z.string().min(1, 'Command base cannot be empty'),
});
/**
 * Whitelist command handler
 */
async function handleWhitelistCommand(args, _context) {
    const params = whitelistCommandSchema.parse(args);
    const { command_base, description } = params;
    logger.info({ commandBase: command_base, description }, 'Whitelisting command');
    const result = whitelistManager.add(command_base, { description });
    return createToolResult({
        success: result.success,
        message: result.message,
        commandBase: command_base,
        whitelistPath: whitelistManager.getConfigPath(),
    });
}
/**
 * List whitelisted commands handler
 */
async function handleListWhitelistedCommands(_args, _context) {
    logger.info('Listing whitelisted commands');
    const whitelist = whitelistManager.list();
    return createToolResult({
        enabled: whitelist.enabled,
        count: whitelist.commands.length,
        commands: whitelist.commands,
        configPath: whitelistManager.getConfigPath(),
    });
}
/**
 * Remove whitelisted command handler
 */
async function handleRemoveWhitelistedCommand(args, _context) {
    const params = removeWhitelistSchema.parse(args);
    const { command_base } = params;
    logger.info({ commandBase: command_base }, 'Removing command from whitelist');
    const result = whitelistManager.remove(command_base);
    return createToolResult({
        success: result.success,
        message: result.message,
        commandBase: command_base,
    });
}
/**
 * Whitelist tool definitions
 */
export const whitelistTools = [
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
        handler: handleWhitelistCommand,
    },
    {
        name: 'list_whitelisted_commands',
        description: 'List all currently whitelisted commands that are allowed to execute.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: handleListWhitelistedCommands,
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
        handler: handleRemoveWhitelistedCommand,
    },
];
