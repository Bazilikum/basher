/**
 * Instance Detector - Detects if another Basher instance is already running
 *
 * This enables multiple Claude terminals to share a single Basher server instance,
 * avoiding port conflicts and resource duplication.
 */
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
export declare class InstanceDetector {
    private basherDir;
    private healthCheckTimeout;
    private portFile;
    private pidFile;
    constructor(options: InstanceDetectorOptions);
    /**
     * Check if an existing Basher instance is running and healthy
     * Returns the instance info if found, null otherwise
     */
    checkExistingInstance(): Promise<ExistingInstance | null>;
    /**
     * Perform health check against existing instance
     */
    private healthCheck;
    /**
     * Write instance files (port and PID) when becoming the primary instance
     */
    writeInstanceFiles(port: number): void;
    /**
     * Clean up instance files (called on shutdown or when finding stale files)
     */
    cleanup(): void;
    /**
     * Get the path to the port file
     */
    getPortFilePath(): string;
    /**
     * Get the path to the PID file
     */
    getPidFilePath(): string;
}
