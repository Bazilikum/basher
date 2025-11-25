/**
 * Instance Detector - Detects if another Basher instance is already running
 *
 * This enables multiple Claude terminals to share a single Basher server instance,
 * avoiding port conflicts and resource duplication.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import logger from './logger.config.js';

export interface ExistingInstance {
  port: number;
  pid?: number;
}

export interface InstanceDetectorOptions {
  /** Base directory for .basher folder */
  basherDir: string;
  /** Timeout for health check in ms (default: 2000) */
  healthCheckTimeout?: number;
}

export class InstanceDetector {
  private basherDir: string;
  private healthCheckTimeout: number;
  private portFile: string;
  private pidFile: string;

  constructor(options: InstanceDetectorOptions) {
    this.basherDir = options.basherDir;
    this.healthCheckTimeout = options.healthCheckTimeout ?? 2000;
    this.portFile = join(this.basherDir, 'port');
    this.pidFile = join(this.basherDir, 'pid');
  }

  /**
   * Check if an existing Basher instance is running and healthy
   * Returns the instance info if found, null otherwise
   */
  async checkExistingInstance(): Promise<ExistingInstance | null> {
    // Check if port file exists
    if (!existsSync(this.portFile)) {
      logger.debug('No port file found, no existing instance');
      return null;
    }

    try {
      const portStr = readFileSync(this.portFile, 'utf-8').trim();
      const port = parseInt(portStr, 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        logger.warn({ portStr }, 'Invalid port in port file, removing stale file');
        this.cleanup();
        return null;
      }

      // Try health check
      const isHealthy = await this.healthCheck(port);

      if (isHealthy) {
        // Read PID if available
        let pid: number | undefined;
        if (existsSync(this.pidFile)) {
          try {
            pid = parseInt(readFileSync(this.pidFile, 'utf-8').trim(), 10);
          } catch {
            // Ignore PID read errors
          }
        }

        logger.info({ port, pid }, 'Found existing healthy Basher instance');
        return { port, pid };
      } else {
        logger.info({ port }, 'Port file exists but instance is not responding, cleaning up stale files');
        this.cleanup();
        return null;
      }
    } catch (error) {
      logger.error({ error }, 'Error checking for existing instance');
      return null;
    }
  }

  /**
   * Perform health check against existing instance
   */
  private async healthCheck(port: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.healthCheckTimeout);

      const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { status?: string };
        return data.status === 'ok';
      }

      return false;
    } catch (error) {
      // Connection refused, timeout, or other error means no healthy instance
      logger.debug({ port, error: String(error) }, 'Health check failed');
      return false;
    }
  }

  /**
   * Write instance files (port and PID) when becoming the primary instance
   */
  writeInstanceFiles(port: number): void {
    try {
      writeFileSync(this.portFile, port.toString(), 'utf-8');
      writeFileSync(this.pidFile, process.pid.toString(), 'utf-8');
      logger.info({ port, pid: process.pid, portFile: this.portFile }, 'Instance files written');
    } catch (error) {
      logger.error({ error }, 'Failed to write instance files');
    }
  }

  /**
   * Clean up instance files (called on shutdown or when finding stale files)
   */
  cleanup(): void {
    try {
      if (existsSync(this.portFile)) {
        unlinkSync(this.portFile);
        logger.debug('Removed port file');
      }
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile);
        logger.debug('Removed PID file');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup instance files');
    }
  }

  /**
   * Get the path to the port file
   */
  getPortFilePath(): string {
    return this.portFile;
  }

  /**
   * Get the path to the PID file
   */
  getPidFilePath(): string {
    return this.pidFile;
  }
}
