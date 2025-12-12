/**
 * Logger configuration using Pino
 * Provides structured JSON logging with file outputs
 *
 * IMPORTANT: Uses synchronous file destination for fastest possible startup.
 * This avoids worker thread initialization delays that can cause MCP reconnect failures.
 */

import pino from 'pino';
import { join } from 'path';
import { mkdirSync, createWriteStream } from 'fs';

// Ensure logs directory exists
const logsDir = join(process.cwd(), 'logs');
try {
  mkdirSync(logsDir, { recursive: true });
} catch {
  // Directory already exists, ignore
}

// Use synchronous pino destination for fastest startup
// Transport workers add ~50-100ms startup latency which causes MCP timeouts
const logFile = join(logsDir, 'command-execution.log');
const dest = pino.destination({ dest: logFile, sync: false, mkdir: true });

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, dest);

export default logger;
