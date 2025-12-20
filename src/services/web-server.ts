/**
 * Web server for viewing logs, command history, and statistics
 * Integrated into the MCP server with real-time updates via SSE
 *
 * SECURITY: This server is designed for localhost-only access.
 * All requests must originate from localhost (127.0.0.1 or ::1).
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';
import { homedir, tmpdir } from 'os';
import type { HistoryManager } from './history-manager.js';
import { executeCommand } from './command-executor.js';
import { processManager } from './process-manager.js';
import logger from './logger.config.js';

/**
 * Server entry for tracking multiple running web server instances
 */
interface ServerEntry {
  port: number;
  pid: number;
  startTime: string;
  cwd: string;
}

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

/**
 * Middleware to ensure requests only come from localhost.
 * Rejects all non-localhost connections with 403 Forbidden.
 */
function localhostOnly(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || '';
  const localAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

  if (localAddresses.includes(ip)) {
    next();
  } else {
    logger.warn({ ip, path: req.path }, 'Rejected non-localhost request');
    res.status(403).json({
      success: false,
      error: 'Access denied: localhost connections only'
    });
  }
}

/**
 * General rate limiter for all API endpoints
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for command execution
 */
const executeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 command executions per minute
  message: { success: false, error: 'Too many command executions, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict limiter for destructive operations
 */
const destructiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 destructive operations per minute
  message: { success: false, error: 'Too many destructive operations' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// INPUT VALIDATION SCHEMAS
// ============================================================================

const executeCommandWebSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty').max(10000),
  cwd: z.string().max(1000).optional(),
  stdin: z.string().optional(),
  timeout: z.number().positive().optional(),
  background: z.boolean().optional().default(true),
  title: z.string().max(500).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(1000),
  limit: z.coerce.number().int().positive().max(1000).optional().default(50),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const processIdParamSchema = z.object({
  processId: z.coerce.number().int().positive(),
});

/**
 * Validation middleware for request body
 */
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      }
      next(error);
    }
  };
}

/**
 * Validation middleware for URL parameters
 */
function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL parameters',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      }
      next(error);
    }
  };
}

// Read package.json for version info
const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Remote running process (from secondary instances)
 */
interface RemoteProcess {
  processId: number;
  command: string;
  title: string;
  cwd: string;
  startTime: number;
  stdout: string;
  stderr: string;
  instanceId?: string;
}

export class WebServer {
  private app: express.Application;
  private server: any;
  private historyManager: HistoryManager;
  private port: number;
  private sseClients: Response[] = [];
  /** Track running processes from secondary instances */
  private remoteProcesses: Map<number, RemoteProcess> = new Map();

