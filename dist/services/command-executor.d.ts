/**
 * Command execution service with real-time output capture and logging
 */
import type { CommandResult } from '../types/index.js';
/**
 * Execute a shell command with enhanced logging and timeout support
 * Returns both the command result and the process ID for tracking
 */
export declare function executeCommand(command: string, cwd?: string, stdin?: string, timeout?: number, // 5 minutes default
title?: string): Promise<CommandResult & {
    processId: number;
}>;
