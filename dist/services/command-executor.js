/**
 * Command execution service with real-time output capture and logging
 */
import { spawn } from 'child_process';
import logger from './logger.config.js';
import { processManager } from './process-manager.js';
/**
 * Execute a shell command with enhanced logging and timeout support
 * Returns both the command result and the process ID for tracking
 * @param callbacks Optional callbacks for real-time event notifications
 */
export async function executeCommand(command, cwd, stdin, timeout, title, callbacks, timestamps = false) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timestamp = new Date().toISOString();
        const workingDir = cwd || process.cwd();
        const commandTitle = title || command;
        logger.info({
            command,
            title: commandTitle,
            cwd: workingDir,
            hasStdin: !!stdin,
            timeout: timeout || 'none',
        }, 'Starting command execution');
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let stdoutBuffer = '';
        let stderrBuffer = '';
        // Helper function to add timestamps to lines
        const addTimestamps = (text) => {
            const lines = text.split('\n');
            return lines.map(line => {
                if (line.trim()) {
                    const timestamp = new Date().toISOString();
                    return `[${timestamp}] ${line}`;
                }
                return line;
            }).join('\n');
        };
        // Parse command - use shell for proper command parsing
        const child = spawn(command, {
            cwd: workingDir,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Register process for tracking and termination (with cwd for persistence)
        const processId = processManager.register(command, child, commandTitle, workingDir);
        // Notify callback that command started (for multi-instance support)
        if (callbacks?.onStart) {
            try {
                callbacks.onStart(processId, command, commandTitle, workingDir);
            }
            catch (error) {
                logger.error({ error }, 'onStart callback failed');
            }
        }
        // Set up timeout only if specified
        let timeoutHandle;
        if (timeout) {
            timeoutHandle = setTimeout(() => {
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
        }
        // Capture stdout in real-time with timestamps
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk;
            const lines = stdoutBuffer.split('\n');
            // Keep the last incomplete line in the buffer
            stdoutBuffer = lines.pop() || '';
            // Add lines (with optional timestamps)
            for (const line of lines) {
                const outputLine = timestamps
                    ? `[${new Date().toISOString()}] ${line}\n`
                    : `${line}\n`;
                stdout += outputLine;
                // Also append to process manager for real-time monitoring
                processManager.appendStdout(processId, outputLine);
                // Notify callback for multi-instance support
                if (callbacks?.onStdout) {
                    try {
                        callbacks.onStdout(processId, outputLine);
                    }
                    catch {
                        // Ignore callback errors for output streaming
                    }
                }
            }
            logger.debug({
                stream: 'stdout',
                length: chunk.length,
                preview: chunk.substring(0, 200),
            }, 'Command stdout');
        });
        // Capture stderr in real-time with timestamps
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
            stderrBuffer += chunk;
            const lines = stderrBuffer.split('\n');
            // Keep the last incomplete line in the buffer
            stderrBuffer = lines.pop() || '';
            // Add lines (with optional timestamps)
            for (const line of lines) {
                const outputLine = timestamps
                    ? `[${new Date().toISOString()}] ${line}\n`
                    : `${line}\n`;
                stderr += outputLine;
                // Also append to process manager for real-time monitoring
                processManager.appendStderr(processId, outputLine);
                // Notify callback for multi-instance support
                if (callbacks?.onStderr) {
                    try {
                        callbacks.onStderr(processId, outputLine);
                    }
                    catch {
                        // Ignore callback errors for output streaming
                    }
                }
            }
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
            }
            catch (error) {
                logger.error({ error }, 'Failed to write stdin');
            }
        }
        // Handle process errors
        child.on('error', (error) => {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
            logger.error({
                error: error.message,
                command,
                code: error.code,
            }, 'Command execution error');
            reject(error);
        });
        // Handle process completion
        child.on('close', (exitCode) => {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
            const duration = Date.now() - startTime;
            // Flush any remaining buffered content (with optional timestamps)
            if (stdoutBuffer) {
                stdout += timestamps
                    ? `[${new Date().toISOString()}] ${stdoutBuffer}\n`
                    : `${stdoutBuffer}\n`;
            }
            if (stderrBuffer) {
                stderr += timestamps
                    ? `[${new Date().toISOString()}] ${stderrBuffer}\n`
                    : `${stderrBuffer}\n`;
            }
            const result = {
                stdout,
                stderr,
                exitCode: exitCode ?? (timedOut ? 124 : 1), // 124 is timeout exit code
                duration,
                timestamp,
                processId,
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
