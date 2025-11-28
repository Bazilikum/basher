/**
 * Process manager for tracking and controlling running commands
 * Supports persistence across restarts via state file
 */
import { ChildProcess } from 'child_process';
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
}
declare class ProcessManager {
    private processes;
    private processIdCounter;
    private stateFilePath;
    private saveDebounceTimer;
    /**
     * Initialize process manager with state file path
     */
    initialize(basherDir: string): void;
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
     * Clean up state file on shutdown
     */
    cleanup(): void;
    /**
     * Register a new running process
     */
    register(command: string, childProcess: ChildProcess, title?: string, cwd?: string): number;
    /**
     * Unregister a process (called when it exits)
     */
    private unregister;
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
