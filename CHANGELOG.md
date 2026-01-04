# Changelog

All notable changes to Basher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.18.0] - 2026-01-04

### Added
- **Basher Light**: Minimal MCP server with 5 essential tools (~80% fewer tokens)
  - Tools: `execute_command`, `get_command`, `get_running_commands`, `terminate_command`, `get_version`
  - Available via `basher-light` binary or `npm run start:light`
- **Consolidated `get_command` tool**: Unified lookup by `commandId` or `processId`
- **`timestamps` parameter** for `execute_command`: Per-line timestamps (default: false)
- **Whitelist pagination**: `limit`/`offset` params for `list_whitelisted_commands`

### Changed
- **Shortened tool descriptions**: ~30% reduction in tool definition tokens
- **Timestamps off by default**: Now opt-in via `timestamps: true` for reduced output size

### Deprecated
- `get_command_by_id` → Use `get_command` with `commandId` param
- `get_command_by_process_id` → Use `get_command` with `processId` param

## [1.17.0] - 2025-12-20

### Added
- **Audit Logger** (`src/services/audit-logger.ts`): File-based audit trail for security events
  - Logs command executions, blocked commands, whitelist changes
  - Supports multiple event types: command_executed, command_blocked, whitelist_added, etc.
- **Command Argument Validation**: Whitelist entries can now restrict arguments
  - `allowedArgs`: Regex patterns for permitted arguments
  - `blockedArgs`: Regex patterns for denied arguments (takes precedence)
- **Per-Command Rate Limiting**: Stricter limits for dangerous commands
  - `rm`, `sudo`: 5 requests/minute
  - `chmod`, `chown`: 10 requests/minute
  - `curl`, `wget`, `docker`: 20-30 requests/minute
  - `npm`, `git`: 60 requests/minute
- **Integration Tests**: 17 new integration tests for MCP tool execution flow
- **Architecture Documentation**: `docs/architecture.md` with system diagrams
- **API Documentation**: `docs/api.md` covering all 31 MCP tools and Web API

### Changed
- **Refactored Tool Handlers**: Extracted 31 tools from index.ts to `src/tools/` directory
  - Organized into: admin, execute, history, templates, sessions, whitelist
- **Dependency Injection**: ProcessManager and WhitelistManager now support constructor injection
- **Optimized Cleanup**: History cleanup now runs periodically (every 100 saves or 5 minutes)
- **Centralized Constants**: Magic numbers moved to `src/constants.ts`
- **Shared Utilities**: Path resolution in `src/utils/paths.ts`, error handling in `src/utils/errors.ts`

### Fixed
- Silent failures in history-manager.ts, index.ts, web-server.ts now properly logged/handled

### Tests
- 94 total tests (26 history-manager, 22 process-manager, 29 whitelist-manager, 17 integration)

## [1.12.0] - 2025-12-20

### Changed
- **Simplified Multi-Instance Architecture**: Removed singleton pattern in favor of independent instances
  - Each terminal now gets its own web server with automatic port discovery
  - All instances share the same SQLite database for unified command history
  - No more primary/secondary coordination or instance notifications
  - Simpler, more reliable operation

### Removed
- `instance-detector.ts` - No longer needed (no singleton pattern)
- `instance-notifier.ts` - No longer needed (no cross-instance notifications)
- `/api/notify` endpoint - Was used for cross-instance communication
- Port/PID files (`.basher/port`, `.basher/pid`) - No longer written

### Fixed
- Eliminated race conditions related to instance coordination
- Resolved issues with commands not completing in multi-terminal scenarios

## [1.11.0] - 2025-12-12

### Fixed
- **MCP Reconnect Reliability**: Fixed issue where first reconnect attempt would fail
  - MCP transport now connects before web server initialization
  - Added event loop yield after MCP connect to process pending messages
  - Faster logger initialization (removed pino-pretty worker threads)
  - Improved instance detection with PID check before network health check
  - Reduced health check timeout from 2s to 500ms
  - Added SQLite busy timeout for database lock handling

