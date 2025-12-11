# Basher

MCP server for executing shell commands with enhanced logging, history tracking, and improved visibility over standard bash execution.

## Features

- **Enhanced Command Execution**: Execute shell commands with real-time output streaming and per-line timestamps
- **Process Management**: Track, monitor, and terminate running commands with graceful/forced shutdown
- **Token-Efficient Querying**: 90-95% token savings with tiered output levels (summary, preview, excerpts, full)
- **Advanced Filtering**: Multi-criteria search with date ranges, exit codes, duration, patterns, and more
- **Structured Logging**: JSON-formatted logs using Pino for better observability
- **Persistent History**: SQLite database stores all command executions with FTS5 full-text search and automatic cleanup
- **Smart Search**: Full-text search across commands, stdout, and stderr with context-aware excerpts
- **Aggregations & Analytics**: Group and analyze commands by type, directory, time, or exit code
- **Output Comparison**: Diff mode to compare outputs between two command executions
- **Execution Metadata**: Track duration, exit codes, timestamps, working directories, and process IDs
- **Query Templates**: Pre-optimized queries for common patterns (failures, similar commands, command chains)
- **Web UI Dashboard**: Real-time dashboard with SSE updates, search, and statistics
- **Auto Port Detection**: Automatically finds available port and writes to `.basher/port` for multi-instance support
- **Singleton Pattern**: Multiple Claude terminals share a single Basher instance - subsequent terminals detect the existing server and connect to it
- **VS Code Extension**: Fully integrated sidebar panel with live output streaming and custom titles
- **Background Execution**: Commands run asynchronously by default with instant API responses
- **Live Output Monitoring**: Watch command output in real-time with per-line timestamps
- **Timeout Control**: Configurable timeouts for long-running commands
- **Better Error Tracking**: Detailed error categorization and logging
- **Structured Output Parsing** (v1.8.0): Parse Jest, pytest, ESLint, TypeScript, and JSON output into structured data
- **Smart Output Modes** (v1.8.0): Intelligent summaries, tail mode, and token estimation
- **Command Templates** (v1.8.0): Save and reuse command configurations with retry policies
- **Command Sessions** (v1.8.0): Group related commands into sessions for better organization
- **Failure Analysis** (v1.8.0): Automatic error categorization with actionable suggestions
- **Auto-Retry** (v1.8.0): Retry failed commands with configurable backoff strategies
- **Output Diff** (v1.8.0): Auto-compare output with previous runs of the same command
- **Command Whitelisting** (v1.10.0): Security defense-in-depth requiring explicit approval for command bases
- **Security Hardening** (v1.9.0): Localhost-only binding, rate limiting, CORS restrictions, Helmet headers

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | ✅ Fully supported | Primary development platform |
| **Linux** | ✅ Fully supported | Tested on Ubuntu |
| **Windows** | ⚠️ Experimental | Commands execute via `cmd.exe`. Default whitelisted commands (`ls`, `cat`, `grep`, etc.) are Unix-specific and won't work. You'll need to whitelist Windows equivalents (`dir`, `type`, `findstr`, etc.) |

> **Note**: Basher uses Node.js `child_process.spawn` with `shell: true`, which automatically uses the system's default shell (`/bin/sh` on Unix, `cmd.exe` on Windows).

## Installation

### Quick Install (Recommended)

Install Basher directly from GitHub using Claude Code with automatic project detection:

```bash
claude mcp add --transport stdio basher --env WEB_PORT=3000 --env LOG_LEVEL=info -- npx -y github:Bazilikum/basher --project "$(pwd)"
```

This command:
- Downloads and installs Basher automatically from GitHub
- Configures it as an MCP server in Claude Code
- Automatically creates a `.basher` folder in your project directory
- Stores command history isolated per project
- Sets up the web UI (auto-detects available port starting from 3000)
- No manual cloning or building required

**Verify installation:**
```bash
claude mcp list
```

You should see `basher` in the list of configured servers.

### Manual Installation (For Development)

If you want to develop or modify Basher:

1. **Clone and build:**

```bash
git clone https://github.com/Bazilikum/basher.git
cd basher
npm install
npm run build
```

