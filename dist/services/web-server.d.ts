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
     * Find first available port starting from given port
     * Similar to Serena's approach for handling multiple instances
     */
    private findFreePort;
    /**
     * Check if a port is available
     */
    private isPortAvailable;
    /**
     * Start the web server with automatic port detection
     */
    start(): Promise<void>;
    /**
     * Write the current port to a file for the VS Code extension
     */
    private writePortFile;
    /**
     * Get the current port the server is running on
     */
    getPort(): number;
    /**
     * Stop the web server
     */
    stop(): Promise<void>;
    /**
     * Default HTML if public/index.html doesn't exist
     */
    private getDefaultHTML;
}