### Added
- **Resizable Command Panel**: Web UI command list panel is now resizable via drag handle
- **Better Output Sizing**: Output panel now uses viewport-relative height for better fit
- Shutdown signal logging for debugging (tracks SIGINT, SIGTERM, SIGHUP, stdin-close)

## [1.10.0] - 2025-01-17

### Added
- **Command Whitelisting**: Security defense-in-depth requiring explicit approval for command bases
- `whitelist_command` tool - Add commands to whitelist (requires user approval)
- `list_whitelisted_commands` tool - View all whitelisted commands
- `remove_whitelisted_command` tool - Remove commands from whitelist
- Default whitelist includes common dev tools (npm, git, node, docker, etc.)
- Whitelist stored in `.basher/whitelist.json` (human-editable)
- Security documentation in README

### Security
- Commands must be whitelisted before execution
- AI must ask user permission before whitelisting new commands

## [1.9.0] - 2025-01-15

### Added
- Localhost-only server binding (127.0.0.1)
- Localhost verification middleware
- Helmet security headers (CSP, X-Frame-Options, etc.)
- CORS origin restrictions (localhost only)
- Rate limiting (200/60/10 req/min by endpoint type)
- Request body size limits (10MB max)
- Zod validation for web API endpoints
- Global error handler

### Security
- Comprehensive security hardening for localhost deployment
- SECURITY.md documentation

## [1.8.6] - 2025-01-10

### Fixed
- Race condition causing commands to disappear with exit code -1

## [1.8.4] - 2025-01-08

### Fixed
- Output panel now shows command completion in-place
- VS Code extension v1.5.2

## [1.8.3] - 2025-01-05

### Added
- `poll_until_complete` tool for efficient background command monitoring
- Improved background command hints in responses

## [1.8.0] - 2025-01-01

### Added
- **Structured Output Parsing**: Parse Jest, pytest, ESLint, TypeScript, JSON output
- **Smart Output Modes**: Intelligent summaries, tail mode, token estimation
- **Command Templates**: Save and reuse command configurations with retry policies
- **Command Sessions**: Group related commands for better organization
- **Failure Analysis**: Automatic error categorization with actionable suggestions
- **Auto-Retry**: Retry failed commands with configurable backoff strategies
- **Output Diff**: Auto-compare output with previous runs
- `parseAs` parameter for structured parsing
- `outputMode` parameter (full, smart, tail)
- `trackProgress` parameter for progress tracking
- `retry` parameter with backoff configuration
- `diffWithLast` parameter for auto-diff
- `analyzeFailure` parameter for failure analysis
- Template tools: `save_template`, `run_template`, `list_templates`, `delete_template`
- Session tools: `start_session`, `end_session`, `get_session`, `list_sessions`

## [1.7.0] - 2024-12-20

### Added
- `waitFor` parameter for pattern-based command monitoring
- `waitTimeout` parameter for wait timeout configuration

## [1.6.0] - 2024-12-15

### Added
- Multi-instance live visibility
- Secondary instances notify primary via HTTP
- Live streaming of command output to web UI
- SSE broadcasts from all instances

## [1.5.0] - 2024-12-10

### Added
- VS Code extension with sidebar panel
- Running commands monitor with live output
- Custom command titles
- Workspace isolation via port file detection

## [1.4.0] - 2024-12-05

### Added
- Token-efficient querying (90-95% savings)
- Toon format support (~40% additional savings)
- Advanced filtering with multi-criteria search
- Aggregations and analytics
- Query templates for common patterns

## [1.3.0] - 2024-12-01

### Added
- Web UI dashboard with real-time SSE updates
- Auto port detection and singleton pattern
- Process state persistence across restarts

## [1.2.0] - 2024-11-25

### Added
- Full-text search with FTS5
- Output comparison (diff mode)
- Execution metadata tracking

## [1.1.0] - 2024-11-20

### Added
- Process management (track, monitor, terminate)
- Background execution with instant responses
- Live output monitoring

## [1.0.0] - 2024-11-15

### Added
- Initial release
- Enhanced command execution with real-time streaming
- Structured logging with Pino
- Persistent history with SQLite
- Basic MCP server implementation