2. **Add to Claude Code:**

```bash
claude mcp add --transport stdio basher --env WEB_PORT=3000 --env LOG_LEVEL=info -- node $(pwd)/dist/index.js --project "$(pwd)"
```

### Share with Your Team

Create `.mcp.json` in your project root to share the configuration:

```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher", "--project", "${workspaceFolder}"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

**Note**: `${workspaceFolder}` will be automatically replaced with the actual project path by Claude Code.

Commit this file to version control, and your team automatically gets Basher configured with project-specific isolation when they open the project.

## Quick Start

### 1. Install VS Code Extension (Optional)

The Basher VS Code extension provides a native sidebar panel to browse command history without leaving your editor.

#### Installation

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/Bazilikum/basher/releases)
2. In VS Code: `Cmd+Shift+P` → **"Extensions: Install from VSIX..."**
3. Select the downloaded `basher-vscode-x.x.x.vsix` file

#### Features

- **Sidebar Panel**: Click the terminal icon in the activity bar
- **Command Tree View**: Browse all executed commands with status indicators
- **Running Commands Monitor**: Dedicated webview panel showing all currently executing commands:
  - Split layout displaying multiple commands simultaneously
  - Live output streaming (updates every 500ms)
  - Auto-scroll to latest output
  - Last 10 lines of stdout per command
  - Real-time duration timer
- **Custom Titles**: Commands display with human-readable titles instead of raw shell commands
- **Output Preview**: Click any command to view its full output in an editor pane with:
  - Tabbed interface (STDOUT/STDERR/METADATA)
  - Auto-scroll toggle
  - Live streaming for running commands
  - Per-line timestamps
- **Workspace Isolation**: Automatically connects to the correct Basher instance per workspace via port file detection
- **Real-time Updates**: Tree view refreshes every 1 second to show new commands
- **Quick Actions**: Rerun commands or view details with inline buttons
- **Search**: Full-text search across command history
- **Multi-pane**: Open multiple command outputs side-by-side

#### Configuration

Set these in VS Code settings (`Cmd+,`):

```json
{
  "basher.serverUrl": "http://localhost:3000",
  "basher.autoRefresh": true,
  "basher.refreshInterval": 5000,
  "basher.maxHistoryItems": 100
}
```

### 2. Access the Web UI Dashboard

Basher automatically starts a web dashboard when the MCP server runs:

**URL**: http://localhost:3000 (default starting port, auto-increments if busy)

#### Port Auto-Detection & Multi-Terminal Support

Basher uses a **singleton pattern** to support multiple Claude terminals sharing a single web server instance:

**First Terminal (Primary Instance)**:
1. Starts from `WEB_PORT` environment variable (default: 3000)
2. If that port is busy, tries the next port (3001, 3002, etc.)
3. Writes the port and PID to `.basher/port` and `.basher/pid` files
4. Starts the web server and MCP server
5. Shows: `🌐 Web UI available at: http://localhost:3000`

**Subsequent Terminals (Client Mode)**:
1. Detects existing instance via health check on the port file
2. Skips starting web server (uses existing one)
3. Starts only the MCP server (all tools work normally)
4. **Notifies primary instance** of command events via HTTP for live visibility
5. Shows: `🔗 Connected to existing Basher instance at: http://localhost:3000`

**Multi-Instance Live Visibility** (v1.6.0+):
- Secondary instances send real-time notifications to the primary's web server
- **Live streaming**: Command output is streamed to web UI as it happens
- **Running commands**: Commands from all terminals appear in `/api/running`
- **SSE broadcasts**: Web UI receives events from all instances in real-time

**Process State Persistence** (v1.8.1+):
- Running processes are persisted to `.basher/running-processes.json`
- When Basher restarts, orphaned processes are automatically adopted
- Adopted processes appear in running commands list with preserved metadata
- Enables visibility of long-running commands across context resets and breaks

**Benefits**:
- All Claude terminals share the same command history and web dashboard
- No port conflicts or resource duplication
- Web UI shows commands from all terminals in real-time (including live output)
- Running commands from any terminal visible in VS Code extension
- **Long-running commands survive Basher restarts** (v1.8.1+)
- When primary instance shuts down, instance files are cleaned up automatically
- Next terminal to start becomes the new primary instance

