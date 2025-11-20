/**
 * Web server for viewing logs, command history, and statistics
 * Integrated into the MCP server with real-time updates via SSE
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createServer } from 'net';
import type { HistoryManager } from './history-manager.js';
import { executeCommand } from './command-executor.js';
import { processManager } from './process-manager.js';
import logger from './logger.config.js';

export class WebServer {
  private app: express.Application;
  private server: any;
  private historyManager: HistoryManager;
  private port: number;
  private sseClients: Response[] = [];

  constructor(historyManager: HistoryManager, port: number = 3000) {
    this.app = express();
    this.historyManager = historyManager;
    this.port = port;

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(join(process.cwd(), 'public')));
  }

  private setupRoutes(): void {
    // Main dashboard
    this.app.get('/', (req: Request, res: Response) => {
      const htmlPath = join(process.cwd(), 'public', 'index.html');
      if (existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.send(this.getDefaultHTML());
      }
    });

    // API: Get command history
    this.app.get('/api/history', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const history = this.historyManager.getRecentHistory(limit);
        res.json({ success: true, data: history });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch history');
        res.status(500).json({ success: false, error: 'Failed to fetch history' });
      }
    });

    // API: Search command history
    this.app.get('/api/search', (req: Request, res: Response) => {
      try {
        const query = req.query.q as string;
        if (!query) {
          return res.status(400).json({ success: false, error: 'Query parameter required' });
        }
        const limit = parseInt(req.query.limit as string) || 50;
        const results = this.historyManager.searchHistory(query, limit);
        res.json({ success: true, data: results });
      } catch (error) {
        logger.error({ error }, 'Failed to search history');
        res.status(500).json({ success: false, error: 'Failed to search history' });
      }
    });

    // API: Get statistics
    this.app.get('/api/stats', (req: Request, res: Response) => {
      try {
        const stats = this.historyManager.getStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch stats');
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
      }
    });

    // API: Get logs
    this.app.get('/api/logs', (req: Request, res: Response) => {
      try {
        const logPath = join(process.cwd(), 'logs', 'command-execution.log');
        if (!existsSync(logPath)) {
          return res.json({ success: true, data: [] });
        }

        const limit = parseInt(req.query.limit as string) || 100;
        const logContent = readFileSync(logPath, 'utf-8');
        const lines = logContent.trim().split('\n').slice(-limit);
        const logs = lines
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(log => log !== null)
          .reverse();

        res.json({ success: true, data: logs });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch logs');
        res.status(500).json({ success: false, error: 'Failed to fetch logs' });
      }
    });

    // API: Clear history
    this.app.delete('/api/history', (req: Request, res: Response) => {
      try {
        // This would require adding a clearHistory method to HistoryManager
        // For now, just return a message
        res.json({
          success: true,
          message: 'History clearing not yet implemented. Restart server to clear in-memory cache.'
        });
      } catch (error) {
        logger.error({ error }, 'Failed to clear history');
        res.status(500).json({ success: false, error: 'Failed to clear history' });
      }
    });

    // API: Execute command
    this.app.post('/api/execute', async (req: Request, res: Response) => {
      try {
        const { command, cwd, stdin, timeout } = req.body;

        if (!command) {
          return res.status(400).json({ success: false, error: 'Command is required' });
        }

        logger.info({ command, cwd, timeout }, 'Executing command via web API');

        // Execute the command
        const result = await executeCommand(
          command,
          cwd || process.cwd(),
          stdin,
          timeout || 300000
        );

        // Save to history
        const historyEntry = {
          command,
          cwd: cwd || process.cwd(),
          timestamp: result.timestamp,
          exitCode: result.exitCode,
          duration: result.duration,
          stdout: result.stdout,
          stderr: result.stderr,
          processId: result.processId,
          status: 'completed',
        };
        const id = this.historyManager.saveCommand(historyEntry);

        // Broadcast to SSE clients
        this.broadcast('command_executed', { ...historyEntry, id });

        res.json({
          success: true,
          data: {
            id,
            command,
            exitCode: result.exitCode,
            duration: result.duration,
            timestamp: result.timestamp,
            stdout: result.stdout,
            stderr: result.stderr,
          }
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to execute command');
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to execute command'
        });
      }
    });

    // API: Terminate/kill a running command
    this.app.post('/api/terminate/:processId', (req: Request, res: Response) => {
      try {
        const processId = parseInt(req.params.processId);

        if (isNaN(processId)) {
          return res.status(400).json({ success: false, error: 'Invalid process ID' });
        }

        logger.info({ processId }, 'Terminating command via web API');

        const success = processManager.kill(processId);

        if (success) {
          // Broadcast termination event
          this.broadcast('command_terminated', { processId });

          res.json({
            success: true,
            message: `Process ${processId} terminated`
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Process not found or already completed'
          });
        }
      } catch (error: any) {
        logger.error({ error }, 'Failed to terminate command');
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to terminate command'
        });
      }
    });

    // API: Get running commands
    this.app.get('/api/running', (req: Request, res: Response) => {
      try {
        const running = processManager.getRunning();
        res.json({ success: true, data: running });
      } catch (error: any) {
        logger.error({ error }, 'Failed to get running commands');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Server-Sent Events endpoint for real-time updates
    this.app.get('/api/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Add client to list
      this.sseClients.push(res);
      logger.info({ clientCount: this.sseClients.length }, 'SSE client connected');

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

      // Remove client on disconnect
      req.on('close', () => {
        this.sseClients = this.sseClients.filter(client => client !== res);
        logger.info({ clientCount: this.sseClients.length }, 'SSE client disconnected');
      });
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  /**
   * Broadcast an event to all connected SSE clients
   */
  public broadcast(eventType: string, data: any): void {
    const message = JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() });
    this.sseClients.forEach(client => {
      try {
        client.write(`data: ${message}\n\n`);
      } catch (error) {
        logger.error({ error }, 'Failed to send SSE message');
      }
    });
  }

  /**
   * Find first available port starting from given port
   * Similar to Serena's approach for handling multiple instances
   */
  private async findFreePort(startPort: number): Promise<number> {
    for (let port = startPort; port <= 65535; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No free ports found starting from ${startPort}`);
  }

  /**
   * Check if a port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '0.0.0.0');
    });
  }

  /**
   * Start the web server with automatic port detection
   */
  public async start(): Promise<void> {
    // Try to find an available port starting from the configured port
    const availablePort = await this.findFreePort(this.port);

    if (availablePort !== this.port) {
      logger.info(
        { requestedPort: this.port, assignedPort: availablePort },
        'Requested port unavailable, using next available port'
      );
      this.port = availablePort;
    }

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info({ port: this.port }, 'Web UI started');
        console.log(`\n🌐 Web UI available at: http://localhost:${this.port}\n`);
        resolve();
      });
    });
  }

  /**
   * Get the current port the server is running on
   */
  public getPort(): number {
    return this.port;
  }

  /**
   * Stop the web server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Web server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Default HTML if public/index.html doesn't exist
   */
  private getDefaultHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Basher - Dashboard</title>
</head>
<body>
  <h1>Basher Dashboard</h1>
  <p>Web UI is running, but public/index.html is missing.</p>
  <p>API endpoints are available at:</p>
  <ul>
    <li>/api/history - Command history</li>
    <li>/api/search?q=query - Search commands</li>
    <li>/api/stats - Statistics</li>
    <li>/api/logs - Recent logs</li>
    <li>/api/events - Real-time updates (SSE)</li>
  </ul>
</body>
</html>
    `;
  }
}
