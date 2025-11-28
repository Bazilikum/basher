/**
 * Failure Analyzer Service
 * Analyzes command failures and provides suggestions
 */
export interface FailureAnalysis {
    errorType: string;
    category: 'dependency' | 'syntax' | 'runtime' | 'permission' | 'network' | 'resource' | 'config' | 'unknown';
    summary: string;
    details: {
        file?: string;
        line?: number;
        column?: number;
        code?: string;
        message: string;
    }[];
    suggestions: string[];
    relatedCommands?: string[];
    searchTerms?: string[];
}
/**
 * Analyze a command failure
 */
export declare function analyzeFailure(command: string, stdout: string, stderr: string, exitCode: number): FailureAnalysis;
/**
 * Get diff between two command outputs
 */
export declare function diffOutputs(stdout1: string, stderr1: string, stdout2: string, stderr2: string): {
    stdoutDiff: {
        added: string[];
        removed: string[];
        common: number;
    };
    stderrDiff: {
        added: string[];
        removed: string[];
        common: number;
    };
    summary: string;
};
