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
 * Parse Jest test output
 */
function parseJest(stdout: string, stderr: string, exitCode: number): JestResult {
  const output = stdout + stderr;
  const errors: string[] = [];
  const warnings: string[] = [];
  const failedTests: string[] = [];

  // Parse test counts
  const testSummaryMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/i);
  const failed = testSummaryMatch?.[1] ? parseInt(testSummaryMatch[1]) : 0;
  const skipped = testSummaryMatch?.[2] ? parseInt(testSummaryMatch[2]) : 0;
  const passed = testSummaryMatch?.[3] ? parseInt(testSummaryMatch[3]) : 0;
  const total = testSummaryMatch?.[4] ? parseInt(testSummaryMatch[4]) : 0;

  // Parse duration
  const durationMatch = output.match(/Time:\s+([\d.]+\s*(?:s|ms|m))/i);
  const duration = durationMatch?.[1];

  // Parse failed test names
  const failedMatches = output.matchAll(/✕\s+(.+?)(?:\s+\(\d+\s*(?:ms|s)\))?$/gm);
  for (const match of failedMatches) {
    failedTests.push(match[1].trim());
  }

  // Also try FAIL pattern
  const failPatterns = output.matchAll(/FAIL\s+(.+\.(?:test|spec)\.[jt]sx?)/g);
  for (const match of failPatterns) {
    if (!failedTests.includes(match[1])) {
      failedTests.push(match[1]);
    }
  }

  // Parse coverage if present
  let coverage: JestResult['data']['coverage'] | undefined;
  const coverageMatch = output.match(/All files[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
  if (coverageMatch) {
    coverage = {
      statements: parseFloat(coverageMatch[1]),
      branches: parseFloat(coverageMatch[2]),
      functions: parseFloat(coverageMatch[3]),
      lines: parseFloat(coverageMatch[4]),
    };
  }

  // Extract error messages
  const errorMatches = output.matchAll(/●\s+(.+?)(?:\n\n|\n\s*expect)/gs);
  for (const match of errorMatches) {
    errors.push(match[1].trim().split('\n')[0]);
  }

  const success = exitCode === 0 && failed === 0;

  return {
    type: 'jest',
    success,
    summary: success
      ? `All ${passed} tests passed${duration ? ` in ${duration}` : ''}`
      : `${failed} of ${total} tests failed`,
    data: {
      passed,
      failed,
      skipped,
      total,
      duration,
      failedTests,
      coverage,
    },
    errors,
    warnings,
  };
}

/**
 * Parse TypeScript compiler output
 */
function parseTypeScript(stdout: string, stderr: string, exitCode: number): TypeScriptResult {
  const output = stdout + stderr;
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: TypeScriptResult['data']['files'] = [];

  // Parse TS errors: src/file.ts(10,5): error TS2304: Cannot find name 'foo'
  const errorMatches = output.matchAll(/(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)/g);
  for (const match of errorMatches) {
    const severity = match[4] as 'error' | 'warning';
    files.push({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      code: match[5],
      message: match[6],
      severity,
    });
    if (severity === 'error') {
      errors.push(`${match[1]}:${match[2]} - ${match[6]}`);
    } else {
      warnings.push(`${match[1]}:${match[2]} - ${match[6]}`);
    }
  }

  // Parse error count from summary
  const errorCountMatch = output.match(/Found (\d+) errors?/i);
  const errorCount = errorCountMatch ? parseInt(errorCountMatch[1]) : files.filter(f => f.severity === 'error').length;
  const warningCount = files.filter(f => f.severity === 'warning').length;

  const success = exitCode === 0 && errorCount === 0;

  return {
    type: 'typescript',
    success,
    summary: success
      ? 'Compilation successful'
      : `${errorCount} error(s)${warningCount ? `, ${warningCount} warning(s)` : ''}`,
    data: {
      errorCount,
      warningCount,
      files,
    },
    errors,
    warnings,
  };
}

/**
 * Parse ESLint output
 */
function parseESLint(stdout: string, stderr: string, exitCode: number): ESLintResult {
  const output = stdout + stderr;
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: ESLintResult['data']['files'] = [];

  // Parse ESLint default format: /path/file.ts
  //   10:5  error  'foo' is not defined  no-undef
  let currentFile = '';
  const lines = output.split('\n');

  for (const line of lines) {
    // Check if it's a file path
    const fileMatch = line.match(/^([\/\\].+\.[jt]sx?)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Check if it's an error/warning line
    const issueMatch = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$/);
    if (issueMatch && currentFile) {
      const severity = issueMatch[3] as 'error' | 'warning';
      files.push({
        file: currentFile,
        line: parseInt(issueMatch[1]),
        column: parseInt(issueMatch[2]),
        message: issueMatch[4],
        rule: issueMatch[5],
        severity,
      });
      const msg = `${currentFile}:${issueMatch[1]} - ${issueMatch[4]} (${issueMatch[5]})`;
      if (severity === 'error') {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // Parse summary line: ✖ 10 problems (5 errors, 5 warnings)
  const summaryMatch = output.match(/✖\s*(\d+)\s*problems?\s*\((\d+)\s*errors?,\s*(\d+)\s*warnings?\)/);
  const errorCount = summaryMatch ? parseInt(summaryMatch[2]) : files.filter(f => f.severity === 'error').length;
  const warningCount = summaryMatch ? parseInt(summaryMatch[3]) : files.filter(f => f.severity === 'warning').length;

  // Check for fixable issues
  const fixableMatch = output.match(/(\d+)\s*errors?\s*and\s*(\d+)\s*warnings?\s*potentially\s*fixable/i);
  const fixableCount = fixableMatch ? parseInt(fixableMatch[1]) + parseInt(fixableMatch[2]) : 0;

  const success = exitCode === 0 && errorCount === 0;

  return {
    type: 'eslint',
    success,
    summary: success
      ? warningCount > 0 ? `No errors, ${warningCount} warning(s)` : 'No issues found'
      : `${errorCount} error(s), ${warningCount} warning(s)`,
    data: {
      errorCount,
      warningCount,
      fixableCount,
      files,
    },
    errors,
    warnings,
  };
}

/**
 * Parse pytest output
 */
function parsePytest(stdout: string, stderr: string, exitCode: number): PytestResult {
  const output = stdout + stderr;
  const errors: string[] = [];
  const warnings: string[] = [];
  const failedTests: string[] = [];

  // Parse summary line: === 5 passed, 2 failed, 1 skipped in 1.23s ===
  const summaryMatch = output.match(/=+\s*(?:(\d+)\s+passed)?[,\s]*(?:(\d+)\s+failed)?[,\s]*(?:(\d+)\s+skipped)?[,\s]*(?:(\d+)\s+errors?)?[,\s]*(?:in\s+([\d.]+s))?\s*=+/i);

  const passed = summaryMatch?.[1] ? parseInt(summaryMatch[1]) : 0;
  const failed = summaryMatch?.[2] ? parseInt(summaryMatch[2]) : 0;
  const skipped = summaryMatch?.[3] ? parseInt(summaryMatch[3]) : 0;
  const errorCount = summaryMatch?.[4] ? parseInt(summaryMatch[4]) : 0;
  const duration = summaryMatch?.[5];

  // Parse failed test names
  const failedMatches = output.matchAll(/FAILED\s+(.+?)\s+-/g);
  for (const match of failedMatches) {
    failedTests.push(match[1].trim());
  }

  // Extract error messages
  const errorMatches = output.matchAll(/E\s+(.+)$/gm);
  for (const match of errorMatches) {
    const msg = match[1].trim();
    if (msg && !msg.startsWith('>') && !errors.includes(msg)) {
      errors.push(msg);
    }
  }

  const success = exitCode === 0 && failed === 0 && errorCount === 0;

  return {
    type: 'pytest',
    success,
    summary: success
      ? `All ${passed} tests passed${duration ? ` in ${duration}` : ''}`
      : `${failed} failed, ${errorCount} errors`,
    data: {
      passed,
      failed,
      skipped,
      errors: errorCount,
      duration,
      failedTests,
    },
    errors,
    warnings,
  };
}

/**
 * Parse JSON output
 */
function parseJson(stdout: string, stderr: string, exitCode: number): JsonResult {
  const errors: string[] = [];
  let parsed: any = null;
  let valid = false;

  try {
    // Try to find JSON in stdout
    const jsonMatch = stdout.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
      valid = true;
    }
  } catch (e) {
    errors.push(`JSON parse error: ${e}`);
  }

  return {
    type: 'json',
    success: valid && exitCode === 0,
    summary: valid ? 'Valid JSON parsed' : 'Invalid or no JSON found',
    data: {
      parsed,
      valid,
    },
    errors,
    warnings: [],
  };
}

/**
 * Generic output parser
 */
function parseGeneric(stdout: string, stderr: string, exitCode: number): GenericResult {
  const output = stdout + stderr;
  const lines = output.split('\n');
  const errors: string[] = [];
  const warnings: string[] = [];

  // Look for common error patterns
  const errorPatterns = [
    /error[:\s]/i,
    /failed/i,
    /exception/i,
    /fatal/i,
    /panic/i,
  ];

  const warningPatterns = [
    /warning[:\s]/i,
    /warn[:\s]/i,
    /deprecated/i,
  ];

  for (const line of lines) {
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        errors.push(line.trim());
        break;
      }
    }
    for (const pattern of warningPatterns) {
      if (pattern.test(line)) {
        warnings.push(line.trim());
        break;
      }
    }
  }

  const hasErrors = errors.length > 0 || exitCode !== 0;

  return {
    type: 'generic',
    success: !hasErrors,
    summary: hasErrors
      ? `${errors.length} error(s) detected`
      : `Completed successfully`,
    data: {
      lineCount: lines.length,
      hasErrors,
      lastLines: lines.slice(-10),
    },
    errors: errors.slice(0, 10), // Limit to 10 errors
    warnings: warnings.slice(0, 10),
  };
}

/**
 * Auto-detect parser type from command
 */
function detectParserType(command: string): ParserType {
  const cmd = command.toLowerCase();

  if (cmd.includes('jest') || cmd.includes('vitest') || (cmd.includes('npm') && cmd.includes('test'))) {
    return 'jest';
  }
  if (cmd.includes('pytest') || cmd.includes('python') && cmd.includes('test')) {
    return 'pytest';
  }
  if (cmd.includes('eslint') || cmd.includes('lint')) {
    return 'eslint';
  }
  if (cmd.includes('tsc') || cmd.includes('typescript') || (cmd.includes('npm') && cmd.includes('build'))) {
    return 'tsc';
  }

  return 'generic';
}

/**
 * Parse command output based on parser type
 */
export function parseOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
  parserType: ParserType = 'auto',
  command?: string
): ParsedOutput {
  const type = parserType === 'auto' && command ? detectParserType(command) : parserType;

  switch (type) {
    case 'jest':
      return parseJest(stdout, stderr, exitCode);
    case 'pytest':
      return parsePytest(stdout, stderr, exitCode);
    case 'eslint':
      return parseESLint(stdout, stderr, exitCode);
    case 'tsc':
    case 'typescript':
      return parseTypeScript(stdout, stderr, exitCode);
    case 'json':
      return parseJson(stdout, stderr, exitCode);
    default:
      return parseGeneric(stdout, stderr, exitCode);
  }
}

