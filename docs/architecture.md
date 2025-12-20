# Basher Architecture

This document provides an overview of the Basher MCP Server architecture, including component responsibilities, data flow, and key design decisions.

## System Overview

Basher is an MCP (Model Context Protocol) server that provides command execution capabilities with comprehensive tracking, analysis, and persistence. It consists of several interconnected components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Clients                               │
│  (Claude Desktop, VS Code Extension, Claude Code CLI)           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ MCP Protocol (stdio/SSE)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Server (index.ts)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Tool Registry                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │   │
│  │  │ Execute │ │ History │ │Templates│ │ Admin   │  ...    │   │
│  │  │  Tools  │ │  Tools  │ │  Tools  │ │  Tools  │         │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ProcessManager │ │HistoryManager │ │ WhitelistMgr  │
│  (Tracking)   │ │  (SQLite)     │ │  (Security)   │
└───────────────┘ └───────────────┘ └───────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Web Server (Optional)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │  REST API   │ │     SSE     │ │  Static UI  │               │
│  │  Endpoints  │ │   Events    │ │  Dashboard  │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### MCP Server (`src/index.ts`)

The main entry point that:
- Initializes the MCP server using `@modelcontextprotocol/sdk`
- Registers all MCP tools from the tool registry
- Handles tool execution requests
- Manages the application lifecycle

**Key responsibilities:**
- MCP protocol handling
- Tool dispatch
- Command execution (`execute_command`, `run_template`)
- Server initialization and shutdown

### Tool Registry (`src/tools/index.ts`)

Centralized registry for all MCP tools:
- Provides unified tool listing for `ListToolsRequest`
- Routes tool calls to appropriate handlers
- Organizes tools into logical categories

**Tool Categories:**
- `admin/` - Server administration (version, info, clear history)
- `execute/` - Process management (terminate, get output, poll)
- `history/` - Command history queries and search
- `templates/` - Command template management
- `sessions/` - Command session grouping
- `whitelist/` - Security whitelist management

### Process Manager (`src/services/process-manager.ts`)

Tracks running processes and their output:
- Generates unique process IDs across instances
- Manages stdout/stderr accumulation
- Handles orphan process adoption across restarts
- Provides periodic output flushing to database

**Key features:**
- Process registration/unregistration
- Output streaming
- Process termination with SIGTERM/SIGKILL
- State persistence for crash recovery

### History Manager (`src/services/history-manager.ts`)

Persists command execution history using SQLite:
- Full-text search (FTS5) for command/output search
- Advanced querying and aggregations
- Automatic cleanup (by age and count limits)
- Status tracking for running commands

**Database Schema:**
```sql
command_history (
  id INTEGER PRIMARY KEY,
  command TEXT,
  title TEXT,
  cwd TEXT,
  timestamp TEXT,
  exit_code INTEGER,
  duration INTEGER,
  stdout TEXT,
  stderr TEXT,
  process_id INTEGER,
  status TEXT
)

command_history_fts (
  command, stdout, stderr -- FTS5 virtual table
)
```

### Whitelist Manager (`src/services/whitelist-manager.ts`)

Security layer for command execution:
- Maintains whitelist of allowed command bases
- Extracts command base from full command strings
- Persists whitelist to JSON file
- Provides default set of common safe commands
- **Argument Validation**: Optional regex patterns for allowed/blocked arguments
  - `allowedArgs`: Command must match at least one pattern
  - `blockedArgs`: Command blocked if any pattern matches (takes precedence)

### Audit Logger (`src/services/audit-logger.ts`)

Security event logging for compliance and debugging:
- Logs command executions (allowed and blocked)
- Logs whitelist changes (additions and removals)
- Logs rate limit violations
- File-based audit trail with JSON format
- Configurable console and file output

### Command Executor (`src/services/command-executor.ts`)

Handles actual command execution:
- Spawns child processes with proper configuration
- Handles stdin piping
- Manages timeouts
- Supports `waitFor` pattern matching
- Provides per-line timestamps

### Web Server (`src/services/web-server.ts`)

