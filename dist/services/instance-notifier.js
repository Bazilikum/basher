/**
 * Instance Notifier - Enables secondary instances to notify the primary web server
 *
 * When running in client mode (secondary instance), this service sends HTTP
 * notifications to the primary instance's web server for:
 * - Command start events
 * - Command output streaming
 * - Command completion events
 * - Running process registration
 */
import logger from './logger.config.js';
export class InstanceNotifier {
    constructor(options) {
        this.enabled = true;
        const host = options.primaryHost || 'localhost';
        this.primaryUrl = `http://${host}:${options.primaryPort}`;
        this.timeout = options.timeout ?? 5000;
        this.retryAttempts = options.retryAttempts ?? 2;
        logger.info({ primaryUrl: this.primaryUrl }, 'Instance notifier initialized for secondary instance');
    }
    /**
     * Send a notification event to the primary instance
     */
    async notify(event) {
        if (!this.enabled) {
            return false;
        }
        for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                const response = await fetch(`${this.primaryUrl}/api/notify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (response.ok) {
                    logger.debug({ eventType: event.type }, 'Notification sent successfully');
                    return true;
                }
                logger.warn({ eventType: event.type, status: response.status, attempt }, 'Notification request failed');
            }
            catch (error) {
                if (attempt === this.retryAttempts) {
                    logger.error({ error: String(error), eventType: event.type }, 'Failed to send notification after all retries');
                }
                else {
                    logger.debug({ error: String(error), attempt }, 'Notification attempt failed, retrying...');
                }
            }
        }
        return false;
    }
    /**
     * Notify command started
     */
    async notifyCommandStart(processId, command, title, cwd) {
        return this.notify({
            type: 'command_start',
            processId,
            command,
            title,
            cwd,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Notify command output (for live streaming)
     * Note: This is called frequently, so we don't retry on failure
     */
    async notifyCommandOutput(processId, stream, data) {
        // Fire and forget for output streaming - don't block on failures
        this.notify({
            type: 'command_output',
            processId,
            stream,
            data,
            timestamp: new Date().toISOString(),
        }).catch(() => {
            // Silently ignore output streaming failures
        });
    }
    /**
     * Notify command completed
     */
    async notifyCommandComplete(processId, command, title, cwd, exitCode, duration, stdout, stderr, historyId) {
        return this.notify({
            type: 'command_complete',
            processId,
            command,
            title,
            cwd,
            exitCode,
            duration,
            stdout,
            stderr,
            timestamp: new Date().toISOString(),
            historyId,
        });
    }
    /**
     * Notify command terminated
     */
    async notifyCommandTerminated(processId) {
        return this.notify({
            type: 'command_terminated',
            processId,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Disable notifications (e.g., if primary becomes unavailable)
     */
    disable() {
        this.enabled = false;
        logger.info('Instance notifier disabled');
    }
    /**
     * Enable notifications
     */
    enable() {
        this.enabled = true;
        logger.info('Instance notifier enabled');
    }
    /**
     * Check if notifications are enabled
     */
    isEnabled() {
        return this.enabled;
    }
}
