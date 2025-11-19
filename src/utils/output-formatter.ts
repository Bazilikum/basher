/**
 * Utilities for formatting command outputs with different levels of detail
 */

import type {
  CommandHistoryEntry,
  CommandSummary,
  CommandPreview,
  CommandWithExcerpts,
  OutputExcerpt,
  OutputLevel,
} from '../types/index.js';

/**
 * Format command based on output level
 */
export function formatCommandOutput(
  cmd: CommandHistoryEntry,
  outputLevel: OutputLevel = 'full',
  contextLines: number = 3,
  searchQuery?: string
): CommandSummary | CommandPreview | CommandWithExcerpts | CommandHistoryEntry {
  switch (outputLevel) {
    case 'summary':
      return formatSummary(cmd);
    case 'preview':
      return formatPreview(cmd);
    case 'excerpts':
      return formatExcerpts(cmd, searchQuery, contextLines);
    case 'full':
    default:
      return cmd;
  }
}

/**
 * Format as summary (minimal tokens)
 */
export function formatSummary(cmd: CommandHistoryEntry): CommandSummary {
  return {
    id: cmd.id!,
    command: cmd.command,
    cwd: cmd.cwd,
    timestamp: cmd.timestamp,
    exitCode: cmd.exitCode,
    duration: cmd.duration,
    stdoutLength: cmd.stdout?.length || 0,
    stderrLength: cmd.stderr?.length || 0,
    status: cmd.status,
    tags: cmd.tags,
  };
}

/**
 * Format as preview (summary + first/last lines)
 */
export function formatPreview(cmd: CommandHistoryEntry, previewLines: number = 5): CommandPreview {
  const summary = formatSummary(cmd);

  const stdoutLines = cmd.stdout ? cmd.stdout.split('\n') : [];
  const stderrLines = cmd.stderr ? cmd.stderr.split('\n') : [];

  return {
    ...summary,
    stdoutPreview: {
      first: stdoutLines.slice(0, previewLines),
      last: stdoutLines.length > previewLines * 2
        ? stdoutLines.slice(-previewLines)
        : [],
    },
    stderrPreview: {
      first: stderrLines.slice(0, previewLines),
      last: stderrLines.length > previewLines * 2
        ? stderrLines.slice(-previewLines)
        : [],
    },
  };
}

/**
 * Format as excerpts (only matching lines + context)
 */
export function formatExcerpts(
  cmd: CommandHistoryEntry,
  searchQuery?: string,
  contextLines: number = 3
): CommandWithExcerpts {
  const summary = formatSummary(cmd);
  const excerpts: OutputExcerpt[] = [];

  if (!searchQuery) {
    // No search query - return first few lines of each stream
    const stdoutLines = cmd.stdout ? cmd.stdout.split('\n') : [];
    const stderrLines = cmd.stderr ? cmd.stderr.split('\n') : [];

    if (stdoutLines.length > 0) {
      excerpts.push({
        stream: 'stdout',
        lineNumber: 1,
        excerpt: stdoutLines.slice(0, 10).join('\n'),
      });
    }

    if (stderrLines.length > 0) {
      excerpts.push({
        stream: 'stderr',
        lineNumber: 1,
        excerpt: stderrLines.slice(0, 10).join('\n'),
      });
    }
  } else {
    // Extract matching lines with context
    const regex = new RegExp(searchQuery, 'gi');

    // Search stdout
    if (cmd.stdout) {
      const lines = cmd.stdout.split('\n');
      const matches = findMatchingLinesWithContext(lines, regex, contextLines);
      excerpts.push(...matches.map(m => ({
        stream: 'stdout' as const,
        lineNumber: m.lineNumber,
        excerpt: m.excerpt,
        matchedText: m.matchedText,
      })));
    }

    // Search stderr
    if (cmd.stderr) {
      const lines = cmd.stderr.split('\n');
      const matches = findMatchingLinesWithContext(lines, regex, contextLines);
      excerpts.push(...matches.map(m => ({
        stream: 'stderr' as const,
        lineNumber: m.lineNumber,
        excerpt: m.excerpt,
        matchedText: m.matchedText,
      })));
    }
  }

  return {
    ...summary,
    excerpts,
  };
}

/**
 * Find matching lines with context
 */
function findMatchingLinesWithContext(
  lines: string[],
  regex: RegExp,
  contextLines: number
): Array<{ lineNumber: number; excerpt: string; matchedText: string }> {
  const results: Array<{ lineNumber: number; excerpt: string; matchedText: string }> = [];
  const matchedLineNumbers = new Set<number>();

  // Find all matching lines
  lines.forEach((line, index) => {
    if (regex.test(line)) {
      matchedLineNumbers.add(index);
    }
  });

  // For each match, extract context
  const processedRanges = new Set<string>();

  Array.from(matchedLineNumbers).forEach(matchIndex => {
    const start = Math.max(0, matchIndex - contextLines);
    const end = Math.min(lines.length - 1, matchIndex + contextLines);
    const rangeKey = `${start}-${end}`;

    // Skip if we've already processed this range (overlapping contexts)
    if (processedRanges.has(rangeKey)) {
      return;
    }
    processedRanges.add(rangeKey);

    const contextLinesArray = lines.slice(start, end + 1);
    const excerpt = contextLinesArray.join('\n');

    results.push({
      lineNumber: matchIndex + 1, // 1-indexed
      excerpt,
      matchedText: lines[matchIndex],
    });
  });

  return results;
}

/**
 * Remove ANSI color codes and control characters
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Deduplicate consecutive identical lines
 */
export function deduplicateLines(text: string, showCount: boolean = true): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let lastLine: string | null = null;
  let count = 0;

  lines.forEach(line => {
    if (line === lastLine) {
      count++;
    } else {
      if (lastLine !== null && count > 1 && showCount) {
        result[result.length - 1] += ` [repeated ${count} times]`;
      }
      result.push(line);
      lastLine = line;
      count = 1;
    }
  });

  // Handle last line
  if (count > 1 && showCount) {
    result[result.length - 1] += ` [repeated ${count} times]`;
  }

  return result.join('\n');
}

/**
 * Compress output by removing middle content
 */
export function compressOutput(
  text: string,
  maxLines: number = 100,
  keepFirst: number = 50,
  keepLast: number = 50
): string {
  const lines = text.split('\n');

  if (lines.length <= maxLines) {
    return text;
  }

  const first = lines.slice(0, keepFirst);
  const last = lines.slice(-keepLast);
  const omitted = lines.length - (keepFirst + keepLast);

  return [
    ...first,
    `\n... [${omitted} lines omitted] ...\n`,
    ...last,
  ].join('\n');
}

/**
 * Simple diff between two strings
 */
export function diffLines(text1: string, text2: string): {
  added: string[];
  removed: string[];
  common: number;
} {
  const lines1 = new Set(text1.split('\n'));
  const lines2 = new Set(text2.split('\n'));

  const added: string[] = [];
  const removed: string[] = [];
  let common = 0;

  lines2.forEach(line => {
    if (!lines1.has(line)) {
      added.push(line);
    } else {
      common++;
    }
  });

  lines1.forEach(line => {
    if (!lines2.has(line)) {
      removed.push(line);
    }
  });

  return { added, removed, common };
}
