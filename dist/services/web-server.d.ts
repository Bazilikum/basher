/**
 * Web server for viewing logs, command history, and statistics
 * Integrated into the MCP server with real-time updates via SSE
 */
import type { HistoryManager } from './history-manager.js';
export declare class WebServer {
    private app;
    private server;
    private historyManager;
    private port;
    private sseClients;
    constructor(historyManager: HistoryManager, port?: number);
    private setupMiddleware;
    private setupRoutes;
    /**
     * Broadcast an event to all connected SSE clients
     */
    broadcast(eventType: string, data: any): void;
    /**
     * Start the web server
     */
    start(): Promise<void>;
    /**
     * Stop the web server
     */
    stop(): Promise<void>;
    /**
     * Default HTML if public/index.html doesn't exist
     */
    private getDefaultHTML;
}
