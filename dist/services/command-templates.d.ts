/**
 * Command Templates Service
 * Store and manage reusable command templates
 */
import Database from 'better-sqlite3';
import type { ParserType } from './output-parser.js';
export interface CommandTemplate {
    name: string;
    command: string;
    title?: string;
    cwd?: string;
    timeout?: number;
    parseAs?: ParserType;
    waitFor?: string;
    waitTimeout?: number;
    retry?: {
        attempts: number;
        backoff: 'none' | 'linear' | 'exponential';
        delayMs?: number;
    };
    description?: string;
    tags?: string[];
    createdAt: string;
    updatedAt: string;
}
export interface CreateTemplateInput {
    name: string;
    command: string;
    title?: string;
    cwd?: string;
    timeout?: number;
    parseAs?: ParserType;
    waitFor?: string;
    waitTimeout?: number;
    retry?: {
        attempts: number;
        backoff?: 'none' | 'linear' | 'exponential';
        delayMs?: number;
    };
    description?: string;
    tags?: string[];
}
export declare class CommandTemplateManager {
    private db;
    constructor(db: Database.Database);
    private initializeTable;
    /**
     * Create or update a command template
     */
    save(input: CreateTemplateInput): CommandTemplate;
    /**
     * Get a template by name
     */
    get(name: string): CommandTemplate | null;
    /**
     * List all templates
     */
    list(tag?: string): CommandTemplate[];
    /**
     * Delete a template
     */
    delete(name: string): boolean;
    /**
     * Search templates by name or description
     */
    search(query: string): CommandTemplate[];
    private rowToTemplate;
}
