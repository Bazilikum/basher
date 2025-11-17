/**
 * Web server for viewing logs, command history, and statistics
 * Integrated into the MCP server with real-time updates via SSE
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { HistoryManager } from './history-manager.js';
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
   * Start the web server
   */
  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info({ port: this.port }, 'Web UI started');
        console.log(`\n🌐 Web UI available at: http://localhost:${this.port}\n`);
        resolve();
      });
    });
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
  <title>Command N Conquer - Dashboard</title>
</head>
<body>
  <h1>Command N Conquer Dashboard</h1>
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