#### Dashboard Features

- **Real-time Command Feed**: Live updates as commands execute
- **Command History Table**: Sortable, filterable list of all executions
- **Full-Text Search**: Search across commands, stdout, and stderr
- **Statistics Panel**: Total commands, success/failure rates, average duration
- **Execution Details**: Click any command to see complete output with timestamps
- **Dark Theme**: Terminal-inspired UI optimized for developers
- **Export**: Download command history as JSON or CSV

#### API Endpoints

The web server also provides a REST API:

##### Command Execution

- `POST /api/execute` - Execute a command (background by default)
  - **Parameters**:
    - `command` (required): Shell command to execute
    - `title` (optional): Human-readable title for the command
    - `cwd` (optional): Working directory
    - `background` (optional, default: `true`): Run in background
    - `timeout` (optional): Timeout in milliseconds (no timeout by default)

  **Background Execution (default)**:
  ```bash
  curl -X POST http://localhost:3000/api/execute \
    -H "Content-Type: application/json" \
    -d '{
      "command": "npm run build",
      "title": "Building Project"
    }'
  ```
  Returns immediately with:
  ```json
  {
    "success": true,
    "background": true,
    "message": "Command started in background",
    "command": "npm run build",
    "title": "Building Project"
  }
  ```

  **Synchronous Execution**:
  ```bash
  curl -X POST http://localhost:3000/api/execute \
    -H "Content-Type: application/json" \
    -d '{
      "command": "echo hello",
      "background": false
    }'
  ```
  Waits for completion and returns full output.

##### Process Monitoring

- `GET /api/running` - List currently running commands
  ```bash
  curl http://localhost:3000/api/running
  ```
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "pid": 12345,
        "command": "npm run build",
        "title": "Building Project",
        "duration": 5000
      }
    ]
  }
  ```

- `GET /api/process/:id/output` - Get live output from running command
  ```bash
  curl http://localhost:3000/api/process/1/output
  ```
  ```json
  {
    "success": true,
    "data": {
      "processId": 1,
      "command": "npm run build",
      "title": "Building Project",
      "status": "running",
      "stdout": "Building...\nCompiling...\n",
      "stderr": "",
      "duration": 5000
    }
  }
  ```

##### History & Search

- `GET /api/history?limit=100` - Recent command history
- `GET /api/history/:id` - Get specific command by ID
- `GET /api/search?q=error` - Full-text search
- `GET /api/stats` - Execution statistics
- `GET /api/logs?limit=100` - Structured logs
- `GET /api/events` - Server-Sent Events stream
- `DELETE /api/history` - Clear all history

##### Multi-Instance Coordination

- `POST /api/notify` - Receive command events from secondary instances (used internally)
  - Event types: `command_start`, `command_output`, `command_complete`, `command_terminated`
  - Enables live visibility of commands across all Claude terminals
- `GET /api/health` - Health check endpoint (used by instance detection)

**Example**: Check statistics from the command line:
```bash
curl http://localhost:3000/api/stats
```

### 3. Start Using Basher

Once configured, Basher tools are available in your AI coding assistant:

**Example commands to try:**

```
# Execute a command
execute_command({ command: "npm test" })

# Get recent command history
get_recent_commands({ limit: 10 })

# Search for errors
advanced_search({
  query: "error",
  outputLevel: "excerpts",
  filters: { exitCodes: [1] }
})

# View last failures
get_last_failures({ limit: 5 })
```

See the **Available Tools** section below for complete documentation.

---

## Other MCP Clients

### With Cline (VS Code)

Cline uses VS Code's settings.json for MCP configuration:

1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`)
2. Search for: **"Cline: MCP Settings"**
3. Click "Edit in settings.json"
4. Add Basher configuration:

```json
{
  "cline.mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

### With Cursor IDE

Cursor stores MCP configuration in its own settings:

1. Open Cursor Settings (`Cmd+,` / `Ctrl+,`)
2. Navigate to: **Features → Model Context Protocol**
3. Add Basher configuration:

```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

### With Windsurf IDE

