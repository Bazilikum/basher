/**
 * Output Parser Service
 * Parses command output into structured data for common tools
 */
export interface ParsedOutput {
    type: string;
    success: boolean;
    summary: string;
    data: Record<string, any>;
    errors: string[];
    warnings: string[];
}
export interface JestResult extends ParsedOutput {
    type: 'jest';
    data: {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
        duration?: string;
        failedTests: string[];
        coverage?: {
            lines?: number;
            statements?: number;
            branches?: number;
            functions?: number;
        };
    };
}
export interface TypeScriptResult extends ParsedOutput {
    type: 'typescript';
    data: {
        errorCount: number;
        warningCount: number;
        files: Array<{
            file: string;
            line: number;
            column: number;
            code: string;
            message: string;
            severity: 'error' | 'warning';
        }>;
    };
}
export interface ESLintResult extends ParsedOutput {
    type: 'eslint';
    data: {
        errorCount: number;
        warningCount: number;
        fixableCount: number;
        files: Array<{
            file: string;
            line: number;
            column: number;
            rule: string;
            message: string;
            severity: 'error' | 'warning';
        }>;
    };
}
export interface PytestResult extends ParsedOutput {
    type: 'pytest';
    data: {
        passed: number;
        failed: number;
        skipped: number;
        errors: number;
        duration?: string;
        failedTests: string[];
    };
}
export interface JsonResult extends ParsedOutput {
    type: 'json';
    data: {
        parsed: any;
        valid: boolean;
    };
}
export interface GenericResult extends ParsedOutput {
    type: 'generic';
    data: {
        lineCount: number;
        hasErrors: boolean;
        lastLines: string[];
    };
}
export type ParserType = 'jest' | 'pytest' | 'eslint' | 'tsc' | 'typescript' | 'json' | 'generic' | 'auto';
/**
 * Parse command output based on parser type
 */
export declare function parseOutput(stdout: string, stderr: string, exitCode: number, parserType?: ParserType, command?: string): ParsedOutput;
/**
 * Get smart summary of output (errors, warnings, key info)
 */
export declare function getSmartSummary(stdout: string, stderr: string, exitCode: number, maxLines?: number): {
    status: 'success' | 'warning' | 'error';
    errors: string[];
    warnings: string[];
    keyLines: string[];
    lastLines: string[];
    stats: {
        totalLines: number;
        errorCount: number;
        warningCount: number;
    };
};
/**
 * Estimate token count for text (rough approximation)
 * ~4 characters per token for English text
 */
export declare function estimateTokens(text: string): number;
/**
 * Interpret exit code
 */
export declare function interpretExitCode(exitCode: number): {
    code: number;
    signal?: string;
    meaning: string;
    category: 'success' | 'error' | 'signal' | 'unknown';
};
/**
 * Track progress from output
 */
export declare function trackProgress(output: string): {
    detected: boolean;
    percent?: number;
    current?: number;
    total?: number;
    stage?: string;
    eta?: string;
};
