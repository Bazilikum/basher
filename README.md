# Command N Conquer

MCP server for executing shell commands with enhanced logging, history tracking, and improved visibility over standard bash execution.

## Features

- **Enhanced Command Execution**: Execute shell commands with real-time output streaming
- **Structured Logging**: JSON-formatted logs using Pino for better observability
- **Persistent History**: SQLite database stores all command executions
- **Full-Text Search**: Search across commands, stdout, and stderr using SQLite FTS5
- **Execution Metadata**: Track duration, exit codes, timestamps, and working directories
- **Timeout Control**: Configurable timeouts for long-running commands
- **Better Error Tracking**: Detailed error categorization and logging

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Bazilikum/command_n_conquer.git
cd command_n_conquer
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
    "command-n-conquer": {
      "command": "node",
      "args": ["/absolute/path/to/command_n_conquer/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Replace `/absolute/path/to/command_n_conquer` with the actual path to this repository.

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

Command N Conquer includes an integrated web dashboard for viewing logs, browsing command history, and monitoring execution statistics in real-time.

### Accessing the Dashboard

When the MCP server starts, the web UI automatically launches on **http://localhost:3000**

You can customize the port using the `WEB_PORT` environment variable:

```json
{
  "mcpServers": {
    "command-n-conquer": {
      "command": "node",
      "args": ["/path/to/command_n_conquer/dist/index.js"],
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

## Improvements Over Standard Bash Execution

| Feature | Standard Bash | Command N Conquer |
|---------|---------------|-------------------|
| Command Execution | ✅ | ✅ |
| Real-time Output | ✅ | ✅ |
| Structured Logging | ❌ | ✅ |
| Persistent History | ❌ | ✅ (SQLite) |
| Full-Text Search | ❌ | ✅ (FTS5) |
| Execution Metadata | Basic | ✅ Comprehensive |
| Error Categorization | ❌ | ✅ |
| Output Searchability | ❌ | ✅ |
| Statistics & Analytics | ❌ | ✅ |
| Web UI Dashboard | ❌ | ✅ (Real-time) |

## Project Structure

```
command_n_conquer/
├── src/
│   ├── index.ts                    # Main MCP server
│   ├── services/
│   │   ├── command-executor.ts     # Command execution logic
│   │   ├── history-manager.ts      # SQLite history management
│   │   ├── logger.config.ts        # Pino logger configuration
│   │   └── web-server.ts           # Web UI server with SSE
│   └── types/
│       └── index.ts                # TypeScript type definitions
├── public/
│   └── index.html                  # Web dashboard UI
├── dist/                           # Compiled JavaScript
├── logs/                           # Log files (git-ignored)
├── data/                           # SQLite database (git-ignored)
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

## Contributing

Issues and pull requests are welcome at https://github.com/Bazilikum/command_n_conquer
