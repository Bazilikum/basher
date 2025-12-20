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
 * WhitelistManager - manages command whitelist
 */
declare class WhitelistManager {
    private config;
    private configPath;
    private initialized;
    constructor();
    /**
     * Initialize the whitelist manager with the basher directory path
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
     * Add a command to the whitelist
     */
    add(commandBase: string, description?: string): {
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
     * List all whitelisted commands
     */
    list(): {
        enabled: boolean;
        commands: Array<{
            base: string;
            approvedAt: string;
            description?: string;
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
export { WhitelistManager };
export declare const whitelistManager: WhitelistManager;
