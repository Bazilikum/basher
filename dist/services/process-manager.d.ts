/**
 * Process manager for tracking and controlling running commands
 */
import { ChildProcess } from 'child_process';
interface RunningProcess {
    pid: number;
    command: string;
    title: string;
    startTime: number;
    process: ChildProcess;
    stdout: string;
    stderr: string;
}
declare class ProcessManager {
    private processes;
    private processIdCounter;
    /**
     * Register a new running process
     */
    register(command: string, process: ChildProcess, title?: string): number;
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
