/**
 * Command execution service with real-time output capture and logging
 */
import type { CommandResult } from '../types/index.js';
/**
 * Callbacks for command execution events (used for multi-instance notification)
 */
export interface CommandExecutionCallbacks {
    /** Called when command starts with processId */
    onStart?: (processId: number, command: string, title: string, cwd: string) => void;
    /** Called when stdout data is received */
    onStdout?: (processId: number, data: string) => void;
    /** Called when stderr data is received */
    onStderr?: (processId: number, data: string) => void;
}
/**
 * Execute a shell command with enhanced logging and timeout support
 * Returns both the command result and the process ID for tracking
 * @param callbacks Optional callbacks for real-time event notifications
 */
export declare function executeCommand(command: string, cwd?: string, stdin?: string, timeout?: number, title?: string, callbacks?: CommandExecutionCallbacks): Promise<CommandResult & {
    processId: number;
}>;
