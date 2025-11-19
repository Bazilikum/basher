/**
 * Type definitions for Basher MCP Server
 */

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timestamp: string;
}

export interface CommandHistoryEntry {
  id?: number;
  command: string;
  cwd: string;
  timestamp: string;
  exitCode: number;
  duration: number;
  stdout: string;
  stderr: string;
  processId?: number;
  status?: string;
  tags?: string[];
}

export interface ExecuteCommandParams {
  command: string;
  cwd?: string;
  stdin?: string;
  timeout?: number;
}

// Output level for tiered responses
export type OutputLevel = 'summary' | 'preview' | 'excerpts' | 'full';
export type OutputFormat = 'json' | 'toon';

// Advanced search parameters
export interface SearchHistoryParams {
  query: string;
  limit?: number;
  exitCode?: number;
  outputLevel?: OutputLevel;
  contextLines?: number;
  filters?: SearchFilters;
}

export interface SearchFilters {
  dateRange?: {
    from?: string;
    to?: string;
  };
  workingDir?: string;
  commandPattern?: string;
  exitCodes?: number[];
  minDuration?: number;
  maxDuration?: number;
  status?: 'completed' | 'running' | 'terminated';
  hasStderr?: boolean;
  hasTags?: string[];
}

export interface GetRecentCommandsParams {
  limit?: number;
  outputLevel?: OutputLevel;
  filters?: SearchFilters;
}

// Excerpt from command output
export interface OutputExcerpt {
  stream: 'stdout' | 'stderr';
  lineNumber: number;
  excerpt: string;
  matchedText?: string;
}

// Command summary (minimal tokens)
export interface CommandSummary {
  id: number;
  command: string;
  cwd: string;
  timestamp: string;
  exitCode: number;
  duration: number;
  stdoutLength: number;
  stderrLength: number;
  status?: string;
  tags?: string[];
}

// Command preview (summary + first/last lines)
export interface CommandPreview extends CommandSummary {
  stdoutPreview: {
    first: string[];
    last: string[];
  };
  stderrPreview: {
    first: string[];
    last: string[];
  };
}

// Command with excerpts (matched lines + context)
export interface CommandWithExcerpts extends CommandSummary {
  excerpts: OutputExcerpt[];
}

// Aggregation parameters
export interface AggregationParams {
  groupBy: 'command' | 'cwd' | 'exitCode' | 'hour' | 'day' | 'tag';
  includeStats?: boolean;
  filters?: SearchFilters;
  limit?: number;
}

// Aggregation result
export interface AggregationResult {
  key: string;
  count: number;
  avgDuration?: number;
  failures?: number;
  successRate?: number;
  lastExecuted?: string;
}

// Comparison/diff parameters
export interface CompareExecutionsParams {
  commandIds: number[];
  compareMode?: 'diff' | 'side-by-side';
}

// Diff result
export interface DiffResult {
  commandId1: number;
  commandId2: number;
  command1: string;
  command2: string;
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
}

// Query template params
export interface LastFailuresParams {
  limit?: number;
  outputLevel?: OutputLevel;
  since?: string;
}

export interface SimilarCommandsParams {
  commandId: number;
  limit?: number;
  outputLevel?: OutputLevel;
}

export interface CommandChainParams {
  startId: number;
  maxCommands?: number;
  outputLevel?: OutputLevel;
}
