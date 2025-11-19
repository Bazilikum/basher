/**
 * HistoryManager class for managing command execution history
 * Uses SQLite with full-text search (FTS5) for searchable command history
 */
import type { CommandHistoryEntry } from '../types/index.js';
import { AdvancedQueries } from './advanced-queries.js';
export declare class HistoryManager {
    private db;
    advanced: AdvancedQueries;
    constructor(dbPath?: string);
    private initDatabase;
    private migrateDatabase;
    /**
     * Save a command execution to history
     */
    saveCommand(entry: CommandHistoryEntry & {
        processId?: number;
        status?: string;
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
    getRecentHistory(limit?: number): CommandHistoryEntry[];
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
     * Close the database connection
     */
    close(): void;
}
