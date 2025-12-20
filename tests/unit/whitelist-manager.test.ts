import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractCommandBase } from '../../src/services/whitelist-manager.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('extractCommandBase', () => {
  it('extracts simple command', () => {
    expect(extractCommandBase('npm install')).toBe('npm');
  });

  it('extracts command with multiple arguments', () => {
    expect(extractCommandBase('git commit -m "message"')).toBe('git');
  });

  it('extracts command from full path', () => {
    expect(extractCommandBase('/usr/bin/node script.js')).toBe('node');
  });

  it('handles environment variable prefix', () => {
    expect(extractCommandBase('ENV_VAR=value npm test')).toBe('npm');
  });

  it('handles multiple environment variables', () => {
    expect(extractCommandBase('FOO=bar BAR=baz npm run build')).toBe('npm');
  });

  it('returns empty string for empty input', () => {
    expect(extractCommandBase('')).toBe('');
  });

  it('returns empty string for whitespace only', () => {
    expect(extractCommandBase('   ')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(extractCommandBase(null as any)).toBe('');
    expect(extractCommandBase(undefined as any)).toBe('');
  });

  it('handles command with pipe', () => {
    expect(extractCommandBase('cat file.txt | grep pattern')).toBe('cat');
  });

  it('handles command with semicolon', () => {
    expect(extractCommandBase('cd /tmp; ls -la')).toBe('cd');
  });

  it('handles command with ampersand', () => {
    expect(extractCommandBase('npm start &')).toBe('npm');
  });

  it('handles quoted paths', () => {
    expect(extractCommandBase('"node" script.js')).toBe('node');
  });

  it('extracts sudo as the command base', () => {
    expect(extractCommandBase('sudo apt install')).toBe('sudo');
  });
});

describe('WhitelistManager', () => {
  let testDir: string;
  let basherDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `basher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    basherDir = join(testDir, '.basher');
    mkdirSync(basherDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temporary directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('creates default whitelist on initialization', async () => {
    // Import fresh instance to avoid singleton state
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');

    // Create a new instance directly (not the singleton)
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    const whitelistPath = join(basherDir, 'whitelist.json');
    expect(existsSync(whitelistPath)).toBe(true);

    const content = JSON.parse(readFileSync(whitelistPath, 'utf-8'));
    expect(content.enabled).toBe(true);
    expect(content.commands).toBeDefined();
    expect(content.commands.npm).toBeDefined();
    expect(content.commands.git).toBeDefined();
  });

  it('allows whitelisted commands', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    const result = manager.check('npm install express');
    expect(result.allowed).toBe(true);
    expect(result.commandBase).toBe('npm');
  });

  it('blocks non-whitelisted commands', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    const result = manager.check('dangerous-command --flag');
    expect(result.allowed).toBe(false);
    expect(result.commandBase).toBe('dangerous-command');
    expect(result.reason).toContain('not whitelisted');
  });

  it('adds commands to whitelist', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    // Initially blocked
    expect(manager.check('mycommand --arg').allowed).toBe(false);

    // Add to whitelist
    const addResult = manager.add('mycommand', 'My custom command');
    expect(addResult.success).toBe(true);

    // Now allowed
    expect(manager.check('mycommand --arg').allowed).toBe(true);
  });

  it('removes commands from whitelist', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    // npm is whitelisted by default
    expect(manager.check('npm install').allowed).toBe(true);

    // Remove from whitelist
    const removeResult = manager.remove('npm');
    expect(removeResult.success).toBe(true);

    // Now blocked
    expect(manager.check('npm install').allowed).toBe(false);
  });

  it('lists all whitelisted commands', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    const list = manager.list();
    expect(list.enabled).toBe(true);
    expect(Array.isArray(list.commands)).toBe(true);
    expect(list.commands.length).toBeGreaterThan(0);
    expect(list.commands.some((c: any) => c.base === 'npm')).toBe(true);
  });

  it('can disable whitelist', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    // Disable whitelist
    manager.setEnabled(false);

    // Now any command is allowed
    const result = manager.check('any-random-command --flag');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('disabled');
  });

  it('persists changes to file', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    // Add a command
    manager.add('testcmd', 'Test command');

    // Read the file directly
    const whitelistPath = join(basherDir, 'whitelist.json');
    const content = JSON.parse(readFileSync(whitelistPath, 'utf-8'));
    expect(content.commands.testcmd).toBeDefined();
    expect(content.commands.testcmd.description).toBe('Test command');
  });

  it('handles invalid command base gracefully', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    const addResult = manager.add('', 'Empty command');
    expect(addResult.success).toBe(false);
    expect(addResult.message).toContain('Invalid');
  });

  it('reports already whitelisted commands', async () => {
    const { WhitelistManager } = await import('../../src/services/whitelist-manager.js');
    const manager = new (WhitelistManager as any)();
    manager.initialize(basherDir);

    // npm is already whitelisted
    const addResult = manager.add('npm', 'Duplicate');
    expect(addResult.success).toBe(true);
    expect(addResult.message).toContain('already whitelisted');
  });
});
