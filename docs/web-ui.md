# Web UI Dashboard

Basher automatically starts a web dashboard when the MCP server runs, providing real-time visibility into command execution.

## Access

**URL**: http://localhost:3000 (default starting port, auto-increments if busy)

When Basher starts, it will show: `🌐 Web UI available at: http://localhost:3000`

## Multi-Terminal Support

Each Basher instance runs independently with its own web server:

**How It Works**:
1. Each terminal starts its own MCP server and web server
2. Web server starts from `WEB_PORT` (default: 3000)
3. If that port is busy, automatically finds next available (3001, 3002, etc.)
4. All instances share the same SQLite database (`.basher/history.db`)
5. Shows: `🌐 Web UI available at: http://localhost:3000` (or 3001, 3002...)

**Benefits**:
- **Simple architecture**: No coordination between instances needed
- **Shared history**: All terminals write to the same database
- **No conflicts**: Each terminal gets its own web server port
- **Independent operation**: Terminals don't depend on each other
- **Unified history**: VS Code extension reads from shared database

### Process State Persistence

- Running processes are persisted to `.basher/running-processes.json`
- When Basher restarts, orphaned processes are automatically adopted
- Adopted processes appear in running commands list with preserved metadata
- Enables visibility of long-running commands across context resets

## Dashboard Features

- **Real-time Command Feed**: Live updates as commands execute via SSE
- **Command History Table**: Sortable, filterable list of all executions
- **Full-Text Search**: Search across commands, stdout, and stderr
- **Statistics Panel**: Total commands, success/failure rates, average duration
- **Execution Details**: Click any command to see complete output with timestamps
- **Dark Theme**: Terminal-inspired UI optimized for developers
- **Export**: Download command history as JSON or CSV

## REST API

The web server also provides a REST API for programmatic access:

### Command Execution

**POST /api/execute** - Execute a command (background by default)

Parameters:
- `command` (required): Shell command to execute
- `title` (optional): Human-readable title
- `cwd` (optional): Working directory
- `background` (optional, default: true): Run in background
- `timeout` (optional): Timeout in milliseconds

**Background Execution:**
```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "npm run build", "title": "Building Project"}'
```

Returns immediately with processId.

**Synchronous Execution:**
```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "echo hello", "background": false}'
```

Waits for completion and returns full output.

### Process Monitoring

**GET /api/running** - List currently running commands
```bash
curl http://localhost:3000/api/running
```

**GET /api/process/:id/output** - Get live output from running command
```bash
curl http://localhost:3000/api/process/1/output
```

### History & Search

- **GET /api/history?limit=100** - Recent command history
- **GET /api/history/:id** - Get specific command by ID
- **GET /api/search?q=error** - Full-text search
- **GET /api/stats** - Execution statistics
- **GET /api/logs?limit=100** - Structured logs
- **GET /api/events** - Server-Sent Events stream
- **DELETE /api/history** - Clear all history

### Health Check

**GET /health** - Health check endpoint for monitoring

```bash
curl http://localhost:3000/health
```
