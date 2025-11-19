/**
 * Utilities for formatting command outputs with different levels of detail
 */
import type { CommandHistoryEntry, CommandSummary, CommandPreview, CommandWithExcerpts, OutputLevel } from '../types/index.js';
/**
 * Format command based on output level
 */
export declare function formatCommandOutput(cmd: CommandHistoryEntry, outputLevel?: OutputLevel, contextLines?: number, searchQuery?: string): CommandSummary | CommandPreview | CommandWithExcerpts | CommandHistoryEntry;
/**
 * Format as summary (minimal tokens)
 */
export declare function formatSummary(cmd: CommandHistoryEntry): CommandSummary;
/**
 * Format as preview (summary + first/last lines)
 */
export declare function formatPreview(cmd: CommandHistoryEntry, previewLines?: number): CommandPreview;
/**
 * Format as excerpts (only matching lines + context)
 */
export declare function formatExcerpts(cmd: CommandHistoryEntry, searchQuery?: string, contextLines?: number): CommandWithExcerpts;
/**
 * Remove ANSI color codes and control characters
 */
export declare function stripAnsi(text: string): string;
/**
 * Deduplicate consecutive identical lines
 */
export declare function deduplicateLines(text: string, showCount?: boolean): string;
/**
 * Compress output by removing middle content
 */
export declare function compressOutput(text: string, maxLines?: number, keepFirst?: number, keepLast?: number): string;
/**
 * Simple diff between two strings
 */
export declare function diffLines(text1: string, text2: string): {
    added: string[];
    removed: string[];
    common: number;
};
