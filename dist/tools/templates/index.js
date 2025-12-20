/**
 * Template Tools for Basher MCP Server
 *
 * These tools manage reusable command templates:
 * - Saving command templates
 * - Listing templates
 * - Deleting templates
 *
 * Note: run_template is in execute/index.ts since it involves command execution
 */
import { z } from 'zod';
import logger from '../../services/logger.config.js';
import { createToolResult } from '../index.js';
// Validation schemas
const saveTemplateSchema = z.object({
    name: z.string().min(1),
    command: z.string().min(1),
    title: z.string().optional(),
    cwd: z.string().optional(),
    timeout: z.number().positive().optional(),
    parseAs: z.enum(['jest', 'pytest', 'eslint', 'tsc', 'json', 'auto']).optional(),
    waitFor: z.string().optional(),
    waitTimeout: z.number().positive().optional(),
    retry: z.object({
        attempts: z.number(),
        backoff: z.enum(['none', 'linear', 'exponential']).optional(),
        delayMs: z.number().optional(),
    }).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
});
const listTemplatesSchema = z.object({
    tag: z.string().optional(),
});
const deleteTemplateSchema = z.object({
    name: z.string().min(1),
});
/**
 * Save template handler
 */
async function handleSaveTemplate(args, context) {
    const params = saveTemplateSchema.parse(args);
    logger.info({ templateName: params.name }, 'Saving command template');
    const template = context.templateManager.save(params);
    return createToolResult({
        success: true,
        message: `Template '${params.name}' saved successfully`,
        template,
    });
}
/**
 * List templates handler
 */
async function handleListTemplates(args, context) {
    const params = listTemplatesSchema.parse(args);
    logger.info({ tag: params.tag }, 'Listing command templates');
    const templates = context.templateManager.list(params.tag);
    return createToolResult({
        count: templates.length,
        templates: templates.map(t => ({
            name: t.name,
            command: t.command,
            description: t.description,
            tags: t.tags,
            parseAs: t.parseAs,
            waitFor: t.waitFor,
        })),
    });
}
/**
 * Delete template handler
 */
async function handleDeleteTemplate(args, context) {
    const params = deleteTemplateSchema.parse(args);
    logger.info({ templateName: params.name }, 'Deleting command template');
    const deleted = context.templateManager.delete(params.name);
    return createToolResult({
        success: deleted,
        message: deleted
            ? `Template '${params.name}' deleted successfully`
            : `Template '${params.name}' not found`,
    });
}
/**
 * Template tool definitions
 */
export const templateTools = [
    {
        name: 'save_template',
        description: 'Save a reusable command template. Templates store command configurations for quick re-execution.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Unique template name (e.g., "test", "build", "lint")' },
                command: { type: 'string', description: 'Shell command to execute' },
                title: { type: 'string', description: 'Display title for the command' },
                cwd: { type: 'string', description: 'Working directory' },
                timeout: { type: 'number', description: 'Timeout in ms' },
                parseAs: { type: 'string', enum: ['jest', 'pytest', 'eslint', 'tsc', 'json', 'auto'], description: 'Output parser' },
                waitFor: { type: 'string', description: 'Pattern to wait for' },
                waitTimeout: { type: 'number', description: 'Wait timeout in ms' },
                retry: { type: 'object', description: 'Retry configuration' },
                description: { type: 'string', description: 'Template description' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organization' },
            },
            required: ['name', 'command'],
        },
        handler: handleSaveTemplate,
    },
    {
        name: 'list_templates',
        description: 'List all saved command templates, optionally filtered by tag.',
        inputSchema: {
            type: 'object',
            properties: {
                tag: { type: 'string', description: 'Filter by tag (optional)' },
            },
        },
        handler: handleListTemplates,
    },
    {
        name: 'delete_template',
        description: 'Delete a saved command template.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Template name to delete' },
            },
            required: ['name'],
        },
        handler: handleDeleteTemplate,
    },
];
