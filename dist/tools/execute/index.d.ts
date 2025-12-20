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
import type { ToolDefinition } from '../index.js';
/**
 * Execute tool definitions (process management tools)
 */
export declare const executeTools: ToolDefinition[];
