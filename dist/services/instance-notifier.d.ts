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
export interface CommandStartEvent {
    type: 'command_start';
    processId: number;
    command: string;
    title: string;
    cwd: string;
    timestamp: string;
}
export interface CommandOutputEvent {
    type: 'command_output';
    processId: number;
    stream: 'stdout' | 'stderr';
    data: string;
    timestamp: string;
}
export interface CommandCompleteEvent {
    type: 'command_complete';
    processId: number;
    command: string;
    title: string;
    cwd: string;
    exitCode: number;
    duration: number;
    stdout: string;
    stderr: string;
    timestamp: string;
    historyId?: number;
}
export interface CommandTerminatedEvent {
    type: 'command_terminated';
    processId: number;
    timestamp: string;
}
export type NotifyEvent = CommandStartEvent | CommandOutputEvent | CommandCompleteEvent | CommandTerminatedEvent;
export interface InstanceNotifierOptions {
    /** Primary instance port */
    primaryPort: number;
    /** Primary instance host (default: localhost) */
    primaryHost?: string;
    /** Request timeout in ms (default: 5000) */
    timeout?: number;
    /** Retry attempts for failed requests (default: 2) */
    retryAttempts?: number;
}
export declare class InstanceNotifier {
    private primaryUrl;
    private timeout;
    private retryAttempts;
    private enabled;
    constructor(options: InstanceNotifierOptions);
    /**
     * Send a notification event to the primary instance
     */
    notify(event: NotifyEvent): Promise<boolean>;
    /**
     * Notify command started
     */
    notifyCommandStart(processId: number, command: string, title: string, cwd: string): Promise<boolean>;
    /**
     * Notify command output (for live streaming)
     * Note: This is called frequently, so we don't retry on failure
     */
    notifyCommandOutput(processId: number, stream: 'stdout' | 'stderr', data: string): Promise<void>;
    /**
     * Notify command completed
     */
    notifyCommandComplete(processId: number, command: string, title: string, cwd: string, exitCode: number, duration: number, stdout: string, stderr: string, historyId?: number): Promise<boolean>;
    /**
     * Notify command terminated
     */
    notifyCommandTerminated(processId: number): Promise<boolean>;
    /**
     * Disable notifications (e.g., if primary becomes unavailable)
     */
    disable(): void;
    /**
     * Enable notifications
     */
    enable(): void;
    /**
     * Check if notifications are enabled
     */
    isEnabled(): boolean;
}
