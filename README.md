# Basher

MCP server for executing shell commands with enhanced logging, history tracking, and improved visibility over standard bash execution.

## Features

- **Enhanced Command Execution**: Execute shell commands with real-time output streaming and per-line timestamps
- **Process Management**: Track, monitor, and terminate running commands with graceful/forced shutdown
- **Token-Efficient Querying**: 90-95% token savings with tiered output levels (summary, preview, excerpts, full)
- **Advanced Filtering**: Multi-criteria search with date ranges, exit codes, duration, patterns, and more
- **Structured Logging**: JSON-formatted logs using Pino for better observability
- **Persistent History**: SQLite database stores all command executions with FTS5 full-text search
- **Smart Search**: Full-text search across commands, stdout, and stderr with context-aware excerpts
- **Aggregations & Analytics**: Group and analyze commands by type, directory, time, or exit code
- **Output Comparison**: Diff mode to compare outputs between two command executions
- **Execution Metadata**: Track duration, exit codes, timestamps, working directories, and process IDs
- **Query Templates**: Pre-optimized queries for common patterns (failures, similar commands, command chains)
- **Web UI Dashboard**: Real-time dashboard with SSE updates, search, and statistics
- **VS Code Extension**: Fully integrated sidebar panel with native tree views and editor panes
- **Timeout Control**: Configurable timeouts for long-running commands
- **Better Error Tracking**: Detailed error categorization and logging

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Bazilikum/basher.git
cd basher
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "basher": {
      "command": "node",
      "args": ["/absolute/path/to/basher/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Replace `/absolute/path/to/basher` with the actual path to this repository.

### Standalone

Run the server directly:
```bash
npm start
```

Or in development mode:
```bash
npm run dev
```

## Web UI Dashboard

Basher includes an integrated web dashboard for viewing logs, browsing command history, and monitoring execution statistics in real-time.

### Accessing the Dashboard

When the MCP server starts, the web UI automatically launches on **http://localhost:3000**

### VS Code Extension

A fully integrated VS Code extension that brings Basher directly into your editor with native VS Code UI components.

**Features:**
- **Left Sidebar Panel**: Terminal icon in the activity bar with command history and statistics
- **Tree View**: Scrollable list of all commands with color-coded status indicators
- **Editor Integration**: Click any command to open its output in an editor pane
- **Multi-pane Support**: View multiple command outputs side-by-side
- **Real-time Updates**: SSE integration for live updates when commands execute
- **Quick Actions**: Inline buttons to rerun commands or view outputs
- **Search**: Full-text search across all command history
- **Configurable**: Auto-refresh interval, max history items, server URL

**Installation:**

1. Build the extension:
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   npm run package
   ```

2. Install the `.vsix` file in VS Code:
   - Open VS Code
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Extensions: Install from VSIX"
   - Select `vscode-extension/basher-vscode-1.0.0.vsix`

3. Use the extension:
   - Click the **terminal icon** in the left activity bar
   - Browse command history in the sidebar
   - Click any command to open its output in an editor pane
   - Use toolbar buttons to refresh, search, or open the web dashboard

See `vscode-extension/README.md` for detailed documentation.

You can customize the port using the `WEB_PORT` environment variable:

```json
{
  "mcpServers": {
    "basher": {
      "command": "node",
      "args": ["/path/to/basher/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

### Features

- **Real-time Updates**: Live command execution updates via Server-Sent Events (SSE)
- **Command History**: Browse all executed commands with exit codes, duration, and timestamps
- **Full-Text Search**: Search across commands, stdout, and stderr
- **Execution Logs**: View structured JSON logs with filtering
- **Statistics Dashboard**: See total commands, failure rates, success rates, and average duration
- **Dark Theme**: GitHub-inspired dark UI optimized for terminals

### API Endpoints

The web server exposes the following REST API endpoints:

- `GET /` - Web dashboard (HTML interface)
- `GET /api/history?limit=100` - Get recent command history
- `GET /api/search?q=query&limit=50` - Full-text search commands
- `GET /api/stats` - Get execution statistics
- `GET /api/logs?limit=100` - Get recent logs
- `GET /api/events` - Server-Sent Events for real-time updates
- `DELETE /api/history` - Clear command history
- `GET /health` - Health check endpoint

## Available Tools

### 1. execute_command

Execute a shell command with enhanced logging and automatic history tracking.

**Parameters:**
- `command` (string, required): The shell command to execute
- `cwd` (string, optional): Working directory for execution
- `stdin` (string, optional): Input to pipe to the command
- `timeout` (number, optional): Timeout in milliseconds (default: 300000ms / 5 minutes)

**Example:**
```typescript
{
  "command": "ls -la",
  "cwd": "/home/user",
  "timeout": 60000
}
```

**Returns:**
```json
{
  "command": "ls -la",
  "exitCode": 0,
  "duration": "42ms",
  "timestamp": "2025-01-17T10:30:00.000Z",
  "stdout": "...",
  "stderr": "",
  "success": true
}
```

### 2. search_command_history

Search past command executions using full-text search.

**Parameters:**
- `query` (string, required): Search query (searches command, stdout, stderr)
- `limit` (number, optional): Maximum results to return (default: 50)
- `exitCode` (number, optional): Filter by exit code

**Example:**
```typescript
{
  "query": "npm install",
  "limit": 10,
  "exitCode": 0
}
```

**Returns:**
```json
{
  "query": "npm install",
  "resultsCount": 5,
  "results": [
    {
      "id": 42,
      "command": "npm install",
      "cwd": "/home/user/project",
      "timestamp": "2025-01-17T10:30:00.000Z",
      "exitCode": 0,
      "duration": "5234ms",
      "stdoutPreview": "added 136 packages...",
      "stderrPreview": "",
      "stdoutLength": 1234,
      "stderrLength": 0
    }
  ]
}
```

### 3. get_recent_commands

Retrieve the most recent command executions.

**Parameters:**
- `limit` (number, optional): Number of commands to retrieve (default: 100)

**Example:**
```typescript
{
  "limit": 20
}
```

**Returns:**
```json
{
  "count": 20,
  "commands": [
    {
      "id": 100,
      "command": "git status",
      "cwd": "/home/user/project",
      "timestamp": "2025-01-17T10:30:00.000Z",
      "exitCode": 0,
      "duration": "123ms",
      "success": true
    }
  ]
}
```

### 4. get_command_stats

Get statistics about command execution history.

**Example:**
```typescript
{}
```

**Returns:**
```json
{
  "totalCommands": 150,
  "failedCommands": 12,
  "successRate": "92.00%",
  "averageDuration": "1234ms"
}
```

### 5. terminate_command

Terminate a running command by its process ID. Sends SIGTERM for graceful shutdown, followed by SIGKILL after 5 seconds if the process is still running.

**Parameters:**
- `processId` (number, required): The process ID of the command to terminate (returned by execute_command)

**Example:**
```typescript
{
  "processId": 12345
}
```

**Returns:**
```json
{
  "processId": 12345,
  "success": true,
  "message": "Process 12345 terminated successfully"
}
```

### 6. get_running_commands

Get a list of all currently running commands with their process IDs, command text, and duration.

**Example:**
```typescript
{}
```

**Returns:**
```json
{
  "count": 2,
  "running": [
    {
      "processId": 12345,
      "command": "npm test",
      "startTime": 1705492800000,
      "duration": "5234ms"
    }
  ]
}
```


### 7. get_process_output

Get the current output (stdout/stderr) from a running command by process ID. Essential for monitoring long-running commands and enabling AI self-monitoring. Returns the last N lines if specified, or all output.

**Parameters:**
- `processId` (number, required): The process ID of the running command (returned by execute_command)
- `lines` (number, optional): Number of last lines to retrieve from stdout/stderr. If not specified, returns all output

**Example:**
```typescript
{
  "processId": 12345,
  "lines": 50
}
```

**Returns:**
```json
{
  "processId": 12345,
  "command": "npm test",
  "status": "running",
  "duration": "5234ms",
  "stdoutLines": 234,
  "stderrLines": 12,
  "stdout": "[2025-01-18T10:30:00.000Z] Running tests...\n[2025-01-18T10:30:01.123Z] ✓ should pass test 1\n...",
  "stderr": "[2025-01-18T10:30:00.500Z] Warning: deprecated API\n..."
}
```

**Use Cases:**
- Monitor progress of long-running builds or test suites
- Check if a process is stuck or making progress  
- AI self-monitoring: periodically check output to decide next actions
- Debug hanging processes by examining recent output

### 8. advanced_search

Search command history with advanced filtering and tiered output levels for maximum token efficiency. Use `outputLevel` to control response size and save tokens.

**Parameters:**
- `query` (string, required): Search query for full-text search
- `limit` (number, optional): Maximum results (default: 50)
- `outputLevel` (string, optional): Output detail level (default: "excerpts")
  - `summary`: Metadata only, 90% token savings
  - `preview`: First/last lines of output
  - `excerpts`: Only matching lines with context, 95% token savings
  - `full`: Complete output
- `contextLines` (number, optional): Lines of context around matches for excerpts mode (default: 3)
- `filters` (object, optional): Advanced filters
  - `dateRange`: `{ from: ISO date, to: ISO date }`
  - `workingDir`: Filter by working directory
  - `commandPattern`: Glob pattern (e.g., "npm*")
  - `exitCodes`: Array of exit codes to filter
  - `minDuration`, `maxDuration`: Duration range in ms
  - `status`: "completed" | "running" | "terminated"
  - `hasStderr`: Filter commands with/without stderr

**Example:**
```typescript
{
  "query": "error",
  "limit": 10,
  "outputLevel": "excerpts",
  "contextLines": 3,
  "filters": {
    "exitCodes": [1],
    "dateRange": {
      "from": "2025-01-17T00:00:00Z"
    }
  }
}
```

**Returns:**
```json
{
  "query": "error",
  "outputLevel": "excerpts",
  "resultsCount": 3,
  "results": [
    {
      "id": 42,
      "command": "npm test",
      "cwd": "/project",
      "timestamp": "2025-01-17T10:30:00.000Z",
      "exitCode": 1,
      "duration": 1234,
      "stdoutLength": 5000,
      "stderrLength": 234,
      "excerpts": [
        {
          "stream": "stderr",
          "lineNumber": 15,
          "excerpt": "...\nError: Test failed\n...",
          "matchedText": "Error: Test failed"
        }
      ]
    }
  ]
}
```

### 9. get_aggregations

Get aggregated statistics grouped by command, directory, exit code, or time. Returns counts, averages, and success rates in a single query - much more token-efficient than multiple searches.

**Parameters:**
- `groupBy` (string, required): Group results by this field
  - `command`: Group by command text
  - `cwd`: Group by working directory
  - `exitCode`: Group by exit code
  - `hour`: Group by hour
  - `day`: Group by day
- `includeStats` (boolean, optional): Include detailed statistics (default: true)
- `limit` (number, optional): Maximum number of groups to return
- `filters` (object, optional): Apply filters before aggregation (same as advanced_search)

**Example:**
```typescript
{
  "groupBy": "command",
  "includeStats": true,
  "limit": 10
}
```

**Returns:**
```json
{
  "groupBy": "command",
  "resultsCount": 10,
  "aggregations": [
    {
      "key": "npm test",
      "count": 42,
      "avgDuration": 1234,
      "failures": 3,
      "successRate": 92.86,
      "lastExecuted": "2025-01-17T10:30:00.000Z"
    }
  ]
}
```

### 10. compare_executions

Compare output differences between two command executions. Shows added, removed, and common lines for both stdout and stderr.

**Parameters:**
- `commandId1` (number, required): First command ID
- `commandId2` (number, required): Second command ID

**Example:**
```typescript
{
  "commandId1": 42,
  "commandId2": 43
}
```

**Returns:**
```json
{
  "commandId1": 42,
  "commandId2": 43,
  "command1": "npm test",
  "command2": "npm test",
  "stdoutDiff": {
    "addedLines": 5,
    "removedLines": 2,
    "commonLines": 100,
    "added": ["line 1", "line 2"],
    "removed": ["old line"]
  },
  "stderrDiff": {
    "addedLines": 0,
    "removedLines": 0,
    "commonLines": 0,
    "added": [],
    "removed": []
  }
}
```

### 11. get_last_failures

Quick access to recent failed commands. Token-efficient alternative to searching with exitCode filter.

**Parameters:**
- `limit` (number, optional): Maximum failures to return (default: 10)
- `outputLevel` (string, optional): Output detail level (default: "summary")
- `since` (string, optional): ISO date string - only failures after this date

**Example:**
```typescript
{
  "limit": 5,
  "outputLevel": "summary"
}
```

**Returns:**
```json
{
  "outputLevel": "summary",
  "failuresCount": 5,
  "failures": [
    {
      "id": 100,
      "command": "npm test",
      "cwd": "/project",
      "timestamp": "2025-01-17T10:30:00.000Z",
      "exitCode": 1,
      "duration": 1234,
      "stdoutLength": 5000,
      "stderrLength": 234
    }
  ]
}
```

### 12. get_similar_commands

Find commands similar to a given command (same base command and working directory). Useful for tracking patterns and history.

**Parameters:**
- `commandId` (number, required): Reference command ID
- `limit` (number, optional): Maximum results (default: 10)
- `outputLevel` (string, optional): Output detail level (default: "summary")

**Example:**
```typescript
{
  "commandId": 42,
  "limit": 5,
  "outputLevel": "summary"
}
```

**Returns:**
```json
{
  "referenceCommandId": 42,
  "outputLevel": "summary",
  "similarCount": 5,
  "similar": [
    {
      "id": 40,
      "command": "npm test --watch",
      "cwd": "/project",
      "timestamp": "2025-01-17T09:30:00.000Z",
      "exitCode": 0,
      "duration": 2345,
      "stdoutLength": 4000,
      "stderrLength": 0
    }
  ]
}
```

### 13. get_command_chain

Get a sequence of commands executed in the same working directory around a specific command. Useful for understanding command context and workflows.

**Parameters:**
- `startId` (number, required): Center the chain around this command ID
- `maxCommands` (number, optional): Maximum commands in the chain (default: 10)
- `outputLevel` (string, optional): Output detail level (default: "summary")

**Example:**
```typescript
{
  "startId": 42,
  "maxCommands": 5,
  "outputLevel": "summary"
}
```

**Returns:**
```json
{
  "centerCommandId": 42,
  "outputLevel": "summary",
  "chainLength": 5,
  "chain": [
    {
      "id": 40,
      "command": "git status",
      "cwd": "/project",
      "timestamp": "2025-01-17T09:28:00.000Z",
      "exitCode": 0,
      "duration": 123,
      "stdoutLength": 234,
      "stderrLength": 0
    },
    {
      "id": 41,
      "command": "git add .",
      "cwd": "/project",
      "timestamp": "2025-01-17T09:29:00.000Z",
      "exitCode": 0,
      "duration": 456,
      "stdoutLength": 0,
      "stderrLength": 0
    }
  ]
}
```

## Token Efficiency Features

Basher is designed from the ground up for **token efficiency** when used with AI agents. Large command outputs can quickly consume your context window - these features help minimize token usage while preserving the information you need.

### Tiered Output Levels

Control the level of detail in responses to save tokens:

| Output Level | Token Savings | Use Case | What's Included |
|-------------|---------------|----------|-----------------|
| `summary` | ~90% | Quick overview, statistics | Metadata only: command, timestamp, exit code, duration, output lengths |
| `preview` | ~75% | First impression | Metadata + first/last 5 lines of output |
| `excerpts` | ~95% | Targeted debugging | Metadata + only matching lines with configurable context |
| `full` | 0% | Deep analysis | Complete stdout and stderr |

**Example savings:**
- Full output: 10,000 tokens
- Summary: 100 tokens (99% savings)
- Excerpts with 3 lines context: 500 tokens (95% savings)

### Smart Search & Filtering

Use `advanced_search` with filters to get only relevant results:

```typescript
// Instead of fetching all commands and filtering client-side:
// ❌ get_recent_commands({ limit: 1000 }) → 50,000 tokens

// Use server-side filtering:
// ✅ advanced_search with filters → 500 tokens
{
  "query": "error",
  "outputLevel": "excerpts",
  "filters": {
    "exitCodes": [1],
    "dateRange": { "from": "2025-01-17T00:00:00Z" }
  }
}
```

### Aggregations

Get statistics about many commands in a single query instead of fetching and processing individual results:

```typescript
// Instead of:
// ❌ get_recent_commands({ limit: 1000 }) → analyze → 50,000 tokens

// Use aggregations:
// ✅ get_aggregations({ groupBy: "command", includeStats: true }) → 200 tokens
```

### Query Templates

Pre-optimized queries for common use cases:

- `get_last_failures`: Quick access to recent errors without searching
- `get_similar_commands`: Find related executions without manual filtering
- `get_command_chain`: Understand command workflow context efficiently

### Best Practices for Token Efficiency

1. **Start with `summary`**: Use `summary` output level to find the right command, then request `full` output only for that specific command
2. **Use filters**: Apply server-side filters instead of fetching all results
3. **Leverage aggregations**: Get counts and statistics without fetching individual results
4. **Use excerpts for debugging**: When searching for errors, `excerpts` mode shows only relevant lines
5. **Chain queries**: Use `get_similar_commands` or `get_command_chain` to understand context without broad searches

**Example workflow (token-efficient):**
```typescript
// 1. Find failed commands (200 tokens)
get_last_failures({ limit: 10, outputLevel: "summary" })

// 2. Get details for specific failure (500 tokens)
advanced_search({
  query: "error",
  outputLevel: "excerpts",
  filters: { exitCodes: [1] }
})

// 3. Compare with successful run (300 tokens)
compare_executions({ commandId1: 42, commandId2: 40 })

// Total: ~1,000 tokens instead of 50,000+
```


## Toon Format for Extreme Token Efficiency

Basher now supports **Toon (Token-Oriented Object Notation)** - a compact format designed specifically for LLMs that achieves **~40% additional token savings** on top of existing optimization strategies.

### What is Toon?

Toon encodes uniform arrays of objects as tables rather than repetitive JSON structures:

**Standard JSON** (250+ tokens):
```json
{
  "commands": [
    {"id": 1, "command": "npm test", "exitCode": 0, "duration": 1234},
    {"id": 2, "command": "npm build", "exitCode": 0, "duration": 2345},
    {"id": 3, "command": "git status", "exitCode": 0, "duration": 123}
  ]
}
```

**Toon Format** (~100 tokens, 60% savings):
```
commands[3]{id,command,exitCode,duration}:
 1,npm test,0,1234
 2,npm build,0,2345
 3,git status,0,123
```

### When to Use Toon

✅ **Best for**: Large result sets with uniform structure  
✅ **Works best with**: `summary` output level for maximum savings  
✅ **Ideal tools**: `get_recent_commands`, `advanced_search`, `get_aggregations`  

### Cumulative Token Savings

Combining Toon with existing optimizations:

| Feature Combination | Token Savings |
|---------------------|---------------|
| Full output (JSON) | 0% (baseline) |
| Summary level (JSON) | ~90% |
| **Summary + Toon** | **~94%** (60x more efficient!) |
| Excerpts (JSON) | ~95% |
| **Excerpts + Toon** | **~97%** |

### Usage Examples

**Get recent commands in Toon format:**
```typescript
get_recent_commands({
  limit: 50,
  outputFormat: "toon"  // ← 40% fewer tokens
})
```

**Advanced search with maximum efficiency:**
```typescript
advanced_search({
  query: "npm",
  outputLevel: "summary",  // ← 90% savings
  outputFormat: "toon",    // ← +40% savings
  limit: 100
})
// Result: ~94% total token savings!
```

### Supported Tools

The following tools support the `outputFormat` parameter:

- ✅ `get_recent_commands`
- ✅ `advanced_search`
- ⏳ More tools coming soon

## Improvements Over Standard Bash Execution

| Feature | Standard Bash | Basher |
|---------|---------------|-------------------|
| Command Execution | ✅ | ✅ |
| Real-time Output | ✅ | ✅ |
| Process Management | Basic | ✅ (Track & Terminate) |
| Structured Logging | ❌ | ✅ |
| Persistent History | ❌ | ✅ (SQLite) |
| Full-Text Search | ❌ | ✅ (FTS5) |
| Advanced Filtering | ❌ | ✅ (Multi-criteria) |
| Execution Metadata | Basic | ✅ Comprehensive |
| Error Categorization | ❌ | ✅ |
| Output Searchability | ❌ | ✅ |
| Statistics & Analytics | ❌ | ✅ (Aggregations) |
| Token Efficiency | ❌ | ✅ (90-95% savings) |
| Output Comparison | ❌ | ✅ (Diff mode) |
| Web UI Dashboard | ❌ | ✅ (Real-time SSE) |
| VS Code Extension | ❌ | ✅ (Native integration) |

## Project Structure

```
basher/
├── src/
│   ├── index.ts                       # Main MCP server with all tool handlers
│   ├── services/
│   │   ├── command-executor.ts        # Command execution with timestamps
│   │   ├── history-manager.ts         # SQLite history management
│   │   ├── advanced-queries.ts        # Token-efficient query methods
│   │   ├── process-manager.ts         # Process tracking and termination
│   │   ├── logger.config.ts           # Pino logger configuration
│   │   └── web-server.ts              # Web UI server with SSE
│   ├── utils/
│   │   └── output-formatter.ts        # Output formatting utilities
│   └── types/
│       └── index.ts                   # TypeScript type definitions
├── public/
│   └── index.html                     # Web dashboard UI
├── vscode-extension/                  # VS Code extension
│   ├── src/
│   │   ├── extension.ts               # Extension entry point
│   │   └── outputPanel.ts             # Custom webview panels
│   ├── dist/                          # Compiled extension
│   ├── package.json                   # Extension manifest
│   └── README.md                      # Extension documentation
├── dist/                              # Compiled JavaScript
├── logs/                              # Log files (git-ignored)
├── data/                              # SQLite database (git-ignored)
├── test-advanced-features.mjs         # Test script for advanced features
├── package.json
├── tsconfig.json
└── README.md
```

## Logging

Logs are stored in the `logs/` directory using Pino for structured JSON logging:

- **File Output**: `logs/command-execution.log` - All logs in JSON format
- **Console Output**: Warnings and errors only, pretty-printed

Configure log level via environment variable:
```bash
export LOG_LEVEL=debug
```

Supported levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

## Database

Command history is stored in `data/command-history.db` using SQLite with the following features:

- Full-text search using FTS5
- Indexes on timestamp, command, and exit code
- Automatic cleanup of old entries (can be configured)

## Development

### Build
```bash
npm run build
```

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Watch Mode
```bash
npm run watch
```

## Environment Variables

- `LOG_LEVEL`: Logging level (default: `info`) - Options: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- `WEB_PORT`: Web UI port (default: `3000`)

## License

MIT

## Author

Bazilikum

## Future Features

See the `docs/` directory for detailed design documents on upcoming features:

- **[Sub-Stream Monitoring](docs/SUB_STREAM_MONITORING.md)**: Capture and display LLM streaming output and custom sub-streams separately from stdout/stderr (planned feature)

## Contributing

Issues and pull requests are welcome at https://github.com/Bazilikum/basher
