/**
 * Advanced query methods for command history
 * Token-efficient search and retrieval strategies
 */
import type Database from 'better-sqlite3';
import type { SearchFilters, OutputLevel, AggregationParams, AggregationResult, DiffResult } from '../types/index.js';
export declare class AdvancedQueries {
    private db;
    constructor(db: Database.Database);
    /**
     * Apply advanced filters to SQL query
     */
    private buildFilterQuery;
    /**
     * Get commands with filters and output level
     */
    getFilteredCommands(filters?: SearchFilters, limit?: number, outputLevel?: OutputLevel): any[];
    /**
     * Search with advanced output levels
     */
    advancedSearch(query: string, limit?: number, outputLevel?: OutputLevel, contextLines?: number, filters?: SearchFilters): any[];
    /**
     * Get aggregations
     */
    getAggregations(params: AggregationParams): AggregationResult[];
    /**
     * Compare two command executions
     */
    compareExecutions(commandId1: number, commandId2: number): DiffResult | null;
    /**
     * Get last failures
     */
    getLastFailures(limit?: number, outputLevel?: OutputLevel, since?: string): any[];
    /**
     * Get commands similar to a given command
     */
    getSimilarCommands(commandId: number, limit?: number, outputLevel?: OutputLevel): any[];
    /**
     * Get command chain (sequential commands in same working dir)
     */
    getCommandChain(startId: number, maxCommands?: number, outputLevel?: OutputLevel): any[];
    /**
     * Helper: Get command by ID
     */
    private getCommandById;
    /**
     * Helper: Map database row to entry
     */
    private rowToEntry;
    /**
     * Helper: Map row to entry with output level
     */
    private mapRowToEntry;
}
