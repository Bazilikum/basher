/**
 * Web server for viewing logs, command history, and statistics
 * Integrated into the MCP server with real-time updates via SSE
 *
 * SECURITY: This server is designed for localhost-only access.
 * All requests must originate from localhost (127.0.0.1 or ::1).
 */
import type { HistoryManager } from './history-manager.js';
export declare class WebServer {
    private app;
    private server;
    private historyManager;
    private port;
    private sseClients;
    /** Track running processes from secondary instances */
    private remoteProcesses;
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
     * SECURITY: Only bind to localhost (127.0.0.1)
     */
    private isPortAvailable;
    /**
     * Start the web server with automatic port detection
     * SECURITY: Server binds to 127.0.0.1 only (localhost)
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
     * Get the basher directory path
     */
    private getBasherDir;
    /**
     * Register this server in the servers.json file for multi-instance tracking
     */
    private registerServer;
    /**
     * Unregister this server from the servers.json file
     */
    private unregisterServer;
    /**
     * Check if a process is alive by PID
     */
    private isProcessAlive;
    /**
     * Stop the web server
     */
    stop(): Promise<void>;
    /**
     * Default HTML if public/index.html doesn't exist
     */
    private getDefaultHTML;
}
