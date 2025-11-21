/**
 * Process manager for tracking and controlling running commands
 */

import { ChildProcess } from 'child_process';
import logger from './logger.config.js';

interface RunningProcess {
  pid: number;
  command: string;
  title: string;
  startTime: number;
  process: ChildProcess;
  stdout: string;
  stderr: string;
}

class ProcessManager {
  private processes: Map<number, RunningProcess> = new Map();
  private processIdCounter = 0;

  /**
   * Register a new running process
   */
  register(command: string, process: ChildProcess, title?: string): number {
    const processId = ++this.processIdCounter;

    if (!process.pid) {
      logger.warn({ command }, 'Process started without PID');
      return processId;
    }

    this.processes.set(processId, {
      pid: process.pid,
      command,
      title: title || command,
      startTime: Date.now(),
      process,
      stdout: '',
      stderr: ''
    });

    logger.info({ processId, pid: process.pid, command, title }, 'Process registered');

    // Clean up when process exits
    process.on('exit', () => {
      this.unregister(processId);
    });

    return processId;
  }

  /**
   * Unregister a process (called when it exits)
   */
  private unregister(processId: number): void {
    const proc = this.processes.get(processId);
    if (proc) {
      logger.info({ processId, pid: proc.pid, command: proc.command }, 'Process unregistered');
      this.processes.delete(processId);
    }
  }

  /**
   * Kill a running process
   */
  kill(processId: number): boolean {
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
    } catch (error) {
      logger.error({ processId, error }, 'Failed to kill process');
      return false;
    }
  }

  /**
   * Get all running processes
   */
  getRunning(): Array<{ id: number; pid: number; command: string; title: string; duration: number }> {
    const now = Date.now();
    return Array.from(this.processes.entries()).map(([id, proc]) => ({
      id,
      pid: proc.pid,
      command: proc.command,
      title: proc.title,
      duration: now - proc.startTime
    }));
  }

  /**
   * Check if a process is running
   */
  isRunning(processId: number): boolean {
    return this.processes.has(processId);
  }

  /**
   * Get process info
   */
  getProcess(processId: number): RunningProcess | undefined {
    return this.processes.get(processId);
  }

  /**
   * Append stdout output to a running process
   */
  appendStdout(processId: number, data: string): void {
    const proc = this.processes.get(processId);
    if (proc) {
      proc.stdout += data;
    }
  }

  /**
   * Append stderr output to a running process
   */
  appendStderr(processId: number, data: string): void {
    const proc = this.processes.get(processId);
    if (proc) {
      proc.stderr += data;
    }
  }

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
  } | null {
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
        title: proc.title,
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
      title: proc.title,
      status: 'running',
      stdout: proc.stdout,
      stderr: proc.stderr,
      duration
    };
  }
}

// Singleton instance
export const processManager = new ProcessManager();
