/**
 * Tool Registry for Basher MCP Server
 *
 * This module provides a centralized registry for all MCP tool definitions
 * and handlers, enabling cleaner separation of concerns and easier testing.
 */

import type { HistoryManager } from '../services/history-manager.js';
import type { CommandTemplateManager } from '../services/command-templates.js';
import type { CommandSessionManager } from '../services/command-sessions.js';
import type { WebServer } from '../services/web-server.js';

/**
 * Application context passed to all tool handlers
 */
export interface ToolContext {
  historyManager: HistoryManager;
  templateManager: CommandTemplateManager;
  sessionManager: CommandSessionManager;
  webServer: WebServer | null;
  basherDir: string;
  dbPath: string;
}

/**
 * Tool definition with metadata and handler
 */
export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Tool description for MCP */
  description: string;
  /** JSON schema for input validation */
  inputSchema: Record<string, unknown>;
  /** The handler function */
  handler: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

/**
 * MCP tool result content type
 */
export interface ToolResultContent {
  type: 'text';
  text: string;
}

/**
 * Standard MCP tool result format
 */
export interface ToolResult {
  content: ToolResultContent[];
}

/**
 * Create a standard tool result from data
 */
export function createToolResult(data: unknown): ToolResult {
  return {
    content: [{
      type: 'text',
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    }],
  };
}

/**
 * Create an error tool result
 */
export function createErrorResult(message: string, details?: unknown): ToolResult {
  const result: Record<string, unknown> = { error: message };
  if (details !== undefined) {
    result.details = details;
  }
  return createToolResult(result);
}

/**
 * Tool registry - maps tool names to their definitions
 */
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool definition
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions for ListToolsRequest
   */
  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.handler(args, context);
  }

  /**
   * Get number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Get all tool names
   */
  get names(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Export singleton registry
export const toolRegistry = new ToolRegistry();

// Import tool definitions from sub-modules
import { adminTools } from './admin/index.js';
import { whitelistTools } from './whitelist/index.js';
import { historyTools } from './history/index.js';
import { templateTools } from './templates/index.js';
import { sessionTools } from './sessions/index.js';
import { executeTools } from './execute/index.js';

// Re-export for direct access
export { adminTools } from './admin/index.js';
export { whitelistTools } from './whitelist/index.js';
export { historyTools } from './history/index.js';
export { templateTools } from './templates/index.js';
export { sessionTools } from './sessions/index.js';
export { executeTools } from './execute/index.js';

/**
 * Get all tool definitions (for ListToolsRequest)
 * Note: execute_command and run_template remain in index.ts
 * due to their complexity and tight integration with the main server
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return [
    ...adminTools,
    ...whitelistTools,
    ...historyTools,
    ...templateTools,
    ...sessionTools,
    ...executeTools,
  ];
}

/**
 * Initialize the tool registry with all defined tools
 */
export function initializeToolRegistry(): void {
  toolRegistry.registerAll(adminTools);
  toolRegistry.registerAll(whitelistTools);
  toolRegistry.registerAll(historyTools);
  toolRegistry.registerAll(templateTools);
  toolRegistry.registerAll(sessionTools);
  toolRegistry.registerAll(executeTools);
}
