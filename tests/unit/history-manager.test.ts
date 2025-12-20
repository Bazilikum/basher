import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryManager } from '../../src/services/history-manager.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('HistoryManager', () => {
  let testDir: string;
  let dbPath: string;
  let historyManager: HistoryManager;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `basher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test-history.db');
  });

  afterEach(() => {
    // Close database and clean up
    if (historyManager) {
      historyManager.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('creates database file', () => {
      historyManager = new HistoryManager(dbPath);
      expect(existsSync(dbPath)).toBe(true);
    });

    it('initializes with default options', () => {
      historyManager = new HistoryManager(dbPath);
      const stats = historyManager.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('saveCommand', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('saves a command and returns id', () => {
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/home/user/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1234,
        stdout: 'Test passed',
        stderr: '',
      });

      expect(id).toBeGreaterThan(0);
    });

    it('saves command with title', () => {
      const id = historyManager.saveCommand({
        command: 'npm test',
        title: 'Running Tests',
        cwd: '/home/user/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1234,
        stdout: 'Test passed',
        stderr: '',
      });

      const saved = historyManager.getCommandById(id);
      expect(saved?.title).toBe('Running Tests');
    });

    it('saves command with processId', () => {
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/home/user/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1234,
        stdout: 'Test passed',
        stderr: '',
        processId: 12345,
      });

      const saved = historyManager.getCommandById(id);
      expect(saved?.processId).toBe(12345);
    });

    it('saves command with status', () => {
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/home/user/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1234,
        stdout: 'Test passed',
        stderr: '',
        status: 'running',
      });

      const saved = historyManager.getCommandById(id);
      expect(saved?.status).toBe('running');
    });
  });

  describe('getCommandById', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('retrieves saved command', () => {
      const timestamp = new Date().toISOString();
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/home/user/project',
        timestamp,
        exitCode: 0,
        duration: 1234,
        stdout: 'Test passed',
        stderr: 'Warning',
      });

      const retrieved = historyManager.getCommandById(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.command).toBe('npm test');
      expect(retrieved?.cwd).toBe('/home/user/project');
      expect(retrieved?.exitCode).toBe(0);
      expect(retrieved?.duration).toBe(1234);
      expect(retrieved?.stdout).toBe('Test passed');
      expect(retrieved?.stderr).toBe('Warning');
    });

    it('returns null for non-existent id', () => {
      const result = historyManager.getCommandById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getCommandByProcessId', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('retrieves command by processId', () => {
      const processId = 54321;
      historyManager.saveCommand({
        command: 'npm test',
        cwd: '/home/user/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1234,
        stdout: 'Test passed',
        stderr: '',
        processId,
      });

      const retrieved = historyManager.getCommandByProcessId(processId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.command).toBe('npm test');
      expect(retrieved?.processId).toBe(processId);
    });

    it('returns most recent command for duplicate processId', () => {
      const processId = 11111;

      historyManager.saveCommand({
        command: 'first command',
        cwd: '/home/user/project',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
        processId,
      });

      historyManager.saveCommand({
        command: 'second command',
        cwd: '/home/user/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 200,
        stdout: '',
        stderr: '',
        processId,
      });

      const retrieved = historyManager.getCommandByProcessId(processId);
      expect(retrieved?.command).toBe('second command');
    });

    it('returns null for non-existent processId', () => {
      const result = historyManager.getCommandByProcessId(99999);
      expect(result).toBeNull();
    });
  });

  describe('getRecentHistory', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('returns empty array when no commands', () => {
      const history = historyManager.getRecentHistory();
      expect(history).toEqual([]);
    });

    it('returns commands in descending order by timestamp', () => {
      historyManager.saveCommand({
        command: 'first',
        cwd: '/tmp',
        timestamp: new Date(Date.now() - 2000).toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'second',
        cwd: '/tmp',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'third',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      const history = historyManager.getRecentHistory(10);
      expect(history.length).toBe(3);
      expect(history[0].command).toBe('third');
      expect(history[1].command).toBe('second');
      expect(history[2].command).toBe('first');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        historyManager.saveCommand({
          command: `command ${i}`,
          cwd: '/tmp',
          timestamp: new Date().toISOString(),
          exitCode: 0,
          duration: 100,
          stdout: '',
          stderr: '',
        });
      }

      const history = historyManager.getRecentHistory(5);
      expect(history.length).toBe(5);
    });

    it('excludes running commands by default', () => {
      historyManager.saveCommand({
        command: 'completed',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
        status: 'completed',
      });

      historyManager.saveCommand({
        command: 'running',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 0,
        stdout: '',
        stderr: '',
        status: 'running',
      });

      const history = historyManager.getRecentHistory(10, false);
      expect(history.length).toBe(1);
      expect(history[0].command).toBe('completed');
    });

    it('includes running commands when requested', () => {
      historyManager.saveCommand({
        command: 'completed',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
        status: 'completed',
      });

      historyManager.saveCommand({
        command: 'running',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 0,
        stdout: '',
        stderr: '',
        status: 'running',
      });

      const history = historyManager.getRecentHistory(10, true);
      expect(history.length).toBe(2);
    });
  });

  describe('searchHistory', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('finds commands by command text', () => {
      historyManager.saveCommand({
        command: 'npm install express',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: 'added 50 packages',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'git commit -m "test"',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      const results = historyManager.searchHistory('npm');
      expect(results.length).toBe(1);
      expect(results[0].command).toBe('npm install express');
    });

    it('finds commands by stdout content', () => {
      historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 1,
        duration: 100,
        stdout: 'Test failed: assertion error',
        stderr: '',
      });

      const results = historyManager.searchHistory('assertion');
      expect(results.length).toBe(1);
      expect(results[0].stdout).toContain('assertion error');
    });

    it('finds commands by stderr content', () => {
      historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 1,
        duration: 100,
        stdout: '',
        stderr: 'Error: Module not found',
      });

      const results = historyManager.searchHistory('Module not found');
      expect(results.length).toBe(1);
      expect(results[0].stderr).toContain('Module not found');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        historyManager.saveCommand({
          command: `npm run test-${i}`,
          cwd: '/tmp',
          timestamp: new Date().toISOString(),
          exitCode: 0,
          duration: 100,
          stdout: '',
          stderr: '',
        });
      }

      const results = historyManager.searchHistory('npm', 3);
      expect(results.length).toBe(3);
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('updates command status', () => {
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 0,
        stdout: '',
        stderr: '',
        status: 'running',
      });

      // Verify initial state
      const initial = historyManager.getCommandById(id);
      expect(initial?.status).toBe('running');

      // Update via the method
      historyManager.updateStatus(id, 'completed', 0, 5000, 'Done', '');

      // Re-fetch to verify update
      const updated = historyManager.getCommandById(id);
      expect(updated?.status).toBe('completed');
      expect(updated?.exitCode).toBe(0);
      expect(updated?.duration).toBe(5000);
      expect(updated?.stdout).toBe('Done');
    });

    it('updates only provided fields using COALESCE', () => {
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 1,
        duration: 100,
        stdout: 'original output',
        stderr: 'original error',
        status: 'running',
      });

      // Update only status and exitCode, leave others unchanged
      historyManager.updateStatus(id, 'completed', 0);

      const updated = historyManager.getCommandById(id);
      expect(updated?.status).toBe('completed');
      expect(updated?.exitCode).toBe(0);
      // These should remain unchanged due to COALESCE
      expect(updated?.duration).toBe(100);
      expect(updated?.stdout).toBe('original output');
      expect(updated?.stderr).toBe('original error');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('returns correct statistics', () => {
      historyManager.saveCommand({
        command: 'success1',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1000,
        stdout: '',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'success2',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 2000,
        stdout: '',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'failed',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 1,
        duration: 500,
        stdout: '',
        stderr: '',
      });

      const stats = historyManager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.failures).toBe(1);
      expect(stats.avgDuration).toBeCloseTo(1166.67, 0);
    });
  });

  describe('clearHistory', () => {
    beforeEach(() => {
      historyManager = new HistoryManager(dbPath);
    });

    it('removes all commands', () => {
      historyManager.saveCommand({
        command: 'test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      expect(historyManager.getStats().total).toBe(1);

      historyManager.clearHistory();

      expect(historyManager.getStats().total).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('removes old entries based on maxAgeMs', () => {
      const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString();
      const now = new Date().toISOString();

      // Create manager with 30 minute max age
      historyManager = new HistoryManager(dbPath, {
        maxAgeMs: 30 * 60 * 1000, // 30 minutes
      });

      historyManager.saveCommand({
        command: 'old command',
        cwd: '/tmp',
        timestamp: oneHourAgo,
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'new command',
        cwd: '/tmp',
        timestamp: now,
        exitCode: 0,
        duration: 100,
        stdout: '',
        stderr: '',
      });

      // Cleanup happens automatically on save, but let's call it again
      (historyManager as any).cleanup();

      const history = historyManager.getRecentHistory();
      expect(history.length).toBe(1);
      expect(history[0].command).toBe('new command');
    });

    it('keeps only maxEntries most recent', () => {
      historyManager = new HistoryManager(dbPath, {
        maxEntries: 3,
      });

      for (let i = 0; i < 5; i++) {
        historyManager.saveCommand({
          command: `command ${i}`,
          cwd: '/tmp',
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          exitCode: 0,
          duration: 100,
          stdout: '',
          stderr: '',
        });
      }

      const history = historyManager.getRecentHistory();
      expect(history.length).toBe(3);
      // Should have the 3 most recent
      expect(history.map(h => h.command)).toContain('command 4');
      expect(history.map(h => h.command)).toContain('command 3');
      expect(history.map(h => h.command)).toContain('command 2');
    });
  });
});
