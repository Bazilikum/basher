# Quick Start

Once Basher is installed and configured, the MCP tools are available in your AI coding assistant.

## Basic Usage

### Execute Commands

```
# Execute a command
execute_command({ command: "npm test" })
```

### View History

```
# Get recent command history
get_recent_commands({ limit: 10 })

# Search for errors
search_command_history({ query: "error" })

# View statistics
get_command_stats()
```

### Monitor Running Commands

```
# List running commands
get_running_commands()

# Get output from a running command
get_process_output({ processId: 12345, lines: 50 })

# Terminate a command
terminate_command({ processId: 12345 })
```

## Web UI Dashboard

Basher automatically starts a web dashboard when the MCP server runs.

**URL**: http://localhost:3000 (default starting port, auto-increments if busy)

### Multi-Terminal Support

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

### Dashboard Features

- **Real-time Command Feed**: Live updates as commands execute
- **Command History Table**: Sortable, filterable list of all executions
- **Full-Text Search**: Search across commands, stdout, and stderr
- **Statistics Panel**: Total commands, success/failure rates, average duration
- **Execution Details**: Click any command to see complete output with timestamps
- **Dark Theme**: Terminal-inspired UI optimized for developers

## VS Code Extension

The Basher VS Code extension provides a native sidebar panel to browse command history without leaving your editor.

### Installation

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/Bazilikum/basher/releases)
2. In VS Code: `Cmd+Shift+P` → **"Extensions: Install from VSIX..."**
3. Select the downloaded `basher-vscode-x.x.x.vsix` file

### Features

- **Sidebar Panel**: Click the terminal icon in the activity bar
- **Command Tree View**: Browse all executed commands with status indicators
- **Running Commands Monitor**: Dedicated webview panel showing all currently executing commands
- **Custom Titles**: Commands display with human-readable titles instead of raw shell commands
- **Output Preview**: Click any command to view its full output in an editor pane
- **Real-time Updates**: Tree view refreshes automatically
- **Search**: Full-text search across command history

### Configuration

Set these in VS Code settings (`Cmd+,`):

```json
{
  "basher.serverUrl": "http://localhost:3000",
  "basher.autoRefresh": true,
  "basher.refreshInterval": 5000,
  "basher.maxHistoryItems": 100
}
```

## Advanced Search

```
# Advanced filtering
advanced_search({
  query: "error",
  outputLevel: "excerpts",
  filters: {
    exitCodes: [1],
    dateRange: { from: "2025-01-01T00:00:00Z" }
  }
})

# Get aggregations
get_aggregations({
  groupBy: "command",
  includeStats: true,
  limit: 10
})

# Compare two command executions
compare_executions({
  commandId1: 42,
  commandId2: 43
})
```

## Next Steps

- See [Tools Reference](tools-reference.md) for complete documentation of all 27 MCP tools
- See [Token Efficiency](token-efficiency.md) for tips on minimizing token usage
- See [Web UI](web-ui.md) for complete API documentation
- See [VS Code Extension](vscode-extension.md) for extension details
