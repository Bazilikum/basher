/**
 * Shared path resolution utilities for Basher
 *
 * This module provides a single source of truth for determining
 * project paths and basher directory locations, eliminating
 * duplicated logic across index.ts and web-server.ts.
 */
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
export declare function determineProjectPath(): string | null;
/**
 * Get the .basher directory path for the current project.
 * This is a convenience function for code that only needs the basher dir.
 *
 * @returns The path to the .basher directory
 */
export declare function getBasherDir(): string;
/**
 * Initialize and return the complete path configuration.
 * Creates the .basher directory and .gitignore if they don't exist.
 *
 * @returns PathConfig with all resolved paths
 * @throws Error if unable to determine project path
 */
export declare function initializePaths(): PathConfig;
/**
 * Get the port file path for the current basher directory
 *
 * @param basherDir The .basher directory path
 * @returns The path to the port file
 */
export declare function getPortFilePath(basherDir: string): string;
/**
 * Get the instance-specific port file path (keyed by parent PID)
 *
 * @param basherDir The .basher directory path
 * @returns The path to the instance port file
 */
export declare function getInstancePortFilePath(basherDir: string): string;
/**
 * Get the servers.json file path for multi-instance tracking
 *
 * @param basherDir The .basher directory path
 * @returns The path to the servers.json file
 */
export declare function getServersFilePath(basherDir: string): string;
/**
 * Get the whitelist.json file path
 *
 * @param basherDir The .basher directory path
 * @returns The path to the whitelist.json file
 */
export declare function getWhitelistFilePath(basherDir: string): string;
/**
 * Get the running-processes.json file path
 *
 * @param basherDir The .basher directory path
 * @returns The path to the running-processes.json file
 */
export declare function getProcessStateFilePath(basherDir: string): string;
