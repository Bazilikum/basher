/**
 * Process manager for tracking and controlling running commands
 * Supports persistence across restarts via state file
 */

import { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger.config.js';

interface RunningProcess {
  pid: number;
  command: string;
  title: string;
  startTime: number;
  process: ChildProcess | null; // null for orphaned processes
  stdout: string;
  stderr: string;
  isOrphan?: boolean; // true if adopted from previous instance
  cwd?: string;
}

interface PersistedProcessState {
  processId: number;
  pid: number;
  command: string;
  title: string;
  startTime: number;
  cwd?: string;
}

interface ProcessStateFile {
  instancePid: number;
  processes: PersistedProcessState[];
  updatedAt: string;
}

class ProcessManager {
  private processes: Map<number, RunningProcess> = new Map();
  private lastTimestamp = 0;
  private subMillisCounter = 0;
  private stateFilePath: string | null = null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  /**
   * Generate a globally unique processId
   * Format: (timestamp % 10M) * 100000 + (PID % 100000) + counter
   * This ensures uniqueness across multiple instances:
   * - Different PIDs = different IDs (even at same millisecond)
   * - Different timestamps = different IDs (same instance)
   * - Counter handles multiple commands in same ms from same instance
   */
  private generateUniqueProcessId(): number {
    const now = Date.now();
    if (now === this.lastTimestamp) {
      this.subMillisCounter = (this.subMillisCounter + 1) % 100;
    } else {
      this.lastTimestamp = now;
      this.subMillisCounter = 0;
    }
    // Combine timestamp, PID, and counter for global uniqueness
    // timestamp portion: ~2.7 hours before wrap (10M ms)
    // PID portion: handles up to 1000 different PIDs
    // counter: handles up to 100 commands per ms
    const timestampPart = (now % 10000000) * 100000;
    const pidPart = (process.pid % 1000) * 100;
    const counterPart = this.subMillisCounter;
    return timestampPart + pidPart + counterPart;
  }

  /**
   * Initialize process manager with state file path
   */
  initialize(basherDir: string): void {
    this.stateFilePath = path.join(basherDir, 'running-processes.json');
    this.adoptOrphanedProcesses();
  }

  /**
   * Check for orphaned processes from previous instance and adopt them
   */
  private adoptOrphanedProcesses(): void {
    if (!this.stateFilePath || !fs.existsSync(this.stateFilePath)) {
      return;
    }

    try {
      const stateContent = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state: ProcessStateFile = JSON.parse(stateContent);

      // Check if the previous instance is still running
      if (this.isProcessAlive(state.instancePid)) {
        logger.info({ instancePid: state.instancePid }, 'Previous instance still running, not adopting processes');
        return;
      }

      logger.info({ previousPid: state.instancePid, processCount: state.processes.length }, 'Adopting orphaned processes');

      for (const proc of state.processes) {
        if (this.isProcessAlive(proc.pid)) {
          // Adopt this process - keep its original processId since the old instance is dead
          // (no collision risk with dead instance's IDs)
          this.processes.set(proc.processId, {
            pid: proc.pid,
            command: proc.command,
            title: proc.title,
            startTime: proc.startTime,
            process: null,
            stdout: '[Output from before restart is not available]\n',
            stderr: '',
            isOrphan: true,
            cwd: proc.cwd
          });

          logger.info({ processId: proc.processId, pid: proc.pid, command: proc.command }, 'Adopted orphaned process');

          // Start monitoring this orphaned process
          this.monitorOrphanedProcess(proc.processId, proc.pid);
        } else {
          logger.info({ processId: proc.processId, pid: proc.pid }, 'Orphaned process no longer running');
        }
      }

      // Update state file with current instance
      this.saveState();
    } catch (error) {
      logger.error({ error }, 'Failed to adopt orphaned processes');
    }
  }

  /**
   * Check if a process is alive by PID
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without affecting it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Monitor an orphaned process for completion
   */
  private monitorOrphanedProcess(processId: number, pid: number): void {
    const checkInterval = setInterval(() => {
      if (!this.isProcessAlive(pid)) {
        logger.info({ processId, pid }, 'Orphaned process completed');
        this.unregister(processId);
        clearInterval(checkInterval);
      }
    }, 1000); // Check every second
  }

  /**
   * Save current process state to file
   */
  private saveState(): void {
    if (!this.stateFilePath) return;

    // Debounce saves to avoid excessive I/O
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      try {
        const state: ProcessStateFile = {
          instancePid: process.pid,
          processes: Array.from(this.processes.entries()).map(([processId, proc]) => ({
            processId,
            pid: proc.pid,
            command: proc.command,
            title: proc.title,
            startTime: proc.startTime,
            cwd: proc.cwd
          })),
          updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(this.stateFilePath!, JSON.stringify(state, null, 2));
        logger.debug({ processCount: state.processes.length }, 'Process state saved');
      } catch (error) {
        logger.error({ error }, 'Failed to save process state');
      }
    }, 100);
  }

  /**
   * Clean up state file on shutdown
   */
  cleanup(): void {
    if (this.stateFilePath && fs.existsSync(this.stateFilePath)) {
      try {
        // Only remove if no processes are running
        if (this.processes.size === 0) {
          fs.unlinkSync(this.stateFilePath);
          logger.info('Process state file cleaned up');
        } else {
          // Update state for potential adoption
          this.saveState();
        }
      } catch (error) {
        logger.error({ error }, 'Failed to cleanup process state file');
      }
    }
  }

  /**
   * Register a new running process
   */
  register(command: string, childProcess: ChildProcess, title?: string, cwd?: string): number {
    const processId = this.generateUniqueProcessId();

    if (!childProcess.pid) {
      logger.warn({ command }, 'Process started without PID');
      return processId;
    }

    this.processes.set(processId, {
      pid: childProcess.pid,
      command,
      title: title || command,
      startTime: Date.now(),
      process: childProcess,
      stdout: '',
      stderr: '',
      cwd
    });

    logger.info({ processId, pid: childProcess.pid, command, title }, 'Process registered');

    // Save state for potential adoption
    this.saveState();

    // Note: We intentionally do NOT unregister on 'exit' event here.
    // The 'exit' event fires when the process terminates, but BEFORE the 'close' event
    // which fires after all stdio streams are closed and the result is saved to history.
    // Unregistering here causes a race condition where the VS Code extension polls
    // for process output, gets "not found", tries to fetch from history, but the
    // history entry hasn't been saved yet (resulting in "terminated error -1").
    //
    // Instead, unregistration happens via the 'close' event handler in command-executor.ts
    // through the explicit unregister() call after the promise resolves.

    return processId;
  }

  /**
   * Unregister a process (called after command is saved to history)
   * This should be called AFTER the command result is saved to ensure
   * the VS Code extension can find the command in history when it polls.
   */
  public unregister(processId: number): void {
    const proc = this.processes.get(processId);
    if (proc) {
      logger.info({ processId, pid: proc.pid, command: proc.command }, 'Process unregistered');
      this.processes.delete(processId);
      // Update state file
      this.saveState();
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
      logger.info({ processId, pid: proc.pid, command: proc.command, isOrphan: proc.isOrphan }, 'Killing process');

      if (proc.isOrphan || !proc.process) {
        // For orphaned processes, send signal directly via process.kill
        process.kill(proc.pid, 'SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this.processes.has(processId) && this.isProcessAlive(proc.pid)) {
            logger.warn({ processId, pid: proc.pid }, 'Force killing orphaned process with SIGKILL');
            try {
              process.kill(proc.pid, 'SIGKILL');
            } catch {
              // Process may have already exited
            }
          }
          this.unregister(processId);
        }, 5000);
      } else {
        // For owned processes, use the ChildProcess.kill method
        proc.process.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this.processes.has(processId)) {
            logger.warn({ processId, pid: proc.pid }, 'Force killing process with SIGKILL');
            proc.process?.kill('SIGKILL');
          }
        }, 5000);
      }

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