/**
 * Get smart summary of output (errors, warnings, key info)
 */
export function getSmartSummary(
  stdout: string,
  stderr: string,
  exitCode: number,
  maxLines: number = 20
): {
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
} {
  const output = stdout + stderr;
  const lines = output.split('\n');
  const errors: string[] = [];
  const warnings: string[] = [];
  const keyLines: string[] = [];

  const errorPatterns = [
    /^error[:\s]/i,
    /\berror\b.*:/i,
    /failed/i,
    /exception/i,
    /fatal/i,
    /cannot find/i,
    /not found/i,
    /undefined/i,
    /ENOENT/,
    /EACCES/,
  ];

  const warningPatterns = [
    /^warning[:\s]/i,
    /\bwarn\b/i,
    /deprecated/i,
  ];

  const keyPatterns = [
    /^(PASS|FAIL|OK|ERROR)/i,
    /completed/i,
    /success/i,
    /started/i,
    /listening/i,
    /ready/i,
    /built in/i,
    /\d+\s*(passed|failed|errors?)/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check errors
    for (const pattern of errorPatterns) {
      if (pattern.test(trimmed) && errors.length < 10) {
        errors.push(trimmed.slice(0, 200));
        break;
      }
    }

    // Check warnings
    for (const pattern of warningPatterns) {
      if (pattern.test(trimmed) && warnings.length < 10) {
        warnings.push(trimmed.slice(0, 200));
        break;
      }
    }

    // Check key lines
    for (const pattern of keyPatterns) {
      if (pattern.test(trimmed) && keyLines.length < 10) {
        keyLines.push(trimmed.slice(0, 200));
        break;
      }
    }
  }

  const status = exitCode !== 0 || errors.length > 0
    ? 'error'
    : warnings.length > 0
    ? 'warning'
    : 'success';

  return {
    status,
    errors,
    warnings,
    keyLines,
    lastLines: lines.slice(-maxLines).filter(l => l.trim()),
    stats: {
      totalLines: lines.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

/**
 * Estimate token count for text (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Interpret exit code
 */
export function interpretExitCode(exitCode: number): {
  code: number;
  signal?: string;
  meaning: string;
  category: 'success' | 'error' | 'signal' | 'unknown';
} {
  // Common exit codes
  const exitCodes: Record<number, { meaning: string; category: 'success' | 'error' | 'signal' }> = {
    0: { meaning: 'Success', category: 'success' },
    1: { meaning: 'General error', category: 'error' },
    2: { meaning: 'Misuse of shell command or invalid argument', category: 'error' },
    126: { meaning: 'Permission denied or command not executable', category: 'error' },
    127: { meaning: 'Command not found', category: 'error' },
    128: { meaning: 'Invalid exit argument', category: 'error' },
    // Signal-based (128 + signal number)
    129: { meaning: 'Killed by SIGHUP (hangup)', category: 'signal' },
    130: { meaning: 'Killed by SIGINT (Ctrl+C)', category: 'signal' },
    131: { meaning: 'Killed by SIGQUIT', category: 'signal' },
    134: { meaning: 'Killed by SIGABRT (abort)', category: 'signal' },
    137: { meaning: 'Killed by SIGKILL (kill -9) - likely OOM or forced termination', category: 'signal' },
    139: { meaning: 'Segmentation fault (SIGSEGV)', category: 'signal' },
    141: { meaning: 'Killed by SIGPIPE (broken pipe)', category: 'signal' },
    143: { meaning: 'Killed by SIGTERM (graceful termination)', category: 'signal' },
    // Tool-specific
    124: { meaning: 'Timeout (command timed out)', category: 'error' },
  };

  if (exitCodes[exitCode]) {
    const info = exitCodes[exitCode];
    return {
      code: exitCode,
      signal: exitCode > 128 ? getSignalName(exitCode - 128) : undefined,
      meaning: info.meaning,
      category: info.category,
    };
  }

  // Unknown exit code
  if (exitCode > 128 && exitCode < 256) {
    const signalNum = exitCode - 128;
    return {
      code: exitCode,
      signal: getSignalName(signalNum) || `Signal ${signalNum}`,
      meaning: `Killed by signal ${signalNum}`,
      category: 'signal',
    };
  }

  return {
    code: exitCode,
    meaning: `Unknown exit code ${exitCode}`,
    category: 'unknown',
  };
}

function getSignalName(signalNum: number): string | undefined {
  const signals: Record<number, string> = {
    1: 'SIGHUP',
    2: 'SIGINT',
    3: 'SIGQUIT',
    6: 'SIGABRT',
    9: 'SIGKILL',
    11: 'SIGSEGV',
    13: 'SIGPIPE',
    15: 'SIGTERM',
  };
  return signals[signalNum];
}

/**
 * Track progress from output
 */
export function trackProgress(output: string): {
  detected: boolean;
  percent?: number;
  current?: number;
  total?: number;
  stage?: string;
  eta?: string;
} {
  // Common progress patterns
  const patterns = [
    // Percentage: 50%, [50%], (50%)
    /(\d+(?:\.\d+)?)\s*%/,
    // X/Y format: 5/10, [5/10], Step 5 of 10
    /(\d+)\s*[\/of]\s*(\d+)/i,
    // Progress bars: [=====>    ] 50%
    /\[([=>#]+)([- ]*)\]/,
    // npm/yarn: (5/10)
    /\((\d+)\/(\d+)\)/,
    // ETA patterns
    /eta[:\s]+(\d+[:\d]*|\d+\s*(?:s|m|h|min|sec))/i,
  ];

  let detected = false;
  let percent: number | undefined;
  let current: number | undefined;
  let total: number | undefined;
  let stage: string | undefined;
  let eta: string | undefined;

  // Check last few lines for progress
  const lines = output.split('\n').slice(-20);

  for (const line of lines.reverse()) {
    // Percentage match
    const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch && percent === undefined) {
      percent = parseFloat(percentMatch[1]);
      detected = true;
    }

    // X/Y match
    const xyMatch = line.match(/(\d+)\s*[\/of]\s*(\d+)/i);
    if (xyMatch && current === undefined) {
      current = parseInt(xyMatch[1]);
      total = parseInt(xyMatch[2]);
      if (percent === undefined && total > 0) {
        percent = Math.round((current / total) * 100);
      }
      detected = true;
    }

    // ETA match
    const etaMatch = line.match(/eta[:\s]+(\d+[:\d]*|\d+\s*(?:s|m|h|min|sec))/i);
    if (etaMatch && eta === undefined) {
      eta = etaMatch[1];
      detected = true;
    }

    // Stage detection (common patterns)
    const stagePatterns = [
      /^(Building|Compiling|Installing|Downloading|Uploading|Testing|Processing|Loading)/i,
      /^(Step \d+)/i,
      /^(Phase \d+)/i,
    ];
    for (const pattern of stagePatterns) {
      const stageMatch = line.match(pattern);
      if (stageMatch && stage === undefined) {
        stage = stageMatch[1];
        detected = true;
        break;
      }
    }

    if (detected && percent !== undefined) break;
  }

  return { detected, percent, current, total, stage, eta };
}
