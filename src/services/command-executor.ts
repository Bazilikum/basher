/**
 * Command execution service with real-time output capture and logging
 */

import { spawn } from 'child_process';
import type { CommandResult } from '../types/index.js';
import logger from './logger.config.js';

/**
 * Execute a shell command with enhanced logging and timeout support
 */
export async function executeCommand(
  command: string,
  cwd?: string,
  stdin?: string,
  timeout: number = 300000 // 5 minutes default
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const workingDir = cwd || process.cwd();

    logger.info({
      command,
      cwd: workingDir,
      hasStdin: !!stdin,
      timeout,
    }, 'Starting command execution');

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Parse command - use shell for proper command parsing
    const child = spawn(command, {
      cwd: workingDir,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      logger.warn({ command, timeout }, 'Command execution timed out');

      // Force kill after 5 more seconds if still running
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
          logger.error({ command }, 'Command force killed after timeout');
        }
      }, 5000);
    }, timeout);

    // Capture stdout in real-time
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      logger.debug({
        stream: 'stdout',
        length: chunk.length,
        preview: chunk.substring(0, 200),
      }, 'Command stdout');
    });

    // Capture stderr in real-time
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      logger.debug({
        stream: 'stderr',
        length: chunk.length,
        preview: chunk.substring(0, 200),
      }, 'Command stderr');
    });

    // Write stdin if provided
    if (stdin) {
      try {
        child.stdin.write(stdin);
        child.stdin.end();
        logger.debug({ stdinLength: stdin.length }, 'Stdin written to command');
      } catch (error) {
        logger.error({ error }, 'Failed to write stdin');
      }
    }

    // Handle process errors
    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      logger.error({
        error: error.message,
        command,
        code: (error as any).code,
      }, 'Command execution error');
      reject(error);
    });

    // Handle process completion
    child.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);
      const duration = Date.now() - startTime;

      const result: CommandResult = {
        stdout,
        stderr,
        exitCode: exitCode ?? (timedOut ? 124 : 1), // 124 is timeout exit code
        duration,
        timestamp,
      };

      logger.info({
        command,
        exitCode: result.exitCode,
        duration,
        stdoutLines: stdout.split('\n').length,
        stderrLines: stderr.split('\n').length,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
        timedOut,
      }, 'Command execution completed');

      if (result.exitCode !== 0) {
        logger.warn({
          command,
          exitCode: result.exitCode,
          stderr: stderr.substring(0, 500),
        }, 'Command failed with non-zero exit code');
      }

      resolve(result);
    });
  });
}
