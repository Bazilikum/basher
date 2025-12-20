/**
 * Application context types for Basher
 *
 * This module defines the AppContext interface that provides
 * a centralized container for all service dependencies.
 * This enables cleaner dependency injection and easier testing.
 */
import type { HistoryManager } from '../services/history-manager.js';
import type { CommandTemplateManager } from '../services/command-templates.js';
import type { CommandSessionManager } from '../services/command-sessions.js';
import type { WebServer } from '../services/web-server.js';
/**
 * Application context containing all service instances
 *
 * This interface provides a single object that can be passed to
 * tool handlers and other components that need access to services.
 */
export interface AppContext {
    /** History manager for command persistence and search */
    historyManager: HistoryManager;
    /** Template manager for reusable command configurations */
    templateManager: CommandTemplateManager;
    /** Session manager for grouping related commands */
    sessionManager: CommandSessionManager;
    /** Web server instance (null if not started) */
    webServer: WebServer | null;
    /** Path to the .basher directory */
    basherDir: string;
    /** Path to the SQLite database */
    dbPath: string;
}
/**
 * Read-only view of the app context for handlers that shouldn't modify state
 */
export type ReadonlyAppContext = Readonly<AppContext>;
/**
 * Minimal context for tools that only need history access
 */
export interface HistoryContext {
    historyManager: HistoryManager;
}
/**
 * Context for tools that need to execute commands
 */
export interface ExecutionContext extends HistoryContext {
    webServer: WebServer | null;
    basherDir: string;
}
/**
 * Context for template-related tools
 */
export interface TemplateContext extends ExecutionContext {
    templateManager: CommandTemplateManager;
    sessionManager: CommandSessionManager;
}
/**
 * Tool handler function signature
 *
 * @typeParam TArgs - The validated arguments type for the tool
 * @typeParam TResult - The result type returned by the tool
 */
export type ToolHandler<TArgs, TResult> = (args: TArgs, context: AppContext) => Promise<TResult>;
/**
 * Tool definition with metadata and handler
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
    /** Unique tool name */
    name: string;
    /** Tool description for MCP */
    description: string;
    /** JSON schema for input validation */
    inputSchema: Record<string, unknown>;
    /** The handler function */
    handler: ToolHandler<TArgs, TResult>;
}
/**
 * Tool registry type
 */
export type ToolRegistry = Map<string, ToolDefinition>;
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
