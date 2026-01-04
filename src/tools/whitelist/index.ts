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
import type { ToolDefinition, ToolContext, ToolResult } from '../index.js';
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
async function handleWhitelistCommand(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
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

// Schema for list whitelisted commands
const listWhitelistedSchema = z.object({
  limit: z.number().positive().optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

/**
 * List whitelisted commands handler
 */
async function handleListWhitelistedCommands(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const params = listWhitelistedSchema.parse(args);
  logger.info({ limit: params.limit, offset: params.offset }, 'Listing whitelisted commands');

  const whitelist = whitelistManager.list(params.limit, params.offset);

  return createToolResult({
    enabled: whitelist.enabled,
    total: whitelist.total,
    offset: whitelist.offset,
    limit: whitelist.limit,
    count: whitelist.commands.length,
    commands: whitelist.commands,
    configPath: whitelistManager.getConfigPath(),
  });
}

/**
 * Remove whitelisted command handler
 */
async function handleRemoveWhitelistedCommand(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
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
export const whitelistTools: ToolDefinition[] = [
  {
    name: 'whitelist_command',
    description: 'Add command to whitelist. CRITICAL: Get user approval first!',
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
    description: 'List all whitelisted commands.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max commands to return (default: 20)' },
        offset: { type: 'number', description: 'Skip first N commands (default: 0)' },
      },
    },
    handler: handleListWhitelistedCommands,
  },
  {
    name: 'remove_whitelisted_command',
    description: 'Remove command from whitelist.',
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
