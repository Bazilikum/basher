/**
 * Command Whitelist Manager
 *
 * Manages a whitelist of allowed command bases (e.g., 'npm', 'git', 'node').
 * Commands must be whitelisted before they can be executed via the MCP server.
 *
 * SECURITY: This provides defense-in-depth by requiring explicit approval
 * for each command base before it can be executed.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import logger from './logger.config.js';

/**
 * Entry for a whitelisted command
 */
export interface WhitelistEntry {
  approvedAt: string;
  description?: string;
}

/**
 * Whitelist file structure
 */
export interface WhitelistConfig {
  enabled: boolean;
  commands: Record<string, WhitelistEntry>;
}

/**
 * Result of a whitelist check
 */
export interface WhitelistCheckResult {
  allowed: boolean;
  reason: string;
  commandBase: string;
}

/**
 * Default commands to whitelist when creating a new whitelist file.
 * These are common, generally safe development commands.
 */
const DEFAULT_WHITELISTED_COMMANDS: Record<string, WhitelistEntry> = {
  // Package managers
  npm: { approvedAt: new Date().toISOString(), description: 'Node.js package manager' },
  npx: { approvedAt: new Date().toISOString(), description: 'Node.js package runner' },
  yarn: { approvedAt: new Date().toISOString(), description: 'Alternative Node.js package manager' },
  pnpm: { approvedAt: new Date().toISOString(), description: 'Fast Node.js package manager' },
  bun: { approvedAt: new Date().toISOString(), description: 'Bun JavaScript runtime and package manager' },

  // Version control
  git: { approvedAt: new Date().toISOString(), description: 'Git version control' },
  gh: { approvedAt: new Date().toISOString(), description: 'GitHub CLI' },

  // Runtime/interpreters
  node: { approvedAt: new Date().toISOString(), description: 'Node.js runtime' },
  python: { approvedAt: new Date().toISOString(), description: 'Python interpreter' },
  python3: { approvedAt: new Date().toISOString(), description: 'Python 3 interpreter' },
  pip: { approvedAt: new Date().toISOString(), description: 'Python package manager' },
  pip3: { approvedAt: new Date().toISOString(), description: 'Python 3 package manager' },

  // Common CLI tools
  ls: { approvedAt: new Date().toISOString(), description: 'List directory contents' },
  cat: { approvedAt: new Date().toISOString(), description: 'Concatenate and display files' },
  echo: { approvedAt: new Date().toISOString(), description: 'Display text' },
  pwd: { approvedAt: new Date().toISOString(), description: 'Print working directory' },
  cd: { approvedAt: new Date().toISOString(), description: 'Change directory' },
  mkdir: { approvedAt: new Date().toISOString(), description: 'Create directories' },
  cp: { approvedAt: new Date().toISOString(), description: 'Copy files' },
  mv: { approvedAt: new Date().toISOString(), description: 'Move/rename files' },
  head: { approvedAt: new Date().toISOString(), description: 'Display first lines of file' },
  tail: { approvedAt: new Date().toISOString(), description: 'Display last lines of file' },
  grep: { approvedAt: new Date().toISOString(), description: 'Search text patterns' },
  find: { approvedAt: new Date().toISOString(), description: 'Find files' },
  which: { approvedAt: new Date().toISOString(), description: 'Locate a command' },
  wc: { approvedAt: new Date().toISOString(), description: 'Word count' },
  sort: { approvedAt: new Date().toISOString(), description: 'Sort lines' },
  uniq: { approvedAt: new Date().toISOString(), description: 'Remove duplicate lines' },
  diff: { approvedAt: new Date().toISOString(), description: 'Compare files' },
  curl: { approvedAt: new Date().toISOString(), description: 'Transfer data from URLs' },
  wget: { approvedAt: new Date().toISOString(), description: 'Download files' },

  // Build tools
  make: { approvedAt: new Date().toISOString(), description: 'Build automation tool' },
  cargo: { approvedAt: new Date().toISOString(), description: 'Rust package manager' },
  go: { approvedAt: new Date().toISOString(), description: 'Go programming language' },
  tsc: { approvedAt: new Date().toISOString(), description: 'TypeScript compiler' },
  tsx: { approvedAt: new Date().toISOString(), description: 'TypeScript execute' },
  esbuild: { approvedAt: new Date().toISOString(), description: 'JavaScript bundler' },
  webpack: { approvedAt: new Date().toISOString(), description: 'JavaScript bundler' },
  vite: { approvedAt: new Date().toISOString(), description: 'Frontend build tool' },
  rollup: { approvedAt: new Date().toISOString(), description: 'JavaScript bundler' },

  // Testing
  jest: { approvedAt: new Date().toISOString(), description: 'JavaScript testing framework' },
  vitest: { approvedAt: new Date().toISOString(), description: 'Vite-native testing framework' },
  pytest: { approvedAt: new Date().toISOString(), description: 'Python testing framework' },
  mocha: { approvedAt: new Date().toISOString(), description: 'JavaScript testing framework' },

  // Linting/formatting
  eslint: { approvedAt: new Date().toISOString(), description: 'JavaScript linter' },
  prettier: { approvedAt: new Date().toISOString(), description: 'Code formatter' },
  biome: { approvedAt: new Date().toISOString(), description: 'JavaScript toolchain' },

  // Docker (read-only operations are generally safe)
  docker: { approvedAt: new Date().toISOString(), description: 'Container platform' },
};