Optional HTTP server for UI and REST API:
- Serves static web dashboard
- REST API endpoints for all operations
- Server-Sent Events (SSE) for real-time updates
- Rate limiting for security:
  - Global rate limits (200/60/10 req/min by endpoint type)
  - Per-command rate limits for dangerous commands (rm, sudo, etc.)

## Data Flow

### Command Execution Flow

```
1. Client → MCP Server: execute_command tool call
2. MCP Server → WhitelistManager: Check command allowed
3. MCP Server → ProcessManager: Register new process
4. MCP Server → CommandExecutor: Spawn child process
5. CommandExecutor → ProcessManager: Stream stdout/stderr
6. ProcessManager → HistoryManager: Periodic output flush
7. CommandExecutor → HistoryManager: Save final result
8. MCP Server → Client: Return result
```

### History Query Flow

```
1. Client → MCP Server: search_command_history
2. MCP Server → HistoryManager: Execute FTS query
3. HistoryManager → SQLite: FTS5 MATCH query
4. SQLite → HistoryManager: Results
5. HistoryManager → MCP Server: Formatted results
6. MCP Server → Client: Return results
```

## Key Design Decisions

### 1. SQLite with FTS5

Chosen for:
- Embedded database (no external dependencies)
- Full-text search for command/output searching
- ACID transactions for reliability
- Efficient for single-writer workloads

**Trade-off:** Using DELETE journal mode instead of WAL for compatibility with sql.js (VS Code extension reader).

### 2. Singleton Pattern (with DI support)

Core services use singletons for:
- Simple integration with existing code
- Process-level shared state
- Backward compatibility

**Mitigation:** All singletons now support constructor-based dependency injection for testing and new code.

### 3. Periodic Cleanup

History cleanup runs periodically (every 100 saves or 5 minutes) instead of on every save to reduce I/O overhead.

### 4. Command Whitelisting

Security model requires explicit approval for command bases:
- Default whitelist includes common safe commands
- AI must request user approval for new commands
- Protects against arbitrary code execution

### 5. Process ID Generation

Uses composite ID combining:
- Timestamp (milliseconds)
- Process PID
- Sub-millisecond counter

This ensures uniqueness across multiple concurrent instances.

## File Structure

```
src/
├── index.ts                 # MCP server entry point
├── constants.ts             # Centralized constants
├── types/
│   ├── index.ts            # Shared type definitions
│   └── context.ts          # AppContext interface
├── utils/
│   ├── paths.ts            # Path resolution utilities
│   └── errors.ts           # Error handling utilities
├── services/
│   ├── process-manager.ts   # Running process tracking
│   ├── history-manager.ts   # SQLite persistence
│   ├── whitelist-manager.ts # Command security
│   ├── command-executor.ts  # Process spawning
│   ├── command-templates.ts # Template storage
│   ├── command-sessions.ts  # Session management
│   ├── web-server.ts        # HTTP/SSE server
│   ├── advanced-queries.ts  # Complex DB queries
│   ├── output-parser.ts     # Test output parsing
│   ├── failure-analyzer.ts  # Error analysis
│   └── toon-encoder.ts      # Token-efficient encoding
└── tools/
    ├── index.ts             # Tool registry
    ├── admin/               # Admin tools
    ├── execute/             # Process management tools
    ├── history/             # History query tools
    ├── templates/           # Template tools
    ├── sessions/            # Session tools
    └── whitelist/           # Whitelist tools
```

## Configuration

Configuration is managed through:
- Environment variables
- `.basher/` directory in project root:
  - `whitelist.json` - Command whitelist
  - `templates.json` - Saved command templates
  - `running-processes.json` - Process state for crash recovery
  - `port` - Web server port file

## Extension Points

### Adding New Tools

1. Create handler in appropriate `src/tools/` subdirectory
2. Export tool definition with schema and handler
3. Add to category's tool array
4. Tools are automatically registered via `getAllToolDefinitions()`

### Adding Output Parsers

1. Add parser type to `output-parser.ts`
2. Implement parsing logic
3. Add to `parseAs` enum in execute_command schema

### Custom Failure Analysis

1. Add patterns to `failure-analyzer.ts`
2. Patterns are matched against command output
3. Returns structured error analysis