1. Open Windsurf Settings → MCP Servers
2. Add the same JSON configuration as Cursor above

### With Claude Desktop

Claude Desktop uses a separate configuration file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config file.

### MCP Inspector (Testing)

Test Basher tools interactively with the official MCP inspector:

```bash
npx @modelcontextprotocol/inspector npx -y github:Bazilikum/basher
```

Opens at http://localhost:5173 with a web UI to test all MCP tools without needing an AI client.

### Environment Variables

Configure Basher via environment variables in your MCP config:

```json
{
  "env": {
    "LOG_LEVEL": "debug",           // trace, debug, info, warn, error, fatal
    "WEB_PORT": "3000",              // Starting port for web UI (auto-increments if busy)
    "DB_PATH": "./custom.db",        // Custom database location (optional)
    "BASHER_MAX_ENTRIES": "1000",    // Max commands to keep (default: 1000)
    "BASHER_MAX_AGE_DAYS": "7"       // Max age in days (default: 7)
  }
}
```

#### Auto-Cleanup

Basher automatically cleans up old command history to prevent unbounded database growth. Cleanup runs on startup and after each command execution.

- **By count**: Keeps only the most recent N commands (default: 1000)
- **By age**: Removes commands older than N days (default: 7)
- Whichever limit is hit first triggers cleanup

Example for a smaller, faster database:
```json
{
  "env": {
    "BASHER_MAX_ENTRIES": "500",
    "BASHER_MAX_AGE_DAYS": "3"
  }
}
```

### Running Multiple Instances Simultaneously

With the `--project` argument, Basher automatically creates isolated `.basher` folders in each project. Simply configure unique web ports for each project:

#### Using Project-Scoped `.mcp.json` (Recommended)

Create `.mcp.json` in each project root:

