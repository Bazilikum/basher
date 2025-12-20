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
export declare function createToolResult(data: unknown): ToolResult;
/**
 * Create an error tool result
 */
export declare function createErrorResult(message: string, details?: unknown): ToolResult;
/**
 * Tool registry - maps tool names to their definitions
 */
declare class ToolRegistry {
    private tools;
    /**
     * Register a tool definition
     */
    register(tool: ToolDefinition): void;
    /**
     * Register multiple tools at once
     */
    registerAll(tools: ToolDefinition[]): void;
    /**
     * Get a tool by name
     */
    get(name: string): ToolDefinition | undefined;
    /**
     * Check if a tool exists
     */
    has(name: string): boolean;
    /**
     * Get all tool definitions for ListToolsRequest
     */
    listTools(): Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
    }>;
    /**
     * Execute a tool by name
     */
    execute(name: string, args: unknown, context: ToolContext): Promise<ToolResult>;
    /**
     * Get number of registered tools
     */
    get size(): number;
    /**
     * Get all tool names
     */
    get names(): string[];
}
export declare const toolRegistry: ToolRegistry;
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
export declare function getAllToolDefinitions(): ToolDefinition[];
/**
 * Initialize the tool registry with all defined tools
 */
export declare function initializeToolRegistry(): void;
