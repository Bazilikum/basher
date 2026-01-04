/**
 * Command Whitelist Manager
 *
 * Manages a whitelist of allowed command bases (e.g., 'npm', 'git', 'node').
 * Commands must be whitelisted before they can be executed via the MCP server.
 *
 * SECURITY: This provides defense-in-depth by requiring explicit approval
 * for each command base before it can be executed.
 */
/**
 * Entry for a whitelisted command
 */
export interface WhitelistEntry {
    approvedAt: string;
    description?: string;
    /**
     * Optional regex patterns for allowed arguments.
     * If set, the command arguments must match at least one pattern.
     * If not set, all arguments are allowed.
     */
    allowedArgs?: string[];
    /**
     * Optional regex patterns for blocked arguments.
     * If any pattern matches, the command is blocked.
     * Checked after allowedArgs.
     */
    blockedArgs?: string[];
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
 * Extract the base command (program name) from a full command string.
 *
 * Examples:
 * - "npm install express" -> "npm"
 * - "git commit -m 'message'" -> "git"
 * - "/usr/bin/node script.js" -> "node"
 * - "ENV_VAR=value npm test" -> "npm"
 * - "sudo apt install" -> "sudo"
 */
export declare function extractCommandBase(command: string): string;
/**
 * Configuration for WhitelistManager dependency injection
 */
export interface WhitelistManagerConfig {
    /** Directory for whitelist file persistence */
    basherDir: string;
}
/**
 * WhitelistManager - manages command whitelist
 */
export declare class WhitelistManager {
    private config;
    private configPath;
    private initialized;
    /**
     * Create a new WhitelistManager instance
     * @param config - Optional configuration with basherDir
     */
    constructor(config?: WhitelistManagerConfig);
    /**
     * Internal initialization with basher directory
     */
    private initializeWithDir;
    /**
     * Initialize the whitelist manager with the basher directory path
     * @deprecated Use constructor config instead
     */
    initialize(basherDir: string): void;
    /**
     * Load whitelist from file
     */
    private load;
    /**
     * Save whitelist to file
     */
    private save;
    /**
     * Check if a command is allowed to execute
     */
    check(command: string): WhitelistCheckResult;
    /**
     * Validate command arguments against allowedArgs and blockedArgs patterns
     */
    private validateArguments;
    /**
     * Options for adding a command to the whitelist
     */
    add(commandBase: string, options?: {
        description?: string;
        allowedArgs?: string[];
        blockedArgs?: string[];
    }): {
        success: boolean;
        message: string;
    };
    /**
     * Remove a command from the whitelist
     */
    remove(commandBase: string): {
        success: boolean;
        message: string;
    };
    /**
     * List whitelisted commands with optional pagination
     */
    list(limit?: number, offset?: number): {
        enabled: boolean;
        total: number;
        offset: number;
        limit: number;
        commands: Array<{
            base: string;
            approvedAt: string;
            description?: string;
            allowedArgs?: string[];
            blockedArgs?: string[];
        }>;
    };
    /**
     * Enable or disable the whitelist
     */
    setEnabled(enabled: boolean): void;
    /**
     * Check if whitelist is enabled
     */
    isEnabled(): boolean;
    /**
     * Get the whitelist file path
     */
    getConfigPath(): string;
}
/**
 * Default singleton instance for backward compatibility.
 * Prefer creating instances with WhitelistManager constructor for new code.
 * @deprecated Use `new WhitelistManager(config)` for dependency injection
 */
export declare const whitelistManager: WhitelistManager;
