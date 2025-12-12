/**
 * Logger configuration using Pino
 * Provides structured JSON logging with file outputs
 *
 * IMPORTANT: Uses synchronous file destination for fastest possible startup.
 * This avoids worker thread initialization delays that can cause MCP reconnect failures.
 */
import pino from 'pino';
declare const logger: pino.Logger<never, boolean>;
export default logger;
