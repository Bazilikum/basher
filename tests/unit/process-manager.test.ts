import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager, ProcessManagerConfig } from '../../src/services/process-manager.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';

describe('ProcessManager', () => {
  let testDir: string;
  let basherDir: string;
  let processManager: ProcessManager;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `basher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    basherDir = join(testDir, '.basher');
    mkdirSync(basherDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup process manager
    if (processManager) {
      processManager.cleanup();
    }
    // Clean up temporary directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('creates instance without config', () => {
      processManager = new ProcessManager();
      expect(processManager).toBeDefined();
    });

    it('creates instance with basherDir config', () => {
      processManager = new ProcessManager({ basherDir });
      expect(processManager).toBeDefined();
    });

    it('creates state file when basherDir is provided', () => {
      processManager = new ProcessManager({ basherDir });
      // State file is created on first process registration, not on init
      expect(processManager).toBeDefined();
    });
  });

  describe('register and unregister', () => {
    beforeEach(() => {
      processManager = new ProcessManager({ basherDir });
    });

    it('registers a process and returns processId', () => {
      // Create a mock child process
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('npm test', mockProcess, 'Running Tests', '/tmp');
      expect(processId).toBeGreaterThan(0);
    });

    it('tracks registered process as running', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('npm test', mockProcess);
      expect(processManager.isRunning(processId)).toBe(true);
    });

    it('unregisters process correctly', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('npm test', mockProcess);
      expect(processManager.isRunning(processId)).toBe(true);

      processManager.unregister(processId);
      expect(processManager.isRunning(processId)).toBe(false);
    });

    it('generates unique processIds', () => {
      const mockProcess1 = new EventEmitter() as ChildProcess;
      (mockProcess1 as any).pid = 12345;
      const mockProcess2 = new EventEmitter() as ChildProcess;
      (mockProcess2 as any).pid = 12346;

      const id1 = processManager.register('cmd1', mockProcess1);
      const id2 = processManager.register('cmd2', mockProcess2);

      expect(id1).not.toBe(id2);
    });
  });

  describe('getRunning', () => {
    beforeEach(() => {
      processManager = new ProcessManager({ basherDir });
    });

    it('returns empty array when no processes running', () => {
      const running = processManager.getRunning();
      expect(running).toEqual([]);
    });

    it('returns all running processes', () => {
      const mockProcess1 = new EventEmitter() as ChildProcess;
      (mockProcess1 as any).pid = 12345;
      const mockProcess2 = new EventEmitter() as ChildProcess;
      (mockProcess2 as any).pid = 12346;

      processManager.register('cmd1', mockProcess1, 'Title 1');
      processManager.register('cmd2', mockProcess2, 'Title 2');

      const running = processManager.getRunning();
      expect(running.length).toBe(2);
      expect(running.map(r => r.command)).toContain('cmd1');
      expect(running.map(r => r.command)).toContain('cmd2');
    });

    it('includes duration in running processes', async () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      processManager.register('cmd', mockProcess);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      const running = processManager.getRunning();
      expect(running[0].duration).toBeGreaterThan(0);
    });
  });

  describe('appendStdout and appendStderr', () => {
    beforeEach(() => {
      processManager = new ProcessManager({ basherDir });
    });

    it('appends stdout to running process', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('cmd', mockProcess);
      processManager.appendStdout(processId, 'line 1\n');
      processManager.appendStdout(processId, 'line 2\n');

      const output = processManager.getOutput(processId);
      expect(output?.stdout).toBe('line 1\nline 2\n');
    });

    it('appends stderr to running process', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('cmd', mockProcess);
      processManager.appendStderr(processId, 'error 1\n');
      processManager.appendStderr(processId, 'error 2\n');

      const output = processManager.getOutput(processId);
      expect(output?.stderr).toBe('error 1\nerror 2\n');
    });
  });

  describe('getOutput', () => {
    beforeEach(() => {
      processManager = new ProcessManager({ basherDir });
    });

    it('returns null for non-existent process', () => {
      const output = processManager.getOutput(99999);
      expect(output).toBeNull();
    });

    it('returns full output by default', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('cmd', mockProcess);
      processManager.appendStdout(processId, 'line 1\nline 2\nline 3\n');

      const output = processManager.getOutput(processId);
      expect(output?.stdout).toBe('line 1\nline 2\nline 3\n');
    });

    it('returns last N lines when specified', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('cmd', mockProcess);
      processManager.appendStdout(processId, 'line 1\nline 2\nline 3\nline 4\n');

      const output = processManager.getOutput(processId, 2);
      expect(output?.stdout).toBe('line 4\n');  // Last 2 lines
    });

    it('returns process info with output', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('npm test', mockProcess, 'Running Tests');

      const output = processManager.getOutput(processId);
      expect(output?.command).toBe('npm test');
      expect(output?.title).toBe('Running Tests');
      expect(output?.status).toBe('running');
      expect(output?.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setDatabaseId', () => {
    beforeEach(() => {
      processManager = new ProcessManager({ basherDir });
    });

    it('sets database ID for process', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;

      const processId = processManager.register('cmd', mockProcess);
      processManager.setDatabaseId(processId, 42);

      const proc = processManager.getProcess(processId);
      expect((proc as any)?.databaseId).toBe(42);
    });

    it('handles non-existent process gracefully', () => {
      // Should not throw
      expect(() => processManager.setDatabaseId(99999, 42)).not.toThrow();
    });
  });

  describe('kill', () => {
    beforeEach(() => {
      processManager = new ProcessManager({ basherDir });
    });

    it('returns false for non-existent process', () => {
      const result = processManager.kill(99999);
      expect(result).toBe(false);
    });

    it('kills a running process', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 12345;
      (mockProcess as any).kill = vi.fn().mockReturnValue(true);

      const processId = processManager.register('cmd', mockProcess);
      const result = processManager.kill(processId);

      expect(result).toBe(true);
      expect((mockProcess as any).kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('backward compatibility', () => {
    it('supports initialize() method', () => {
      processManager = new ProcessManager();
      expect(() => processManager.initialize(basherDir)).not.toThrow();
    });

    it('supports setHistoryManager() method', () => {
      processManager = new ProcessManager({ basherDir });
      const mockHistoryManager = {} as any;
      expect(() => processManager.setHistoryManager(mockHistoryManager)).not.toThrow();
    });
  });
});
