# Security Model - Basher MCP Server

## Overview

Basher is designed as a **localhost-only** development tool for use with Claude Code.
It intentionally executes arbitrary shell commands as this is its core functionality.

## Security Architecture

### Network Security

| Control | Implementation |
|---------|----------------|
| **Binding** | Server binds to `127.0.0.1` only (localhost) |
| **Localhost Verification** | Middleware rejects all non-localhost requests with 403 |
| **CORS** | Restricted to `localhost` and `127.0.0.1` origins only |
| **Rate Limiting** | Applied to all endpoints with stricter limits on command execution |

### Security Headers (via Helmet)

- Content-Security-Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- XSS-Filter enabled

### Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| General API | 200 requests/minute |
| Command Execution | 60 requests/minute |
| Destructive Operations | 10 requests/minute |

### Input Validation

- All inputs validated with Zod schemas
- Request body size limited to 10MB
- Command length limited to 10,000 characters
- URL parameters validated for type and range

### Access Control

- **Localhost Only**: All requests must originate from localhost
- **No Authentication**: By design, as it's a single-user local tool
- **MCP Protocol**: Claude Code communicates via stdio (trusted)

### Command Whitelisting

Commands must be whitelisted before execution. This provides defense-in-depth by requiring explicit approval for each command base (e.g., `npm`, `git`, `docker`).

| Feature | Description |
|---------|-------------|
| **Whitelist File** | `.basher/whitelist.json` - human-readable, editable |
| **Default Commands** | Common dev tools pre-whitelisted (npm, git, node, etc.) |
| **Enable/Disable** | Set `enabled: false` in whitelist.json to disable |
| **AI Behavior** | AI must ask user permission before whitelisting new commands |

**Whitelist Tools:**
- `whitelist_command` - Add command to whitelist (requires user approval)
- `list_whitelisted_commands` - View current whitelist
- `remove_whitelisted_command` - Remove command from whitelist

**Error Response (when blocked):**
```json
{
  "status": "blocked",
  "error": "COMMAND_NOT_WHITELISTED",
  "commandBase": "dangerous-cmd",
  "instructions": "Ask user for permission, then use whitelist_command tool"
}
```

## Security Assumptions

1. **Trusted Environment**: Running on a developer's local machine
2. **Trusted Caller**: Claude Code is the primary caller via MCP
3. **No Network Exposure**: Not designed for deployment on networks
4. **User Responsibility**: Users are responsible for not running malicious commands

## Known Risks

### Command Execution

The tool executes shell commands with `shell: true`. This is intentional and required for the tool's functionality.

Users should:
- Not construct commands from untrusted input
- Be aware that command output is stored in history
- Not pipe sensitive credentials through commands

### History Storage

- Command history (including stdout/stderr) is stored unencrypted in SQLite
- Located in `.basher/history.db`
- May contain sensitive data if commands output credentials
- Database is excluded from git via `.gitignore`

## Deployment Guidelines

### Acceptable Deployments

- Local development machine
- Single-user environment
- Behind firewall/NAT

### NOT Acceptable Deployments

- Public internet exposure
- Multi-user systems without isolation
- Cloud deployments without network restrictions
- Shared hosting environments
- Docker containers with exposed ports

## Security Controls Summary

```
Request Flow:
┌──────────────────────────────────────────────────────────────┐
│                    SECURITY MIDDLEWARE CHAIN                  │
├──────────────────────────────────────────────────────────────┤
│ 1. Localhost-only check (403 if not localhost)               │
│ 2. Helmet security headers                                    │
│ 3. Rate limiting (200/60/10 req/min by endpoint type)        │
│ 4. CORS validation (localhost origins only)                  │
│ 5. Body size limit (10MB max)                                │
│ 6. Zod input validation (per-route schemas)                  │
│ 7. Route handler                                             │
│ 8. Global error handler (no stack trace leaks)               │
└──────────────────────────────────────────────────────────────┘
```

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Contact the maintainers directly
3. Provide detailed reproduction steps
4. Allow time for a fix before public disclosure

## Changelog

### v1.10.0 (Command Whitelisting)

- Added command whitelisting system
- Commands must be whitelisted before execution
- Default whitelist includes common dev tools (npm, git, node, etc.)
- Added `whitelist_command`, `list_whitelisted_commands`, `remove_whitelisted_command` tools
- AI must ask user permission before whitelisting new commands
- Whitelist stored in `.basher/whitelist.json`

### v1.9.0 (Security Hardening)

- Added localhost-only binding (127.0.0.1)
- Added localhost verification middleware
- Added Helmet security headers
- Added CORS origin restrictions
- Added rate limiting (general, execute, destructive)
- Added request body size limits
- Added Zod validation for web API endpoints
- Added global error handler
