/**
 * HistoryManager class for managing command execution history
 * Uses SQLite with full-text search (FTS5) for searchable command history
 */
import Database from 'better-sqlite3';
import type { CommandHistoryEntry } from '../types/index.js';
import { AdvancedQueries } from './advanced-queries.js';
export interface HistoryManagerOptions {
    /** Maximum number of entries to keep (default: 1000) */
    maxEntries?: number;
    /** Maximum age of entries in milliseconds (default: 7 days) */
    maxAgeMs?: number;
}
export declare class HistoryManager {
    private db;
    advanced: AdvancedQueries;
    private maxEntries;
    private maxAgeMs;
    /**
     * Get the database instance (for sharing with other managers)
     */
    getDatabase(): Database.Database;
    constructor(dbPath?: string, options?: HistoryManagerOptions);
    private initDatabase;
    private migrateDatabase;
    /**
     * Save a command execution to history
     */
    saveCommand(entry: CommandHistoryEntry & {
        processId?: number;
        status?: string;
        title?: string;
    }): number;
    /**
     * Update command status (e.g., from 'running' to 'completed')
     */
    updateStatus(id: number, status: string, exitCode?: number, duration?: number, stdout?: string, stderr?: string): void;
    /**
     * Search command history using full-text search
     */
    searchHistory(query: string, limit?: number): CommandHistoryEntry[];
    /**
     * Get recent command history
     */
    getCommandById(id: number): CommandHistoryEntry | null;
    /**
     * Get a command by its process ID (useful for finding completed background commands)
     * Returns the most recent command with this process ID
     */
    getCommandByProcessId(processId: number): CommandHistoryEntry | null;
    getRecentHistory(limit?: number, includeRunning?: boolean): CommandHistoryEntry[];
    /**
     * Get command history by exit code
     */
    getByExitCode(exitCode: number, limit?: number): CommandHistoryEntry[];
    /**
     * Get statistics about command history
     */
    getStats(): {
        total: number;
        failures: number;
        avgDuration: number;
    };
    /**
     * Cleanup old entries based on maxEntries and maxAgeMs limits
     * Removes entries that exceed either limit (whichever comes first)
     */
    cleanup(): {
        deletedByAge: number;
        deletedByCount: number;
    };
    /**
     * Clear all command history
     */
    clearHistory(): void;
    /**
     * Close the database connection
     */
    close(): void;
}