/**
 * Extract the base command (program name) from a full command string.
 *
 * Examples:
 * - "npm install express" -> "npm"
 * - "git commit -m 'message'" -> "git"
 * - "/usr/bin/node script.js" -> "node"
 * - "ENV_VAR=value npm test" -> "npm"
 * - "sudo apt install" -> "sudo"
 */
export function extractCommandBase(command: string): string {
  if (!command || typeof command !== 'string') {
    return '';
  }

  // Trim whitespace
  let trimmed = command.trim();
  if (!trimmed) {
    return '';
  }

  // Remove environment variable assignments at the start (VAR=value prefix)
  // Match: FOO=bar BAR="baz" command args
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/.test(trimmed)) {
    trimmed = trimmed.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, '');
  }

  // Split on whitespace, pipes, semicolons, and other shell operators
  // Get the first token
  const match = trimmed.match(/^([^\s|&;<>()]+)/);
  if (!match) {
    return trimmed;
  }

  let base = match[1];

  // If it's a path, extract just the command name
  if (base.includes('/')) {
    const parts = base.split('/');
    base = parts[parts.length - 1] || base;
  }

  // Remove any remaining quotes
  base = base.replace(/^['"]|['"]$/g, '');

  return base;
}

/**
 * WhitelistManager - manages command whitelist
 */
class WhitelistManager {
  private config: WhitelistConfig;
  private configPath: string;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      enabled: true,
      commands: {},
    };
    this.configPath = '';
  }

  /**
   * Initialize the whitelist manager with the basher directory path
   */
  initialize(basherDir: string): void {
    this.configPath = join(basherDir, 'whitelist.json');

    if (existsSync(this.configPath)) {
      this.load();
    } else {
      // Create default whitelist
      this.config = {
        enabled: true,
        commands: { ...DEFAULT_WHITELISTED_COMMANDS },
      };
      this.save();
      logger.info(
        { path: this.configPath, commandCount: Object.keys(this.config.commands).length },
        'Created default whitelist with common commands'
      );
    }

    this.initialized = true;
    logger.info(
      {
        enabled: this.config.enabled,
        commandCount: Object.keys(this.config.commands).length,
      },
      'Whitelist manager initialized'
    );
  }

  /**
   * Load whitelist from file
   */
  private load(): void {
    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate structure
      if (typeof parsed.enabled !== 'boolean') {
        parsed.enabled = true;
      }
      if (!parsed.commands || typeof parsed.commands !== 'object') {
        parsed.commands = {};
      }

      this.config = parsed;
      logger.debug({ path: this.configPath }, 'Loaded whitelist from file');
    } catch (error) {
      logger.error({ error, path: this.configPath }, 'Failed to load whitelist, using defaults');
      this.config = {
        enabled: true,
        commands: { ...DEFAULT_WHITELISTED_COMMANDS },
      };
    }
  }

  /**
   * Save whitelist to file
   */
  private save(): void {
    try {
      const content = JSON.stringify(this.config, null, 2);
      writeFileSync(this.configPath, content, 'utf-8');
      logger.debug({ path: this.configPath }, 'Saved whitelist to file');
    } catch (error) {
      logger.error({ error, path: this.configPath }, 'Failed to save whitelist');
      throw error;
    }
  }

  /**
   * Check if a command is allowed to execute
   */
  check(command: string): WhitelistCheckResult {
    const commandBase = extractCommandBase(command);

    if (!commandBase) {
      return {
        allowed: false,
        reason: 'Could not extract command base from command string',
        commandBase: '',
      };
    }

    // If whitelist is disabled, allow all commands
    if (!this.config.enabled) {
      return {
        allowed: true,
        reason: 'Whitelist is disabled',
        commandBase,
      };
    }

    // Check if command base is whitelisted
    if (this.config.commands[commandBase]) {
      return {
        allowed: true,
        reason: `Command '${commandBase}' is whitelisted`,
        commandBase,
      };
    }

    // Not whitelisted
    return {
      allowed: false,
      reason: `Command '${commandBase}' is not whitelisted. ` +
        `To execute this command, you must first get user approval to whitelist '${commandBase}'. ` +
        `Ask the user: "May I whitelist the '${commandBase}' command to proceed?" ` +
        `If approved, use the whitelist_command tool with command_base="${commandBase}", then retry.`,
      commandBase,
    };
  }

  /**
   * Add a command to the whitelist
   */
  add(commandBase: string, description?: string): { success: boolean; message: string } {
    if (!commandBase || typeof commandBase !== 'string') {
      return { success: false, message: 'Invalid command base' };
    }

    const normalized = commandBase.trim().toLowerCase();
    if (!normalized) {
      return { success: false, message: 'Command base cannot be empty' };
    }

    // Check if already whitelisted
    if (this.config.commands[normalized]) {
      return {
        success: true,
        message: `Command '${normalized}' is already whitelisted`,
      };
    }

    // Add to whitelist
    this.config.commands[normalized] = {
      approvedAt: new Date().toISOString(),
      description: description || undefined,
    };

    this.save();

    logger.info({ commandBase: normalized, description }, 'Added command to whitelist');

    return {
      success: true,
      message: `Command '${normalized}' has been whitelisted. You can now execute commands starting with '${normalized}'.`,
    };
  }

  /**
   * Remove a command from the whitelist
   */
  remove(commandBase: string): { success: boolean; message: string } {
    const normalized = commandBase.trim().toLowerCase();

    if (!this.config.commands[normalized]) {
      return {
        success: false,
        message: `Command '${normalized}' is not in the whitelist`,
      };
    }

    delete this.config.commands[normalized];
    this.save();

    logger.info({ commandBase: normalized }, 'Removed command from whitelist');

    return {
      success: true,
      message: `Command '${normalized}' has been removed from the whitelist`,
    };
  }

  /**
   * List all whitelisted commands
   */
  list(): { enabled: boolean; commands: Array<{ base: string; approvedAt: string; description?: string }> } {
    return {
      enabled: this.config.enabled,
      commands: Object.entries(this.config.commands).map(([base, entry]) => ({
        base,
        approvedAt: entry.approvedAt,
        description: entry.description,
      })),
    };
  }

  /**
   * Enable or disable the whitelist
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.save();
    logger.info({ enabled }, 'Whitelist enabled state changed');
  }

  /**
   * Check if whitelist is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the whitelist file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}

// Export singleton instance
export const whitelistManager = new WhitelistManager();
