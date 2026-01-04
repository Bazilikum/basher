#!/usr/bin/env node
/**
 * Basher Light - Minimal MCP Server for Command Execution
 *
 * A lightweight version with only essential tools (~5 vs 27+):
 * - execute_command: Run commands with history tracking
 * - get_command: Look up command results by ID or processId
 * - get_running_commands: List currently running commands
 * - terminate_command: Stop a running command
 * - get_version: Get Basher version info
 *
 * Use this for reduced context overhead (~80% fewer tokens in tool definitions).
 */
import { HistoryManager } from './services/history-manager.js';
import { ProcessManager } from './services/process-manager.js';
import { WhitelistManager } from './services/whitelist-manager.js';
/**
 * Tool context for light version handlers
 * Services can be injected for testing, otherwise falls back to singletons
 */
export interface LightToolContext {
    historyManager: HistoryManager;
    version: string;
    processManager?: ProcessManager;
    whitelistManager?: WhitelistManager;
}
/**
 * Execute command handler
 */
export declare function handleExecuteCommand(args: unknown, context: LightToolContext): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
/**
 * Get command handler (by ID or processId)
 */
export declare function handleGetCommand(args: unknown, context: LightToolContext): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
/**
 * Get running commands handler
 */
export declare function handleGetRunningCommands(context?: LightToolContext): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
/**
 * Terminate command handler
 */
export declare function handleTerminateCommand(args: unknown, context?: LightToolContext): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
/**
 * Get version handler
 */
export declare function handleGetVersion(context: LightToolContext): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
