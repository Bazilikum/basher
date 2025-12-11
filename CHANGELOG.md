# Changelog

All notable changes to Basher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
