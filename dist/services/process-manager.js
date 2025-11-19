/**
 * Process manager for tracking and controlling running commands
 */
import logger from './logger.config.js';
class ProcessManager {
    constructor() {
        this.processes = new Map();
        this.processIdCounter = 0;
    }
    /**
     * Register a new running process
     */
    register(command, process) {
        const processId = ++this.processIdCounter;
        if (!process.pid) {
            logger.warn({ command }, 'Process started without PID');
            return processId;
        }
        this.processes.set(processId, {
            pid: process.pid,
            command,
            startTime: Date.now(),
            process,
            stdout: '',
            stderr: ''
        });
        logger.info({ processId, pid: process.pid, command }, 'Process registered');
        // Clean up when process exits
        process.on('exit', () => {
            this.unregister(processId);
        });
        return processId;
    }
    /**
     * Unregister a process (called when it exits)
     */
    unregister(processId) {
        const proc = this.processes.get(processId);
        if (proc) {
            logger.info({ processId, pid: proc.pid, command: proc.command }, 'Process unregistered');
            this.processes.delete(processId);
        }
    }
    /**
     * Kill a running process
     */
    kill(processId) {
        const proc = this.processes.get(processId);
        if (!proc) {
            logger.warn({ processId }, 'Attempted to kill non-existent process');
            return false;
        }
        try {
            logger.info({ processId, pid: proc.pid, command: proc.command }, 'Killing process');
            // Try SIGTERM first (graceful)
            proc.process.kill('SIGTERM');
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (this.processes.has(processId)) {
                    logger.warn({ processId, pid: proc.pid }, 'Force killing process with SIGKILL');
                    proc.process.kill('SIGKILL');
                }
            }, 5000);
            return true;
        }
        catch (error) {
            logger.error({ processId, error }, 'Failed to kill process');
            return false;
        }
    }
    /**
     * Get all running processes
     */
    getRunning() {
        const now = Date.now();
        return Array.from(this.processes.entries()).map(([id, proc]) => ({
            id,
            pid: proc.pid,
            command: proc.command,
            duration: now - proc.startTime
        }));
    }
    /**
     * Check if a process is running
     */
    isRunning(processId) {
        return this.processes.has(processId);
    }
    /**
     * Get process info
     */
    getProcess(processId) {
        return this.processes.get(processId);
    }
    /**
     * Append stdout output to a running process
     */
    appendStdout(processId, data) {
        const proc = this.processes.get(processId);
        if (proc) {
            proc.stdout += data;
        }
    }
    /**
     * Append stderr output to a running process
     */
    appendStderr(processId, data) {
        const proc = this.processes.get(processId);
        if (proc) {
            proc.stderr += data;
        }
    }
    /**
     * Get the last N lines of output from a running process
     */
    getOutput(processId, lines) {
        const proc = this.processes.get(processId);
        if (!proc) {
            return null;
        }
        const now = Date.now();
        const duration = now - proc.startTime;
        // If lines is specified, get last N lines
        if (lines !== undefined && lines > 0) {
            const stdoutLines = proc.stdout.split('\n');
            const stderrLines = proc.stderr.split('\n');
            const stdout = stdoutLines.slice(-lines).join('\n');
            const stderr = stderrLines.slice(-lines).join('\n');
            return {
                processId,
                command: proc.command,
                status: 'running',
                stdout,
                stderr,
                duration
            };
        }
        // Return all output
        return {
            processId,
            command: proc.command,
            status: 'running',
            stdout: proc.stdout,
            stderr: proc.stderr,
            duration
        };
    }
}
// Singleton instance
export const processManager = new ProcessManager();
