/**
 * Command Sessions Service
 * Group related commands into sessions for better organization
 */
import Database from 'better-sqlite3';
export interface CommandSession {
    id: number;
    name: string;
    description?: string;
    status: 'active' | 'completed' | 'abandoned';
    startedAt: string;
    endedAt?: string;
    commandCount: number;
    metadata?: Record<string, any>;
}
export interface SessionCommand {
    sessionId: number;
    commandId: number;
    addedAt: string;
}
export declare class CommandSessionManager {
    private db;
    private activeSessionId;
    constructor(db: Database.Database);
    private initializeTables;
    /**
     * Start a new session
     */
    startSession(name: string, description?: string, metadata?: Record<string, any>): CommandSession;
    /**
     * End the current active session
     */
    endSession(status?: 'completed' | 'abandoned'): CommandSession | null;
    /**
     * Get current active session
     */
    getActiveSession(): CommandSession | null;
    /**
     * Get active session ID (for adding commands)
     */
    getActiveSessionId(): number | null;
    /**
     * Add a command to the active session
     */
    addCommandToSession(commandId: number, sessionId?: number): boolean;
    /**
     * Get a session by ID
     */
    getSession(id: number): CommandSession | null;
    /**
     * Get a session by name (most recent)
     */
    getSessionByName(name: string): CommandSession | null;
    /**
     * List all sessions
     */
    listSessions(status?: 'active' | 'completed' | 'abandoned', limit?: number): CommandSession[];
    /**
     * Get all command IDs in a session
     */
    getSessionCommandIds(sessionId: number): number[];
    /**
     * Delete a session and its command associations
     */
    deleteSession(id: number): boolean;
    /**
     * Resume a session (set it as active)
     */
    resumeSession(id: number): CommandSession | null;
    private rowToSession;
}
