/**
 * Logger configuration using Pino
 * Provides structured JSON logging with file and console outputs
 */

import pino from 'pino';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Ensure logs directory exists
const logsDir = join(process.cwd(), 'logs');
try {
  mkdirSync(logsDir, { recursive: true });
} catch (error) {
  // Directory already exists, ignore
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      // File output - structured JSON
      {
        target: 'pino/file',
        level: 'debug',
        options: {
          destination: join(logsDir, 'command-execution.log'),
          mkdir: true,
        },
      },
      // Console output - pretty printed (only for errors and warnings)
      {
        target: 'pino-pretty',
        level: 'warn',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    ],
  },
});

export default logger;
