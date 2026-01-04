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
 * Default commands to whitelist when creating a new whitelist file.
 * These are common, generally safe development commands.
 */
const DEFAULT_WHITELISTED_COMMANDS = {
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
export function extractCommandBase(command) {
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
export class WhitelistManager {
    /**
     * Create a new WhitelistManager instance
     * @param config - Optional configuration with basherDir
     */
    constructor(config) {
        this.initialized = false;
        this.config = {
            enabled: true,
            commands: {},
        };
        this.configPath = '';
        if (config?.basherDir) {
            this.initializeWithDir(config.basherDir);
        }
    }
    /**
     * Internal initialization with basher directory
     */
    initializeWithDir(basherDir) {
        this.configPath = join(basherDir, 'whitelist.json');
        if (existsSync(this.configPath)) {
            this.load();
        }
        else {
            // Create default whitelist
            this.config = {
                enabled: true,
                commands: { ...DEFAULT_WHITELISTED_COMMANDS },
            };
            this.save();
            logger.info({ path: this.configPath, commandCount: Object.keys(this.config.commands).length }, 'Created default whitelist with common commands');
        }
        this.initialized = true;
        logger.info({
            enabled: this.config.enabled,
            commandCount: Object.keys(this.config.commands).length,
        }, 'Whitelist manager initialized');
    }
    /**
     * Initialize the whitelist manager with the basher directory path
     * @deprecated Use constructor config instead
     */
    initialize(basherDir) {
        if (this.initialized) {
            logger.warn('WhitelistManager already initialized, ignoring');
            return;
        }
        this.initializeWithDir(basherDir);
    }
    /**
     * Load whitelist from file
     */
    load() {
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
        }
        catch (error) {
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
    save() {
        try {
            const content = JSON.stringify(this.config, null, 2);
            writeFileSync(this.configPath, content, 'utf-8');
            logger.debug({ path: this.configPath }, 'Saved whitelist to file');
        }
        catch (error) {
            logger.error({ error, path: this.configPath }, 'Failed to save whitelist');
            throw error;
        }
    }
    /**
     * Check if a command is allowed to execute
     */
    check(command) {
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
        const entry = this.config.commands[commandBase];
        if (!entry) {
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
        // Check argument validation if configured
        const argValidation = this.validateArguments(command, commandBase, entry);
        if (!argValidation.allowed) {
            return argValidation;
        }
        return {
            allowed: true,
            reason: `Command '${commandBase}' is whitelisted`,
            commandBase,
        };
    }
    /**
     * Validate command arguments against allowedArgs and blockedArgs patterns
     */
    validateArguments(command, commandBase, entry) {
        // Extract arguments (everything after the command base)
        const args = command.substring(command.indexOf(commandBase) + commandBase.length).trim();
        // Check blocked patterns first (deny takes precedence)
        if (entry.blockedArgs && entry.blockedArgs.length > 0) {
            for (const pattern of entry.blockedArgs) {
                try {
                    const regex = new RegExp(pattern);
                    if (regex.test(args)) {
                        logger.warn({ command, commandBase, pattern }, 'Command blocked by argument pattern');
                        return {
                            allowed: false,
                            reason: `Command '${commandBase}' has blocked arguments. Pattern '${pattern}' matched.`,
                            commandBase,
                        };
                    }
                }
                catch (e) {
                    logger.error({ pattern, error: e }, 'Invalid blockedArgs regex pattern');
                }
            }
        }
        // Check allowed patterns (if specified, at least one must match)
        if (entry.allowedArgs && entry.allowedArgs.length > 0) {
            let anyMatch = false;
            for (const pattern of entry.allowedArgs) {
                try {
                    const regex = new RegExp(pattern);
                    if (regex.test(args)) {
                        anyMatch = true;
                        break;
                    }
                }
                catch (e) {
                    logger.error({ pattern, error: e }, 'Invalid allowedArgs regex pattern');
                }
            }
            if (!anyMatch) {
                logger.warn({ command, commandBase, allowedArgs: entry.allowedArgs }, 'Command arguments not in allowed list');
                return {
                    allowed: false,
                    reason: `Command '${commandBase}' arguments do not match any allowed pattern.`,
                    commandBase,
                };
            }
        }
        return {
            allowed: true,
            reason: 'Arguments validated',
            commandBase,
        };
    }
    /**
     * Options for adding a command to the whitelist
     */
    add(commandBase, options) {
        if (!commandBase || typeof commandBase !== 'string') {
            return { success: false, message: 'Invalid command base' };
        }
        const normalized = commandBase.trim().toLowerCase();
        if (!normalized) {
            return { success: false, message: 'Command base cannot be empty' };
        }
        // Validate regex patterns
        const validatePatterns = (patterns, name) => {
            if (!patterns)
                return null;
            for (const pattern of patterns) {
                try {
                    new RegExp(pattern);
                }
                catch (e) {
                    return `Invalid ${name} regex pattern: ${pattern}`;
                }
            }
            return null;
        };
        const allowedError = validatePatterns(options?.allowedArgs, 'allowedArgs');
        if (allowedError) {
            return { success: false, message: allowedError };
        }
        const blockedError = validatePatterns(options?.blockedArgs, 'blockedArgs');
        if (blockedError) {
            return { success: false, message: blockedError };
        }
        // Check if already whitelisted (update if adding new restrictions)
        const existing = this.config.commands[normalized];
        if (existing && !options?.allowedArgs && !options?.blockedArgs) {
            return {
                success: true,
                message: `Command '${normalized}' is already whitelisted`,
            };
        }
        // Add or update whitelist entry
        this.config.commands[normalized] = {
            approvedAt: existing?.approvedAt || new Date().toISOString(),
            description: options?.description || existing?.description,
            allowedArgs: options?.allowedArgs || existing?.allowedArgs,
            blockedArgs: options?.blockedArgs || existing?.blockedArgs,
        };
        this.save();
        const action = existing ? 'Updated' : 'Added';
        logger.info({ commandBase: normalized, description: options?.description, allowedArgs: options?.allowedArgs, blockedArgs: options?.blockedArgs }, `${action} command in whitelist`);
        return {
            success: true,
            message: `Command '${normalized}' has been whitelisted. You can now execute commands starting with '${normalized}'.`,
        };
    }
    /**
     * Remove a command from the whitelist
     */
    remove(commandBase) {
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
     * List whitelisted commands with optional pagination
     */
    list(limit, offset) {
        const allCommands = Object.entries(this.config.commands).map(([base, entry]) => ({
            base,
            approvedAt: entry.approvedAt,
            description: entry.description,
            allowedArgs: entry.allowedArgs,
            blockedArgs: entry.blockedArgs,
        }));
        const total = allCommands.length;
        const actualOffset = offset ?? 0;
        const actualLimit = limit ?? 20; // Default to 20 for token efficiency
        const paginatedCommands = allCommands.slice(actualOffset, actualOffset + actualLimit);
        return {
            enabled: this.config.enabled,
            total,
            offset: actualOffset,
            limit: actualLimit,
            commands: paginatedCommands,
        };
    }
    /**
     * Enable or disable the whitelist
     */
    setEnabled(enabled) {
        this.config.enabled = enabled;
        this.save();
        logger.info({ enabled }, 'Whitelist enabled state changed');
    }
    /**
     * Check if whitelist is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Get the whitelist file path
     */
    getConfigPath() {
        return this.configPath;
    }
}
/**
 * Default singleton instance for backward compatibility.
 * Prefer creating instances with WhitelistManager constructor for new code.
 * @deprecated Use `new WhitelistManager(config)` for dependency injection
 */
export const whitelistManager = new WhitelistManager();
