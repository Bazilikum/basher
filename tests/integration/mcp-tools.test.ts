/**
 * Integration tests for MCP tool execution flow
 * Tests the full path from tool handlers through services
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { HistoryManager } from '../../src/services/history-manager.js';
import { ProcessManager } from '../../src/services/process-manager.js';
import { CommandTemplateManager } from '../../src/services/command-templates.js';
import { CommandSessionManager } from '../../src/services/command-sessions.js';
import { historyTools } from '../../src/tools/history/index.js';
import { adminTools } from '../../src/tools/admin/index.js';
import { templateTools } from '../../src/tools/templates/index.js';
import { sessionTools } from '../../src/tools/sessions/index.js';
import type { ToolContext } from '../../src/tools/index.js';

describe('MCP Tools Integration', () => {
  let testDir: string;
  let basherDir: string;
  let dbPath: string;
  let historyManager: HistoryManager;
  let processManager: ProcessManager;
  let templateManager: CommandTemplateManager;
  let sessionManager: CommandSessionManager;
  let context: ToolContext;

  beforeEach(() => {
    // Create temporary directories
    testDir = join(tmpdir(), `basher-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    basherDir = join(testDir, '.basher');
    mkdirSync(basherDir, { recursive: true });
    dbPath = join(testDir, 'test-history.db');

    // Initialize all services
    historyManager = new HistoryManager(dbPath);
    processManager = new ProcessManager({ basherDir, historyManager });
    templateManager = new CommandTemplateManager(historyManager.getDatabase());
    sessionManager = new CommandSessionManager(historyManager.getDatabase());

    // Create tool context
    context = {
      historyManager,
      templateManager,
      sessionManager,
      webServer: null,
      basherDir,
      dbPath,
    };
  });

  afterEach(() => {
    // Cleanup
    processManager.cleanup();
    historyManager.close();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('History Tools Flow', () => {
    it('saves and retrieves commands through tools', async () => {
      // Save a command directly to history
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp/project',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1500,
        stdout: 'All tests passed',
        stderr: '',
        title: 'Running Tests',
      });

      // Use get_command_by_id tool
      const getByIdTool = historyTools.find(t => t.name === 'get_command_by_id');
      const result = await getByIdTool!.handler({ commandId: id }, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.command).toBe('npm test');
      expect(parsed.title).toBe('Running Tests');
      expect(parsed.exitCode).toBe(0);
    });

    it('searches history through search tool', async () => {
      // Save multiple commands
      historyManager.saveCommand({
        command: 'npm install express',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 5000,
        stdout: 'added 50 packages',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'npm install lodash',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 3000,
        stdout: 'added 1 package',
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

      // Search for npm commands
      const searchTool = historyTools.find(t => t.name === 'search_command_history');
      const result = await searchTool!.handler({ query: 'npm', limit: 10 }, context);
      const parsed = JSON.parse(result.content[0].text);

      // Results are wrapped in an object with resultsCount and results array
      expect(parsed.resultsCount).toBe(2);
      expect(parsed.results.every((r: any) => r.command.includes('npm'))).toBe(true);
    });

    it('returns stats through get_command_stats tool', async () => {
      // Save commands with different exit codes
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
        stderr: 'Error',
      });

      // Get stats
      const statsTool = historyTools.find(t => t.name === 'get_command_stats');
      const result = await statsTool!.handler({}, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.total).toBe(3);
      expect(parsed.failures).toBe(1);
      // avgDuration is formatted as string with 'ms' suffix
      expect(parsed.avgDuration).toContain('ms');
    });

    it('gets recent commands through tool with JSON format', async () => {
      // Save commands
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

      // Get recent with JSON format explicitly
      const recentTool = historyTools.find(t => t.name === 'get_recent_commands');
      const result = await recentTool!.handler({ limit: 3, outputFormat: 'json' }, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.count).toBe(3);
      // Most recent first
      expect(parsed.commands[0].command).toBe('command 4');
    });

    it('gets command by process ID', async () => {
      const processId = 123456789;
      const id = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1000,
        stdout: 'passed',
        stderr: '',
        processId,
      });

      const getByPidTool = historyTools.find(t => t.name === 'get_command_by_process_id');
      const result = await getByPidTool!.handler({ processId }, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.id).toBe(id);
      expect(parsed.command).toBe('npm test');
      expect(parsed.processId).toBe(processId);
    });
  });

  describe('Template Tools Flow', () => {
    it('saves and lists templates', async () => {
      // Save template
      const saveTool = templateTools.find(t => t.name === 'save_template');
      const saveResult = await saveTool!.handler({
        name: 'test-runner',
        command: 'npm test',
        description: 'Run tests',
        tags: ['testing'],
      }, context);
      const saved = JSON.parse(saveResult.content[0].text);

      expect(saved.success).toBe(true);
      expect(saved.template.name).toBe('test-runner');

      // List templates
      const listTool = templateTools.find(t => t.name === 'list_templates');
      const listResult = await listTool!.handler({}, context);
      const list = JSON.parse(listResult.content[0].text);

      expect(list.count).toBe(1);
      expect(list.templates[0].name).toBe('test-runner');
      expect(list.templates[0].description).toBe('Run tests');
    });

    it('deletes templates', async () => {
      // Save then delete
      const saveTool = templateTools.find(t => t.name === 'save_template');
      await saveTool!.handler({
        name: 'to-delete',
        command: 'echo "delete me"',
      }, context);

      const deleteTool = templateTools.find(t => t.name === 'delete_template');
      const deleteResult = await deleteTool!.handler({ name: 'to-delete' }, context);
      const deleted = JSON.parse(deleteResult.content[0].text);

      expect(deleted.success).toBe(true);

      // Verify deleted
      const listTool = templateTools.find(t => t.name === 'list_templates');
      const listResult = await listTool!.handler({}, context);
      const list = JSON.parse(listResult.content[0].text);

      expect(list.count).toBe(0);
    });

    it('filters templates by tag', async () => {
      const saveTool = templateTools.find(t => t.name === 'save_template');

      await saveTool!.handler({
        name: 'test-runner',
        command: 'npm test',
        tags: ['testing'],
      }, context);

      await saveTool!.handler({
        name: 'builder',
        command: 'npm run build',
        tags: ['build'],
      }, context);

      const listTool = templateTools.find(t => t.name === 'list_templates');
      const result = await listTool!.handler({ tag: 'testing' }, context);
      const list = JSON.parse(result.content[0].text);

      expect(list.count).toBe(1);
      expect(list.templates[0].name).toBe('test-runner');
    });
  });

  describe('Session Tools Flow', () => {
    it('starts and ends sessions', async () => {
      // Start session
      const startTool = sessionTools.find(t => t.name === 'start_session');
      const startResult = await startTool!.handler({
        name: 'Bug Fix',
        description: 'Fixing authentication bug',
      }, context);
      const started = JSON.parse(startResult.content[0].text);

      expect(started.success).toBe(true);
      expect(started.session.name).toBe('Bug Fix');
      expect(started.session.status).toBe('active');

      // End session
      const endTool = sessionTools.find(t => t.name === 'end_session');
      const endResult = await endTool!.handler({ status: 'completed' }, context);
      const ended = JSON.parse(endResult.content[0].text);

      expect(ended.success).toBe(true);
      expect(ended.session.status).toBe('completed');
    });

    it('lists sessions with filters', async () => {
      // Create multiple sessions
      const startTool = sessionTools.find(t => t.name === 'start_session');
      const endTool = sessionTools.find(t => t.name === 'end_session');

      await startTool!.handler({ name: 'Session 1' }, context);
      await endTool!.handler({ status: 'completed' }, context);

      await startTool!.handler({ name: 'Session 2' }, context);
      await endTool!.handler({ status: 'abandoned' }, context);

      await startTool!.handler({ name: 'Session 3' }, context);
      // Leave active

      // List all
      const listTool = sessionTools.find(t => t.name === 'list_sessions');
      const allResult = await listTool!.handler({}, context);
      const all = JSON.parse(allResult.content[0].text);

      expect(all.count).toBe(3);

      // List completed only
      const completedResult = await listTool!.handler({ status: 'completed' }, context);
      const completed = JSON.parse(completedResult.content[0].text);

      expect(completed.count).toBe(1);
      expect(completed.sessions[0].name).toBe('Session 1');
    });

    it('gets active session', async () => {
      const startTool = sessionTools.find(t => t.name === 'start_session');
      await startTool!.handler({ name: 'Active Session' }, context);

      const getTool = sessionTools.find(t => t.name === 'get_session');
      const result = await getTool!.handler({}, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.session.name).toBe('Active Session');
      expect(parsed.session.status).toBe('active');
    });
  });

  describe('Admin Tools Flow', () => {
    it('returns version info', async () => {
      const versionTool = adminTools.find(t => t.name === 'get_version');
      const result = await versionTool!.handler({}, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.name).toBe('basher');
      expect(parsed.version).toBeDefined();
    });

    it('returns server info', async () => {
      const infoTool = adminTools.find(t => t.name === 'get_server_info');
      const result = await infoTool!.handler({}, context);
      const parsed = JSON.parse(result.content[0].text);

      // Server info contains version and projectDirectory
      expect(parsed.version).toBeDefined();
      expect(parsed.projectDirectory).toBeDefined();
      expect(parsed.pid).toBeDefined();
    });

    it('clears history', async () => {
      // Save some commands
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

      // Clear
      const clearTool = adminTools.find(t => t.name === 'clear_history');
      const result = await clearTool!.handler({}, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(historyManager.getStats().total).toBe(0);
    });
  });

  describe('Cross-Service Integration', () => {
    it('session tracks commands saved to history', async () => {
      // Start session
      const startTool = sessionTools.find(t => t.name === 'start_session');
      await startTool!.handler({ name: 'Test Session' }, context);

      // Save commands
      const id1 = historyManager.saveCommand({
        command: 'npm install',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1000,
        stdout: '',
        stderr: '',
      });

      const id2 = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 2000,
        stdout: '',
        stderr: '',
      });

      // Add commands to session
      sessionManager.addCommandToSession(id1);
      sessionManager.addCommandToSession(id2);

      // Get session and verify command IDs
      const getTool = sessionTools.find(t => t.name === 'get_session');
      const result = await getTool!.handler({}, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.commandIds).toContain(id1);
      expect(parsed.commandIds).toContain(id2);
    });

    it('advanced search with output level works', async () => {
      // Save commands
      historyManager.saveCommand({
        command: 'npm test',
        cwd: '/project/a',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 5000,
        stdout: 'passed',
        stderr: '',
      });

      historyManager.saveCommand({
        command: 'npm build',
        cwd: '/project/b',
        timestamp: new Date().toISOString(),
        exitCode: 1,
        duration: 10000,
        stdout: '',
        stderr: 'Error: Build failed',
      });

      // Search with summary output level and JSON format
      const searchTool = historyTools.find(t => t.name === 'advanced_search');
      const result = await searchTool!.handler({
        query: 'npm',
        outputLevel: 'summary',
        outputFormat: 'json',
      }, context);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.resultsCount).toBe(2);
      // Summary should have limited fields
      expect(parsed.results).toBeDefined();
    });

    it('compare executions shows diffs', async () => {
      const id1 = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 0,
        duration: 1000,
        stdout: 'Test A passed\nTest B passed',
        stderr: '',
      });

      const id2 = historyManager.saveCommand({
        command: 'npm test',
        cwd: '/tmp',
        timestamp: new Date().toISOString(),
        exitCode: 1,
        duration: 1500,
        stdout: 'Test A passed\nTest B failed',
        stderr: 'Assertion error',
      });

      const compareTool = historyTools.find(t => t.name === 'compare_executions');
      const result = await compareTool!.handler({ commandId1: id1, commandId2: id2 }, context);
      const parsed = JSON.parse(result.content[0].text);

      // Result format: commandId1, commandId2, command1 (string), command2 (string), stdoutDiff, stderrDiff
      expect(parsed.commandId1).toBe(id1);
      expect(parsed.commandId2).toBe(id2);
      expect(parsed.stdoutDiff).toBeDefined();
      expect(parsed.stderrDiff).toBeDefined();
    });
  });
});