**Project A** (`.mcp.json`):
```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher", "--project", "${workspaceFolder}"],
      "env": {
        "WEB_PORT": "3001",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Project B** (`.mcp.json`):
```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher", "--project", "${workspaceFolder}"],
      "env": {
        "WEB_PORT": "3002",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**What Happens Automatically:**
- ✅ Each project gets its own `.basher/history.db` database
- ✅ `.basher/.gitignore` is auto-created to exclude database and runtime files
- ✅ `.basher/port` file is created with the actual web server port
- ✅ Port auto-detection: if configured port is busy, finds next available
- ✅ VS Code extension reads `.basher/port` to connect to correct instance
- ✅ Command history is completely isolated per project
- ✅ No manual path configuration needed
- ✅ Multiple instances can run simultaneously without conflicts

**Legacy DB_PATH Support:**

For backward compatibility, you can still use explicit paths:

```json
{
  "env": {
    "DB_PATH": "/absolute/path/to/custom/location/history.db",
    "WEB_PORT": "3000"
  }
}
```

## Available Tools

### 1. execute_command

Execute a shell command with enhanced logging and automatic history tracking.

**Parameters:**
- `command` (string, required): The shell command to execute
- `cwd` (string, optional): Working directory for execution
- `stdin` (string, optional): Input to pipe to the command
- `timeout` (number, optional): Timeout in milliseconds (no timeout by default)
- `background` (boolean, optional): Run in background (default: true). Set to false for synchronous execution
- `title` (string, optional): Human-readable title for the command
- `waitFor` (string, optional): **NEW in v1.7** - Regex pattern to wait for in output. Returns immediately when pattern matches. Use this instead of polling!
- `waitTimeout` (number, optional): Timeout for waitFor in ms (default: 30000)

**Execution Modes:**

| Mode | Parameters | Behavior |
|------|------------|----------|
| Background | `background: true` (default) | Returns immediately with `processId` |
| Synchronous | `background: false` | Waits for command to complete |
| Wait for Pattern | `waitFor: "pattern"` | Waits until pattern matches in output |

**Example 1: Background (returns processId immediately)**
```typescript
{ "command": "npm run build" }
```
```json
{
  "status": "running",
  "processId": 5,
  "command": "npm run build",
  "message": "Command started in background."
}
```

**Example 2: Wait for specific output (most efficient for monitoring)**
```typescript
{
  "command": "npm run dev",
  "waitFor": "Listening on port",
  "waitTimeout": 60000
}
```
```json
{
  "status": "pattern_matched",
  "processId": 6,
  "pattern": "Listening on port",
  "matchedLine": "[10:30:00] Listening on port 3000",
  "matchedStream": "stdout",
  "stillRunning": true,
  "message": "Pattern matched. Command may still be running."
}
```

**Example 3: Wait for test results**
```typescript
{
  "command": "npm test",
  "waitFor": "(PASS|FAIL|Error)",
  "waitTimeout": 120000
}
```

**Example 4: Synchronous (wait for completion)**
```typescript
{
  "command": "ls -la",
  "background": false
}
```
```json
{
  "status": "completed",
  "processId": 7,
  "exitCode": 0,
  "duration": "42ms",
  "stdout": "...",
  "success": true
}
```

**waitFor Response Statuses:**
- `pattern_matched`: Pattern found in output, command may still be running
- `completed_without_match`: Command finished but pattern never matched
- `timeout`: waitTimeout reached, command may still be running

> 💡 **Pro tip**: Use `waitFor` instead of polling `get_process_output` repeatedly. One tool call replaces many!

#### Smart Output Processing (v1.8.0)

**Additional Parameters:**
- `parseAs` (string, optional): Parse output as structured data. Options: `jest`, `pytest`, `eslint`, `tsc`, `typescript`, `json`, `auto`. Returns parsed results with test counts, errors, etc.
- `outputMode` (string, optional): Control output format. Options:
  - `full` (default): Complete stdout/stderr
  - `smart`: Intelligent summary focusing on errors and key information
  - `tail`: Last 50 lines only
- `trackProgress` (boolean, optional): Enable progress tracking. Returns progress info like percentage, current item, etc.
- `retry` (object, optional): Auto-retry failed commands
  - `attempts` (number): Max retry attempts
  - `backoff` (string): `none`, `linear`, or `exponential`
  - `delayMs` (number): Base delay between retries
- `diffWithLast` (boolean, optional): Auto-diff output with most recent run of the same command
- `analyzeFailure` (boolean, optional, default: true): Analyze failures and provide suggestions

**Example: Parse test output**
```typescript
{
  "command": "npm test",
  "background": false,
  "parseAs": "jest"
}
```
```json
{
  "status": "completed",
  "exitCode": 0,
  "parsed": {
    "type": "jest",
    "summary": "Tests: 42 passed, 0 failed",
    "passed": 42,
    "failed": 0,
    "skipped": 2,
    "total": 44,
    "duration": 5234,
    "testSuites": { "passed": 5, "failed": 0 }
  },
  "tokenEstimate": {
    "estimated": 1234,
    "original": 5678,
    "savings": "78%"
  }
}
```

**Example: Smart output mode**
```typescript
{
  "command": "npm run build",
  "background": false,
  "outputMode": "smart"
}
```
Returns intelligent summary focusing on errors, warnings, and completion status.

**Example: Retry with exponential backoff**
```typescript
{
  "command": "curl https://api.example.com/health",
  "background": false,
  "retry": {
    "attempts": 3,
    "backoff": "exponential",
    "delayMs": 1000
  }
}
```
Retries up to 3 times with delays: 1s, 2s, 4s.

**Example: Auto-diff with previous run**
```typescript
{
  "command": "npm test",
  "background": false,
  "diffWithLast": true
}
```
```json
{
  "status": "completed",
  "diff": {
    "comparedWith": 42,
    "summary": "stdout: +5 -2 lines. stderr: +0 -1 lines.",
    "stdoutDiff": { "added": 5, "removed": 2 },
    "stderrDiff": { "added": 0, "removed": 1 }
  }
}
```

**Example: Failure analysis**
```typescript
{
  "command": "npm install nonexistent-package",
  "background": false,
  "analyzeFailure": true
}
```
```json
{
  "status": "completed",
  "exitCode": 1,
  "failureAnalysis": {
    "errorType": "npm error",
    "category": "dependency",
    "summary": "npm error code: E404",
    "suggestions": [
      "Try: npm cache clean --force",
      "Delete node_modules and run npm install",
      "Check your npm registry configuration"
    ],
    "relatedCommands": [
      "npm cache clean --force",
      "rm -rf node_modules && npm install"
    ]
  }
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

### 5. get_command_by_id

Retrieve a specific command execution by its ID from the history database. Returns complete execution details including stdout, stderr, exit code, duration, and metadata.

**Parameters:**
- `commandId` (number, required): The ID of the command to retrieve

**Example:**
```typescript
{
  "commandId": 42
}
```

**Returns:**
```json
{
  "id": 42,
  "command": "npm test",
  "title": "Running Tests",
  "cwd": "/home/user/project",
  "timestamp": "2025-01-17T10:30:00.000Z",
  "exitCode": 0,
  "duration": "1234ms",
  "success": true,
  "processId": 12345,
  "status": "completed",
  "stdout": "...",
  "stderr": "",
  "stdoutLength": 5000,
  "stderrLength": 0
}
```

### 6. clear_history

Clear all command history from the database. This permanently deletes all stored command executions and cannot be undone. Use with caution.

**Example:**
```typescript
{}
```

**Returns:**
```json
{
  "success": true,
  "message": "Command history cleared successfully. All stored command executions have been permanently deleted."
}
```

### 7. get_version

Get the current version of Basher MCP server including name, version number, and description.

**Example:**
```typescript
{}
```

**Returns:**
```json
{
  "name": "basher",
  "version": "1.8.0",
  "description": "Basher - MCP server for executing commands with enhanced logging, history tracking, and improved visibility"
}
```

### 8. terminate_command

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

### 9. get_running_commands

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


### 10. get_process_output

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

### 11. advanced_search

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

### 12. get_aggregations

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

### 13. compare_executions

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

### 14. get_last_failures

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

### 15. get_similar_commands

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

### 16. get_command_chain

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

### 17. save_template (v1.8.0)

Save a reusable command template with predefined settings.

**Parameters:**
- `name` (string, required): Unique template name
- `command` (string, required): The command to save
- `title` (string, optional): Human-readable title
- `cwd` (string, optional): Working directory
- `timeout` (number, optional): Timeout in milliseconds
- `parseAs` (string, optional): Parser type (jest, pytest, eslint, tsc, json, auto)
- `waitFor` (string, optional): Pattern to wait for
- `waitTimeout` (number, optional): Wait timeout in ms
- `retry` (object, optional): Retry configuration
- `description` (string, optional): Template description
- `tags` (string[], optional): Tags for categorization

**Example:**
```typescript
{
  "name": "run-tests",
  "command": "npm test",
  "title": "Run Unit Tests",
  "parseAs": "jest",
  "retry": { "attempts": 2, "backoff": "linear", "delayMs": 1000 },
  "description": "Run the project's unit tests",
  "tags": ["test", "npm"]
}
```

### 18. run_template (v1.8.0)

Execute a saved command template.

**Parameters:**
- `name` (string, required): Template name to run
- `cwd` (string, optional): Override working directory
- `background` (boolean, optional): Override background setting

**Example:**
```typescript
{
  "name": "run-tests",
  "background": false
}
```

### 19. list_templates (v1.8.0)

List all saved command templates.

**Parameters:**
- `tag` (string, optional): Filter by tag

**Example:**
```typescript
{ "tag": "test" }
```

**Returns:**
```json
{
  "count": 3,
  "templates": [
    {
      "name": "run-tests",
      "command": "npm test",
      "description": "Run the project's unit tests",
      "tags": ["test", "npm"]
    }
  ]
}
```

### 20. delete_template (v1.8.0)

Delete a saved command template.

**Parameters:**
- `name` (string, required): Template name to delete

### 21. start_session (v1.8.0)

Start a new command session to group related commands together.

**Parameters:**
- `name` (string, required): Session name
- `description` (string, optional): Session description
- `metadata` (object, optional): Custom metadata

**Example:**
```typescript
{
  "name": "feature-deployment",
  "description": "Deploy new authentication feature",
  "metadata": { "ticket": "AUTH-123", "environment": "staging" }
}
```

**Returns:**
```json
{
  "id": 5,
  "name": "feature-deployment",
  "status": "active",
  "startedAt": "2025-01-17T10:30:00.000Z",
  "commandCount": 0
}
```

### 22. end_session (v1.8.0)

End the current active session.

**Parameters:**
- `status` (string, optional): Session end status. Options: `completed` (default), `abandoned`

**Returns:**
```json
{
  "id": 5,
  "name": "feature-deployment",
  "status": "completed",
  "startedAt": "2025-01-17T10:30:00.000Z",
  "endedAt": "2025-01-17T11:45:00.000Z",
  "commandCount": 12
}
```

### 23. get_session (v1.8.0)

Get a session by ID or name.

**Parameters:**
- `id` (number, optional): Session ID
- `name` (string, optional): Session name (gets most recent)

**Example:**
```typescript
{ "name": "feature-deployment" }
```

### 24. list_sessions (v1.8.0)

List all command sessions.

**Parameters:**
- `status` (string, optional): Filter by status (active, completed, abandoned)
- `limit` (number, optional): Maximum results (default: 50)

**Example:**
```typescript
{
  "status": "completed",
  "limit": 10
}
```

**Returns:**
```json
{
  "count": 10,
  "sessions": [
    {
      "id": 5,
      "name": "feature-deployment",
      "status": "completed",
      "startedAt": "2025-01-17T10:30:00.000Z",
      "endedAt": "2025-01-17T11:45:00.000Z",
      "commandCount": 12
    }
  ]
}
```

### 25. whitelist_command (v1.10.0)

Add a command to the whitelist. **IMPORTANT**: AI must always ask for user permission before calling this tool.

**Parameters:**
- `command_base` (string, required): The base command to whitelist (e.g., "rm", "kubectl")
- `description` (string, optional): Description of the command

**Example:**
```typescript
{
  "command_base": "kubectl",
  "description": "Kubernetes command-line tool"
}
```

**Returns:**
```json
{
  "success": true,
  "message": "Command 'kubectl' has been whitelisted. You can now execute commands starting with 'kubectl'."
}
```

### 26. list_whitelisted_commands (v1.10.0)

View all currently whitelisted commands.

**Example:**
```typescript
{}
```

**Returns:**
```json
{
  "enabled": true,
  "count": 45,
  "commands": [
    { "base": "npm", "approvedAt": "2025-01-01T00:00:00.000Z", "description": "Node.js package manager" },
    { "base": "git", "approvedAt": "2025-01-01T00:00:00.000Z", "description": "Git version control" }
  ]
}
```

### 27. remove_whitelisted_command (v1.10.0)

Remove a command from the whitelist.

**Parameters:**
- `command_base` (string, required): The base command to remove

**Example:**
```typescript
{
  "command_base": "dangerous-cmd"
}
```

**Returns:**
```json
{
  "success": true,
  "message": "Command 'dangerous-cmd' has been removed from the whitelist"
}
```

## Command Whitelisting (v1.10.0)

Basher includes a command whitelisting system that provides defense-in-depth security by requiring explicit approval for command bases before they can be executed.

### How It Works

1. **Command Base Extraction**: When a command is executed, Basher extracts the base command (e.g., `npm install express` → `npm`)
2. **Whitelist Check**: The command base is checked against the whitelist
3. **Blocked Commands**: If not whitelisted, the command is blocked with instructions for the AI to request user approval
4. **Approval Flow**: AI must ask the user for permission, then use `whitelist_command` tool to add it

### Default Whitelisted Commands

Basher comes with common development commands pre-whitelisted:

| Category | Commands |
|----------|----------|
| **Package Managers** | npm, npx, yarn, pnpm, bun |
| **Version Control** | git, gh |
| **Runtimes** | node, python, python3, pip, pip3 |
| **CLI Tools** | ls, cat, echo, pwd, cd, mkdir, cp, mv, head, tail, grep, find, which, wc, sort, uniq, diff, curl, wget |
| **Build Tools** | make, cargo, go, tsc, tsx, esbuild, webpack, vite, rollup |
| **Testing** | jest, vitest, pytest, mocha |
| **Linting** | eslint, prettier, biome |
| **Containers** | docker |

### Whitelist Tools

#### whitelist_command

Add a command to the whitelist. **IMPORTANT**: AI must always ask for user permission before calling this tool.

**Parameters:**
- `command_base` (string, required): The base command to whitelist (e.g., "rm", "kubectl")
- `description` (string, optional): Description of the command

**Example:**
```typescript
{
  "command_base": "kubectl",
  "description": "Kubernetes command-line tool"
}
```

**Returns:**
```json
{
  "success": true,
  "message": "Command 'kubectl' has been whitelisted. You can now execute commands starting with 'kubectl'."
}
```

#### list_whitelisted_commands

View all currently whitelisted commands.

**Example:**
```typescript
{}
```

**Returns:**
```json
{
  "enabled": true,
  "count": 45,
  "commands": [
    { "base": "npm", "approvedAt": "2025-01-01T00:00:00.000Z", "description": "Node.js package manager" },
    { "base": "git", "approvedAt": "2025-01-01T00:00:00.000Z", "description": "Git version control" }
  ]
}
```

#### remove_whitelisted_command

Remove a command from the whitelist.

**Parameters:**
- `command_base` (string, required): The base command to remove

**Example:**
```typescript
{
  "command_base": "dangerous-cmd"
}
```

### Whitelist Configuration

The whitelist is stored in `.basher/whitelist.json`:

```json
{
  "enabled": true,
  "commands": {
    "npm": { "approvedAt": "2025-01-01T00:00:00.000Z", "description": "Node.js package manager" },
    "git": { "approvedAt": "2025-01-01T00:00:00.000Z", "description": "Git version control" }
  }
}
```

**To disable whitelisting** (not recommended), set `enabled: false` in the file.

### Blocked Command Response

When a command is blocked, the response includes:

```json
{
  "status": "blocked",
  "error": "COMMAND_NOT_WHITELISTED",
  "commandBase": "rm",
  "instructions": "Ask user for permission, then use whitelist_command tool"
}
```

## Security

Basher is designed as a **localhost-only** development tool with multiple security layers. See [SECURITY.md](SECURITY.md) for the complete security model.

### Security Controls Summary

| Control | Description |
|---------|-------------|
| **Localhost Only** | Server binds to 127.0.0.1, rejects non-localhost requests |
| **Command Whitelisting** | Commands must be whitelisted before execution |
| **Rate Limiting** | 200 req/min general, 60 req/min execute, 10 req/min destructive |
| **CORS Restrictions** | Only localhost origins allowed |
| **Security Headers** | Helmet middleware with CSP, X-Frame-Options, etc. |
| **Input Validation** | Zod schemas validate all inputs |
| **Body Size Limit** | 10MB max request body |

### Deployment Guidelines

**✅ Acceptable:**
- Local development machine
- Single-user environment
- Behind firewall/NAT

**❌ NOT Acceptable:**
- Public internet exposure
- Multi-user systems without isolation
- Cloud deployments without network restrictions

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
│   │   ├── instance-detector.ts       # Singleton pattern detection
│   │   ├── instance-notifier.ts       # Multi-instance HTTP notifications
│   │   ├── logger.config.ts           # Pino logger configuration
│   │   ├── web-server.ts              # Web UI server with SSE
│   │   ├── whitelist-manager.ts       # Command whitelisting security
│   │   ├── output-parser.ts           # Structured output parsing (jest, pytest, etc.)
│   │   ├── command-templates.ts       # Reusable command templates
│   │   ├── command-sessions.ts        # Command session management
│   │   └── failure-analyzer.ts        # Error analysis and suggestions
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
- `WEB_PORT`: Starting port for web UI (default: `3000`, auto-increments if busy)
- `BASHER_MAX_ENTRIES`: Maximum commands to keep in history (default: `1000`)
- `BASHER_MAX_AGE_DAYS`: Maximum age in days for history entries (default: `7`)

## License

MIT

## Author

Bazilikum

## Future Features

See the `docs/` directory for detailed design documents on upcoming features:

- **[Sub-Stream Monitoring](docs/SUB_STREAM_MONITORING.md)**: Capture and display LLM streaming output and custom sub-streams separately from stdout/stderr (planned feature)

## Contributing

Issues and pull requests are welcome at https://github.com/Bazilikum/basher
