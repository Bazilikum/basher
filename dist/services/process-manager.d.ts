/**
 * Process manager for tracking and controlling running commands
 * Supports persistence across restarts via state file
 */
import { ChildProcess } from 'child_process';
import type { HistoryManager } from './history-manager.js';
interface RunningProcess {
    pid: number;
    command: string;
    title: string;
    startTime: number;
    process: ChildProcess | null;
    stdout: string;
    stderr: string;
    isOrphan?: boolean;
    cwd?: string;
    databaseId?: number;
    lastFlushedStdoutLength: number;
    lastFlushedStderrLength: number;
}
declare class ProcessManager {
    private processes;
    private lastTimestamp;
    private subMillisCounter;
    private stateFilePath;
    private saveDebounceTimer;
    private historyManager;
    private flushInterval;
    private static readonly FLUSH_INTERVAL_MS;
    /**
     * Generate a globally unique processId
     * Format: (timestamp % 10M) * 100000 + (PID % 100000) + counter
     * This ensures uniqueness across multiple instances:
     * - Different PIDs = different IDs (even at same millisecond)
     * - Different timestamps = different IDs (same instance)
     * - Counter handles multiple commands in same ms from same instance
     */
    private generateUniqueProcessId;
    /**
     * Initialize process manager with state file path
     */
    initialize(basherDir: string): void;
    /**
     * Set the history manager for periodic output flushing to DB
     */
    setHistoryManager(historyManager: HistoryManager): void;
    /**
     * Start the periodic flush interval
     */
    private startFlushInterval;
    /**
     * Stop the periodic flush interval
     */
    private stopFlushInterval;
    /**
     * Flush accumulated output to the database for all running processes
     */
    private flushOutputToDb;
    /**
     * Set the database ID for a running process (called after DB insert)
     */
    setDatabaseId(processId: number, databaseId: number): void;
    /**
     * Check for orphaned processes from previous instance and adopt them
     */
    private adoptOrphanedProcesses;
    /**
     * Check if a process is alive by PID
     */
    private isProcessAlive;
    /**
     * Monitor an orphaned process for completion
     */
    private monitorOrphanedProcess;
    /**
     * Save current process state to file
     */
    private saveState;
    /**
     * Clean up state file and stop intervals on shutdown
     */
    cleanup(): void;
    /**
     * Register a new running process
     */
    register(command: string, childProcess: ChildProcess, title?: string, cwd?: string): number;
    /**
     * Unregister a process (called after command is saved to history)
     * This should be called AFTER the command result is saved to ensure
     * the VS Code extension can find the command in history when it polls.
     */
    unregister(processId: number): void;
    /**
     * Kill a running process
     */
    kill(processId: number): boolean;
    /**
     * Get all running processes
     */
    getRunning(): Array<{
        id: number;
        pid: number;
        command: string;
        title: string;
        duration: number;
    }>;
    /**
     * Check if a process is running
     */
    isRunning(processId: number): boolean;
    /**
     * Get process info
     */
    getProcess(processId: number): RunningProcess | undefined;
    /**
     * Append stdout output to a running process
     */
    appendStdout(processId: number, data: string): void;
    /**
     * Append stderr output to a running process
     */
    appendStderr(processId: number, data: string): void;
    /**
     * Get the last N lines of output from a running process
     */
    getOutput(processId: number, lines?: number): {
        processId: number;
        command: string;
        title: string;
        status: 'running' | 'not_found';
        stdout: string;
        stderr: string;
        duration: number;
    } | null;
}
export declare const processManager: ProcessManager;
export {};