  constructor(historyManager: HistoryManager, port: number = 3000) {
    this.app = express();
    this.historyManager = historyManager;
    this.port = port;

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // ========================================================================
    // SECURITY MIDDLEWARE CHAIN (order matters!)
    // ========================================================================

    // 1. Localhost-only access (first line of defense)
    this.app.use(localhostOnly);

    // 2. Security headers (helmet)
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],  // Needed for inline scripts in index.html
          scriptSrcAttr: ["'unsafe-inline'"],        // Needed for onclick handlers
          styleSrc: ["'self'", "'unsafe-inline'"],   // Needed for inline styles
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        }
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
      hsts: false, // Disable HSTS for localhost HTTP
    }));

    // 3. Rate limiting for API endpoints
    this.app.use('/api/', generalLimiter);

    // 4. CORS: Only allow localhost origins
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, curl, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }
        // Allow localhost on any port
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        logger.warn({ origin }, 'CORS rejected origin');
        callback(new Error('CORS not allowed for this origin'));
      },
      credentials: true,
    }));

    // 5. Body parsing with size limits
    this.app.use(express.json({ limit: '10mb' }));

    // 6. Serve static files from the public directory relative to this module
    // __dirname in CommonJS after compilation points to dist/services/
    // So we need to go up two levels to reach the project root, then into public/
    const publicPath = join(__dirname, '..', '..', 'public');
    this.app.use(express.static(publicPath));

    logger.info('Security middleware initialized: localhost-only, helmet, rate-limiting, CORS restricted');
  }

  private setupRoutes(): void {
    // Main dashboard
    this.app.get('/', (req: Request, res: Response) => {
      // Look for index.html relative to this module's location
      const htmlPath = join(__dirname, '..', '..', 'public', 'index.html');
      logger.debug({ __dirname, htmlPath, exists: existsSync(htmlPath) }, 'Checking for index.html');

      if (existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.send(this.getDefaultHTML());
      }
    });

    // API: Get version
    this.app.get('/api/version', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          name: packageJson.name,
          version: packageJson.version,
          description: packageJson.description
        }
      });
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        version: packageJson.version,
        timestamp: new Date().toISOString()
      });
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

    // API: Get command by ID
    this.app.get('/api/history/:id', (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: 'Invalid command ID' });
        }

        const command = this.historyManager.getCommandById(id);

        if (!command) {
          return res.status(404).json({ success: false, error: 'Command not found' });
        }

        res.json({ success: true, data: command });
      } catch (error) {
        logger.error({ error, id: req.params.id }, 'Failed to fetch command by ID');
        res.status(500).json({ success: false, error: 'Failed to fetch command' });
      }
    });

    // API: Get command by process ID (for looking up completed background commands)
    this.app.get('/api/command/by-process/:processId', (req: Request, res: Response) => {
      try {
        const processId = parseInt(req.params.processId);

        if (isNaN(processId)) {
          return res.status(400).json({ success: false, error: 'Invalid process ID' });
        }

        const command = this.historyManager.getCommandByProcessId(processId);

        if (!command) {
          return res.status(404).json({ success: false, error: 'Command not found for this process ID' });
        }

        res.json({ success: true, data: command });
      } catch (error) {
        logger.error({ error, processId: req.params.processId }, 'Failed to fetch command by process ID');
        res.status(500).json({ success: false, error: 'Failed to fetch command' });
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

    // API: Clear history (destructive - stricter rate limit)
    this.app.delete('/api/history', destructiveLimiter, (req: Request, res: Response) => {
      try {
        this.historyManager.clearHistory();

        // Broadcast to SSE clients
        this.broadcast('history_cleared', {});

        res.json({
          success: true,
          message: 'Command history cleared successfully'
        });
      } catch (error) {
        logger.error({ error }, 'Failed to clear history');
        res.status(500).json({ success: false, error: 'Failed to clear history' });
      }
    });

    // API: Execute command (stricter rate limit + validation)
    this.app.post('/api/execute', executeLimiter, validateBody(executeCommandWebSchema), async (req: Request, res: Response) => {
      try {
        const { command, cwd, stdin, timeout, background, title } = req.body;

        const commandTitle = title || command;

        logger.info({
          command,
          title: commandTitle,
          cwd,
          timeout,
          background,
          version: 'v2.1-background-default-with-titles',
          timestamp: new Date().toISOString()
        }, 'Executing command via web API - VERSION 2.1 WITH BACKGROUND DEFAULT AND TITLES');

        // If background mode (default), return immediately with processId
        if (background) {
          // Execute in background (don't await)
          executeCommand(
            command,
            cwd || process.cwd(),
            stdin,
            timeout,
            commandTitle
          ).then(result => {
            // Save to history when complete
            const historyEntry = {
              command,
              title: commandTitle,
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

            // IMPORTANT: Unregister from processManager AFTER saving to history
            // This ensures VS Code extension can find the command in history when it polls
            processManager.unregister(result.processId);

            // Broadcast to SSE clients
            this.broadcast('command_executed', { ...historyEntry, id });
          }).catch(error => {
            logger.error({ error, command }, 'Background command failed');
          });

          // Return immediately
          return res.json({
            success: true,
            background: true,
            message: 'Command started in background',
            command,
            title: commandTitle
          });
        }

        // Synchronous execution (original behavior)
        const result = await executeCommand(
          command,
          cwd || process.cwd(),
          stdin,
          timeout,
          commandTitle
        );

        // Save to history
        const historyEntry = {
          command,
          title: commandTitle,
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

        // IMPORTANT: Unregister from processManager AFTER saving to history
        processManager.unregister(result.processId);

        // Broadcast to SSE clients
        this.broadcast('command_executed', { ...historyEntry, id });

        res.json({
          success: true,
          data: {
            id,
            command,
            title: commandTitle,
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

    // API: Terminate/kill a running command (destructive - stricter rate limit + validation)
    this.app.post('/api/terminate/:processId', destructiveLimiter, validateParams(processIdParamSchema), (req: Request, res: Response) => {
      try {
        const processId = parseInt(req.params.processId);

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

    // API: Get running commands (includes both local and remote processes)
    this.app.get('/api/running', (req: Request, res: Response) => {
      try {
        const localRunning = processManager.getRunning();
        const now = Date.now();

        // Combine local and remote running processes
        const remoteRunning = Array.from(this.remoteProcesses.values()).map((proc) => ({
          id: proc.processId,
          pid: proc.processId, // Use processId as pid for remote
          command: proc.command,
          title: proc.title,
          duration: now - proc.startTime,
          remote: true,
        }));

        const allRunning = [
          ...localRunning.map((r) => ({ ...r, remote: false })),
          ...remoteRunning,
        ];

        res.json({ success: true, data: allRunning });
      } catch (error: any) {
        logger.error({ error }, 'Failed to get running commands');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Get output from a running process (supports both local and remote)
    this.app.get('/api/process/:processId/output', (req: Request, res: Response) => {
      try {
        const processId = parseInt(req.params.processId);

        if (isNaN(processId)) {
          return res.status(400).json({ success: false, error: 'Invalid process ID' });
        }

        const lines = req.query.lines ? parseInt(req.query.lines as string) : undefined;

        // First check local processes
        const localOutput = processManager.getOutput(processId, lines);
        if (localOutput) {
          return res.json({ success: true, data: { ...localOutput, remote: false } });
        }

        // Check remote processes
        const remoteProc = this.remoteProcesses.get(processId);
        if (remoteProc) {
          const now = Date.now();
          let stdout = remoteProc.stdout;
          let stderr = remoteProc.stderr;

          // Apply lines limit if specified
          if (lines !== undefined && lines > 0) {
            stdout = stdout.split('\n').slice(-lines).join('\n');
            stderr = stderr.split('\n').slice(-lines).join('\n');
          }

          return res.json({
            success: true,
            data: {
              processId: remoteProc.processId,
              command: remoteProc.command,
              title: remoteProc.title,
              status: 'running',
              stdout,
              stderr,
              duration: now - remoteProc.startTime,
              remote: true,
            },
          });
        }

        return res.status(404).json({
          success: false,
          error: 'Process not found or already completed'
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to get process output');
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

    // API: Receive notifications from secondary instances
    this.app.post('/api/notify', (req: Request, res: Response) => {
      try {
        const event = req.body;

        if (!event || !event.type) {
          return res.status(400).json({ success: false, error: 'Invalid event format' });
        }

        logger.debug({ eventType: event.type, processId: event.processId }, 'Received notification from secondary instance');

        switch (event.type) {
          case 'command_start':
            // Register remote process
            this.remoteProcesses.set(event.processId, {
              processId: event.processId,
              command: event.command,
              title: event.title,
              cwd: event.cwd,
              startTime: Date.now(),
              stdout: '',
              stderr: '',
            });
            // Broadcast to SSE clients
            this.broadcast('command_started', {
              processId: event.processId,
              command: event.command,
              title: event.title,
              cwd: event.cwd,
              remote: true,
            });
            break;

          case 'command_output':
            // Update remote process output
            const proc = this.remoteProcesses.get(event.processId);
            if (proc) {
              if (event.stream === 'stdout') {
                proc.stdout += event.data;
              } else {
                proc.stderr += event.data;
              }
            }
            // Broadcast output to SSE clients for live streaming
            this.broadcast('command_output', {
              processId: event.processId,
              stream: event.stream,
              data: event.data,
              remote: true,
            });
            break;

          case 'command_complete':
            // Remove from remote processes
            this.remoteProcesses.delete(event.processId);
            // Broadcast completion to SSE clients
            this.broadcast('command_executed', {
              id: event.historyId,
              command: event.command,
              title: event.title,
              cwd: event.cwd,
              exitCode: event.exitCode,
              duration: event.duration,
              stdout: event.stdout,
              stderr: event.stderr,
              timestamp: event.timestamp,
              remote: true,
            });
            break;

          case 'command_terminated':
            // Remove from remote processes
            this.remoteProcesses.delete(event.processId);
            // Broadcast termination
            this.broadcast('command_terminated', {
              processId: event.processId,
              remote: true,
            });
            break;

          default:
            logger.warn({ eventType: event.type }, 'Unknown notification event type');
        }

        res.json({ success: true });
      } catch (error) {
        logger.error({ error }, 'Failed to process notification');
        res.status(500).json({ success: false, error: 'Failed to process notification' });
      }
    });

    // ========================================================================
    // GLOBAL ERROR HANDLER (must be last middleware)
    // ========================================================================
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

      // Don't leak error details - return generic message
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
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
   * SECURITY: Only bind to localhost (127.0.0.1)
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
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Start the web server with automatic port detection
   * SECURITY: Server binds to 127.0.0.1 only (localhost)
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
      // SECURITY: Bind to localhost only - do not expose to network
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        logger.info({ port: this.port, host: '127.0.0.1' }, 'Web UI started (localhost only)');
        console.log(`\n🌐 Web UI available at: http://localhost:${this.port} (localhost only)\n`);

        // Register in servers.json for VS Code extension to discover
        this.registerServer();

        // Also write port file for backwards compatibility
        this.writePortFile();

        resolve();
      });
    });
  }

  /**
   * Write the current port to a file for the VS Code extension
   */
  private writePortFile(): void {
    const debugLog = (msg: string) => {
      try {
        const debugFile = join(tmpdir(), 'basher-port-debug.log');
        appendFileSync(debugFile, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8');
      } catch {}
    };

    try {
      debugLog('writePortFile() called');

      // Determine the project directory (MUST match logic in index.ts determineProjectPath)
      let projectPath: string;

      const argIndex = process.argv.indexOf('--project');
      debugLog(`process.argv: ${JSON.stringify(process.argv)}`);
      debugLog(`--project arg index: ${argIndex}`);

      if (argIndex !== -1 && process.argv[argIndex + 1]) {
        projectPath = resolve(process.argv[argIndex + 1]);
        debugLog(`Using --project arg: ${projectPath}`);
      } else if (process.env.BASHER_PROJECT_ROOT) {
        projectPath = resolve(process.env.BASHER_PROJECT_ROOT);
        debugLog(`Using BASHER_PROJECT_ROOT: ${projectPath}`);
      } else if (process.env.DB_PATH) {
        // For legacy DB_PATH, use the directory containing the database
        projectPath = dirname(process.env.DB_PATH);
        debugLog(`Using DB_PATH dirname: ${projectPath}`);
      } else {
        // Fallback to home directory (matches index.ts fallback)
        projectPath = homedir();
        debugLog(`Using homedir fallback: ${projectPath}`);
        logger.info('No project path specified, writing port file to home directory');
      }

      const basherDir = join(projectPath, '.basher');
      debugLog(`basherDir: ${basherDir}, exists: ${existsSync(basherDir)}`);

      if (!existsSync(basherDir)) {
        mkdirSync(basherDir, { recursive: true });
        debugLog(`Created basherDir`);
      }

      const portFile = join(basherDir, 'port');
      debugLog(`Writing port ${this.port} to: ${portFile}`);
      writeFileSync(portFile, this.port.toString(), 'utf-8');
      debugLog(`✓ Port file written successfully`);

      console.error(`[Basher] ✓ Port file written: ${portFile} (port: ${this.port})`);
      logger.info({ projectPath, portFile, port: this.port }, 'Wrote port file for VS Code extension');
    } catch (error) {
      debugLog(`✗ ERROR: ${error}`);
      console.error(`[Basher] ✗ Failed to write port file:`, error);
      logger.error({ error }, 'Failed to write port file');
    }
  }

  /**
   * Get the current port the server is running on
   */
  public getPort(): number {
    return this.port;
  }

  /**
   * Get the basher directory path
   */
  private getBasherDir(): string {
    let projectPath: string;

    const argIndex = process.argv.indexOf('--project');
    if (argIndex !== -1 && process.argv[argIndex + 1]) {
      projectPath = resolve(process.argv[argIndex + 1]);
    } else if (process.env.BASHER_PROJECT_ROOT) {
      projectPath = resolve(process.env.BASHER_PROJECT_ROOT);
    } else if (process.env.DB_PATH) {
      projectPath = dirname(process.env.DB_PATH);
    } else {
      projectPath = homedir();
    }

    return join(projectPath, '.basher');
  }

  /**
   * Register this server in the servers.json file for multi-instance tracking
   */
  private registerServer(): void {
    try {
      const basherDir = this.getBasherDir();
      if (!existsSync(basherDir)) {
        mkdirSync(basherDir, { recursive: true });
      }

      const serversFile = join(basherDir, 'servers.json');
      let servers: ServerEntry[] = [];

      // Read existing servers
      if (existsSync(serversFile)) {
        try {
          servers = JSON.parse(readFileSync(serversFile, 'utf-8'));
        } catch {
          servers = [];
        }
      }

      // Clean up stale entries (dead PIDs)
      servers = servers.filter(s => this.isProcessAlive(s.pid));

      // Add this server
      const entry: ServerEntry = {
        port: this.port,
        pid: process.pid,
        startTime: new Date().toISOString(),
        cwd: process.cwd(),
      };
      servers.push(entry);

      // Write back
      writeFileSync(serversFile, JSON.stringify(servers, null, 2), 'utf-8');
      logger.info({ port: this.port, pid: process.pid, totalServers: servers.length }, 'Registered server in servers.json');
    } catch (error) {
      logger.error({ error }, 'Failed to register server in servers.json');
    }
  }

  /**
   * Unregister this server from the servers.json file
   */
  private unregisterServer(): void {
    try {
      const basherDir = this.getBasherDir();
      const serversFile = join(basherDir, 'servers.json');

      if (!existsSync(serversFile)) {
        return;
      }

      let servers: ServerEntry[] = [];
      try {
        servers = JSON.parse(readFileSync(serversFile, 'utf-8'));
      } catch {
        return;
      }

      // Remove this server by PID
      servers = servers.filter(s => s.pid !== process.pid);

      // Write back
      writeFileSync(serversFile, JSON.stringify(servers, null, 2), 'utf-8');
      logger.info({ port: this.port, pid: process.pid, remainingServers: servers.length }, 'Unregistered server from servers.json');
    } catch (error) {
      logger.error({ error }, 'Failed to unregister server from servers.json');
    }
  }

  /**
   * Check if a process is alive by PID
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop the web server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Unregister from servers.json
      this.unregisterServer();

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
