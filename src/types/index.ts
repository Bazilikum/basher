/**
 * Type definitions for Command N Conquer MCP Server
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
}

export interface ExecuteCommandParams {
  command: string;
  cwd?: string;
  stdin?: string;
  timeout?: number;
}

export interface SearchHistoryParams {
  query: string;
  limit?: number;
  exitCode?: number;
}

export interface GetRecentCommandsParams {
  limit?: number;
}
