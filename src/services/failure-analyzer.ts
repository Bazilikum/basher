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

interface ErrorPattern {
  pattern: RegExp;
  errorType: string;
  category: FailureAnalysis['category'];
  extract?: (match: RegExpMatchArray, output: string) => Partial<FailureAnalysis>;
  suggestions: string[] | ((match: RegExpMatchArray) => string[]);
}

const errorPatterns: ErrorPattern[] = [
  // Node.js / npm errors
  {
    pattern: /Cannot find module ['"](.+?)['"]/,
    errorType: 'Module not found',
    category: 'dependency',
    extract: (match) => ({
      details: [{ message: `Module '${match[1]}' not found` }],
    }),
    suggestions: (match) => [
      `Run: npm install ${match[1].replace(/^[@/]/, '')}`,
      'Check if the module name is spelled correctly',
      'Verify package.json dependencies',
    ],
  },
  {
    pattern: /ENOENT.*no such file or directory.*['"](.+?)['"]/i,
    errorType: 'File not found',
    category: 'runtime',
    extract: (match) => ({
      details: [{ message: `File not found: ${match[1]}` }],
    }),
    suggestions: (match) => [
      `Verify the file exists: ${match[1]}`,
      'Check the file path for typos',
      'Ensure the working directory is correct',
    ],
  },
  {
    pattern: /EACCES.*permission denied.*['"](.+?)['"]/i,
    errorType: 'Permission denied',
    category: 'permission',
    extract: (match) => ({
      details: [{ message: `Permission denied: ${match[1]}` }],
    }),
    suggestions: [
      'Check file/directory permissions',
      'Try running with appropriate permissions',
      'Verify you have write access to the directory',
    ],
  },
  {
    pattern: /npm ERR! code (E\w+)/,
    errorType: 'npm error',
    category: 'dependency',
    extract: (match) => ({
      details: [{ message: `npm error code: ${match[1]}` }],
    }),
    suggestions: [
      'Try: npm cache clean --force',
      'Delete node_modules and run npm install',
      'Check your npm registry configuration',
    ],
  },

  // TypeScript errors
  {
    pattern: /error TS(\d+):\s*(.+)/,
    errorType: 'TypeScript error',
    category: 'syntax',
    extract: (match, output) => {
      const fileMatch = output.match(/(.+?)\((\d+),(\d+)\):\s*error TS/);
      return {
        details: [{
          file: fileMatch?.[1],
          line: fileMatch ? parseInt(fileMatch[2]) : undefined,
          column: fileMatch ? parseInt(fileMatch[3]) : undefined,
          code: `TS${match[1]}`,
          message: match[2],
        }],
      };
    },
    suggestions: [
      'Check the TypeScript error message for details',
      'Run: npx tsc --noEmit for full type checking',
      'Verify your tsconfig.json settings',
    ],
  },

  // Python errors
  {
    pattern: /ModuleNotFoundError: No module named ['"](.+?)['"]/,
    errorType: 'Python module not found',
    category: 'dependency',
    extract: (match) => ({
      details: [{ message: `Module '${match[1]}' not found` }],
    }),
    suggestions: (match) => [
      `Run: pip install ${match[1]}`,
      'Check if virtual environment is activated',
      'Verify requirements.txt includes the module',
    ],
  },
  {
    pattern: /SyntaxError:\s*(.+)/,
    errorType: 'Python syntax error',
    category: 'syntax',
    extract: (match, output) => {
      const fileMatch = output.match(/File "(.+?)", line (\d+)/);
      return {
        details: [{
          file: fileMatch?.[1],
          line: fileMatch ? parseInt(fileMatch[2]) : undefined,
          message: match[1],
        }],
      };
    },
    suggestions: [
      'Check for missing colons, parentheses, or quotes',
      'Verify indentation is consistent',
      'Look for invalid syntax near the reported line',
    ],
  },
  {
    pattern: /IndentationError:\s*(.+)/,
    errorType: 'Python indentation error',
    category: 'syntax',
    suggestions: [
      'Check for mixed tabs and spaces',
      'Ensure consistent indentation (4 spaces recommended)',
      'Use an editor that shows whitespace',
    ],
  },

  // Git errors
  {
    pattern: /fatal: not a git repository/i,
    errorType: 'Not a git repository',
    category: 'config',
    suggestions: [
      'Run: git init',
      'Check you are in the correct directory',
      'Navigate to the repository root',
    ],
  },
  {
    pattern: /error: failed to push some refs/i,
    errorType: 'Git push failed',
    category: 'runtime',
    suggestions: [
      'Pull latest changes: git pull --rebase',
      'Check if you have push permissions',
      'Verify the remote branch exists',
    ],
  },
  {
    pattern: /CONFLICT.*Merge conflict in (.+)/,
    errorType: 'Git merge conflict',
    category: 'runtime',
    extract: (match) => ({
      details: [{ file: match[1], message: 'Merge conflict' }],
    }),
    suggestions: [
      'Resolve conflicts manually in the conflicted files',
      'Run: git status to see all conflicted files',
      'After resolving, run: git add . && git commit',
    ],
  },

  // Network errors
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/,
    errorType: 'Network error',
    category: 'network',
    suggestions: [
      'Check your internet connection',
      'Verify the server/service is running',
      'Check if a firewall is blocking the connection',
      'Try again - it might be a temporary issue',
    ],
  },
  {
    pattern: /getaddrinfo .* (.+)/,
    errorType: 'DNS resolution failed',
    category: 'network',
    extract: (match) => ({
      details: [{ message: `Could not resolve hostname: ${match[1]}` }],
    }),
    suggestions: [
      'Check if the hostname is correct',
      'Verify DNS settings',
      'Try using IP address instead',
    ],
  },

  // Memory/Resource errors
  {
    pattern: /JavaScript heap out of memory|FATAL ERROR.*heap/i,
    errorType: 'Out of memory',
    category: 'resource',
    suggestions: [
      'Increase Node.js memory: NODE_OPTIONS="--max-old-space-size=4096"',
      'Check for memory leaks in your code',
      'Process data in smaller chunks',
    ],
  },
  {
    pattern: /EMFILE.*too many open files/i,
    errorType: 'Too many open files',
    category: 'resource',
    suggestions: [
      'Increase file descriptor limit: ulimit -n 4096',
      'Close unused file handles in your code',
      'Use streaming instead of loading all files at once',
    ],
  },

  // Docker errors
  {
    pattern: /docker.*Cannot connect to the Docker daemon/i,
    errorType: 'Docker daemon not running',
    category: 'config',
    suggestions: [
      'Start Docker Desktop or docker service',
      'Run: sudo systemctl start docker (Linux)',
      'Check Docker is installed correctly',
    ],
  },
  {
    pattern: /Error response from daemon: (.+)/,
    errorType: 'Docker error',
    category: 'runtime',
    extract: (match) => ({
      details: [{ message: match[1] }],
    }),
    suggestions: [
      'Check Docker logs for more details',
      'Verify image/container exists',
      'Try: docker system prune to clean up',
    ],
  },

  // Build errors
  {
    pattern: /Build failed|Compilation failed|Error during build/i,
    errorType: 'Build failed',
    category: 'syntax',
    suggestions: [
      'Check the build output for specific errors',
      'Verify all dependencies are installed',
      'Try cleaning build cache and rebuilding',
    ],
  },

  // Test failures
  {
    pattern: /(\d+) tests? failed/i,
    errorType: 'Test failure',
    category: 'runtime',
    extract: (match) => ({
      details: [{ message: `${match[1]} test(s) failed` }],
    }),
    suggestions: [
      'Check test output for specific failures',
      'Run individual failing tests with verbose output',
      'Verify test fixtures and mocks are set up correctly',
    ],
  },

  // Generic errors
  {
    pattern: /Error: (.+)/,
    errorType: 'Error',
    category: 'unknown',
    extract: (match) => ({
      details: [{ message: match[1] }],
    }),
    suggestions: [
      'Check the error message for details',
      'Search for the error message online',
      'Check application logs for more context',
    ],
  },
];

/**
 * Analyze a command failure
 */
export function analyzeFailure(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number
): FailureAnalysis {
  const output = stdout + '\n' + stderr;

  // Default analysis
  let analysis: FailureAnalysis = {
    errorType: 'Unknown error',
    category: 'unknown',
    summary: `Command failed with exit code ${exitCode}`,
    details: [],
    suggestions: [
      'Check the command output for error messages',
      'Verify the command syntax is correct',
      'Ensure all required dependencies are available',
    ],
    searchTerms: [],
  };

  // Try each error pattern
  for (const pattern of errorPatterns) {
    const match = output.match(pattern.pattern);
    if (match) {
      const extracted = pattern.extract?.(match, output) || {};
      const suggestions = typeof pattern.suggestions === 'function'
        ? pattern.suggestions(match)
        : pattern.suggestions;

      analysis = {
        errorType: pattern.errorType,
        category: pattern.category,
        summary: extracted.details?.[0]?.message || `${pattern.errorType} detected`,
        details: extracted.details || [{ message: match[0] }],
        suggestions,
        searchTerms: [pattern.errorType, ...match.slice(1).filter(Boolean)],
        ...extracted,
      };

      // Continue checking for additional errors but keep the first match as primary
      break;
    }
  }

  // Add command-specific suggestions
  if (command.includes('npm')) {
    analysis.relatedCommands = [
      'npm cache clean --force',
      'rm -rf node_modules && npm install',
      'npm ls --depth=0',
    ];
  } else if (command.includes('git')) {
    analysis.relatedCommands = [
      'git status',
      'git log --oneline -5',
      'git remote -v',
    ];
  } else if (command.includes('docker')) {
    analysis.relatedCommands = [
      'docker ps -a',
      'docker images',
      'docker logs <container>',
    ];
  } else if (command.includes('python') || command.includes('pip')) {
    analysis.relatedCommands = [
      'pip list',
      'python --version',
      'which python',
    ];
  }

  return analysis;
}

/**
 * Get diff between two command outputs
 */
export function diffOutputs(
  stdout1: string,
  stderr1: string,
  stdout2: string,
  stderr2: string
): {
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
} {
  const diffLines = (text1: string, text2: string) => {
    const lines1 = new Set(text1.split('\n').filter(l => l.trim()));
    const lines2 = new Set(text2.split('\n').filter(l => l.trim()));

    const added: string[] = [];
    const removed: string[] = [];
    let common = 0;

    for (const line of lines2) {
      if (!lines1.has(line)) {
        added.push(line);
      } else {
        common++;
      }
    }

    for (const line of lines1) {
      if (!lines2.has(line)) {
        removed.push(line);
      }
    }

    return { added, removed, common };
  };

  const stdoutDiff = diffLines(stdout1, stdout2);
  const stderrDiff = diffLines(stderr1, stderr2);

  let summary = '';
  if (stdoutDiff.added.length > 0 || stdoutDiff.removed.length > 0) {
    summary += `stdout: +${stdoutDiff.added.length} -${stdoutDiff.removed.length} lines. `;
  }
  if (stderrDiff.added.length > 0 || stderrDiff.removed.length > 0) {
    summary += `stderr: +${stderrDiff.added.length} -${stderrDiff.removed.length} lines.`;
  }
  if (!summary) {
    summary = 'No significant differences detected.';
  }

  return { stdoutDiff, stderrDiff, summary };
}
