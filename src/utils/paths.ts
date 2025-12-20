/**
 * Shared path resolution utilities for Basher
 *
 * This module provides a single source of truth for determining
 * project paths and basher directory locations, eliminating
 * duplicated logic across index.ts and web-server.ts.
 */

import { resolve, join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import logger from '../services/logger.config.js';

/**
 * Path configuration result
 */
export interface PathConfig {
  /** The project root directory */
  projectPath: string;
  /** The .basher directory within the project */
  basherDir: string;
  /** The database file path */
  dbPath: string;
  /** Whether this is using the legacy DB_PATH env var */
  isLegacy: boolean;
}

/**
 * Determine the project directory based on configuration priority:
 * 1. --project command-line argument
 * 2. BASHER_PROJECT_ROOT environment variable
 * 3. DB_PATH environment variable (legacy, for backward compatibility)
 * 4. Home directory (fallback)
 *
 * @returns The resolved project path, or null if using legacy DB_PATH
 */
export function determineProjectPath(): string | null {
  // 1. Check for --project argument
  const argIndex = process.argv.indexOf('--project');
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return resolve(process.argv[argIndex + 1]);
  }

  // 2. Check for BASHER_PROJECT_ROOT environment variable
  if (process.env.BASHER_PROJECT_ROOT) {
    return resolve(process.env.BASHER_PROJECT_ROOT);
  }

  // 3. Check for legacy DB_PATH (return null to use DB_PATH directly)
  if (process.env.DB_PATH) {
    logger.info('Using legacy DB_PATH configuration');
    return null; // Will use DB_PATH directly
  }

  // 4. Fallback to home directory
  logger.warn(
    'No project directory specified. Using home directory as fallback. ' +
    'For project-specific isolation, use --project argument or BASHER_PROJECT_ROOT env variable.'
  );
  return homedir();
}

/**
 * Get the .basher directory path for the current project.
 * This is a convenience function for code that only needs the basher dir.
 *
 * @returns The path to the .basher directory
 */
export function getBasherDir(): string {
  const projectPath = determineProjectPath();

  if (!projectPath && process.env.DB_PATH) {
    // Legacy mode: use the directory containing the database
    return dirname(process.env.DB_PATH);
  }

  if (!projectPath) {
    // Fallback to home directory
    return join(homedir(), '.basher');
  }

  return join(projectPath, '.basher');
}

/**
 * Initialize and return the complete path configuration.
 * Creates the .basher directory and .gitignore if they don't exist.
 *
 * @returns PathConfig with all resolved paths
 * @throws Error if unable to determine project path
 */
export function initializePaths(): PathConfig {
  // Legacy support: if DB_PATH is explicitly set, use it directly
  if (process.env.DB_PATH) {
    const basherDir = dirname(process.env.DB_PATH);
    return {
      projectPath: basherDir, // Best guess for project path
      basherDir,
      dbPath: process.env.DB_PATH,
      isLegacy: true,
    };
  }

  const projectPath = determineProjectPath();
  if (!projectPath) {
    throw new Error('Unable to determine project path');
  }

  const basherDir = join(projectPath, '.basher');

  // Create .basher directory if it doesn't exist
  if (!existsSync(basherDir)) {
    mkdirSync(basherDir, { recursive: true });
    logger.info({ basherDir }, 'Created .basher directory');

    // Create .gitignore to exclude database files and runtime files from version control
    const gitignorePath = join(basherDir, '.gitignore');
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, '*.db\n*.db-shm\n*.db-wal\nport\npid\nport.*\n');
      logger.info('Created .basher/.gitignore');
    }
  }

  const dbPath = join(basherDir, 'history.db');
  logger.info({ projectPath, dbPath }, 'Paths initialized for project');

  return {
    projectPath,
    basherDir,
    dbPath,
    isLegacy: false,
  };
}

/**
 * Get the port file path for the current basher directory
 *
 * @param basherDir The .basher directory path
 * @returns The path to the port file
 */
export function getPortFilePath(basherDir: string): string {
  return join(basherDir, 'port');
}

/**
 * Get the instance-specific port file path (keyed by parent PID)
 *
 * @param basherDir The .basher directory path
 * @returns The path to the instance port file
 */
export function getInstancePortFilePath(basherDir: string): string {
  return join(basherDir, `port.${process.ppid}`);
}

/**
 * Get the servers.json file path for multi-instance tracking
 *
 * @param basherDir The .basher directory path
 * @returns The path to the servers.json file
 */
export function getServersFilePath(basherDir: string): string {
  return join(basherDir, 'servers.json');
}

/**
 * Get the whitelist.json file path
 *
 * @param basherDir The .basher directory path
 * @returns The path to the whitelist.json file
 */
export function getWhitelistFilePath(basherDir: string): string {
  return join(basherDir, 'whitelist.json');
}

/**
 * Get the running-processes.json file path
 *
 * @param basherDir The .basher directory path
 * @returns The path to the running-processes.json file
 */
export function getProcessStateFilePath(basherDir: string): string {
  return join(basherDir, 'running-processes.json');
}
