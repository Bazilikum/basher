# Basher API Reference

This document covers all MCP tools and Web API endpoints provided by Basher.

## MCP Tools

Basher provides 31 MCP tools organized into categories.

### Command Execution

#### `execute_command`

Execute a shell command with comprehensive tracking.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| command | string | Yes | Shell command to execute |
| cwd | string | No | Working directory |
| timeout | number | No | Timeout in milliseconds |
| title | string | No | Display title for the command |
| background | boolean | No | Run in background (default: true) |
| parseAs | string | No | Output parser: jest, pytest, eslint, tsc, json, auto |
| waitFor | string | No | Regex pattern to wait for in output |
| waitTimeout | number | No | Wait timeout in ms (default: 30000) |
| stdin | string | No | Input to pipe to command |
| outputMode | string | No | full, smart, tail |
| analyzeFailure | boolean | No | Auto-analyze failures (default: true) |
| diffWithLast | boolean | No | Compare with last similar command |
| trackProgress | boolean | No | Track progress indicators |
| retry | object | No | Retry configuration |

**Returns:**
```json
{
  "id": 123,
  "processId": 123456789,
  "command": "npm test",
  "exitCode": 0,
  "duration": "1234ms",
  "stdout": "...",
  "stderr": "..."
}
```

#### `run_template`

Execute a saved command template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Template name |
| overrides | object | No | Override template settings |

### Process Management

#### `terminate_command`

Terminate a running command.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | Process ID to terminate |

#### `get_running_commands`

List all currently running commands.

**Parameters:** None

**Returns:**
```json
{
  "count": 2,
  "running": [
    {"id": 123, "pid": 1234, "command": "npm test", "title": "Tests", "duration": "5000ms"}
  ]
}
```

#### `get_process_output`

Get current output from a running command.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | Process ID |
| lines | number | No | Last N lines to retrieve |

#### `poll_until_complete`

Wait for a command to complete and return results.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | Process ID |
| pollInterval | number | No | Poll interval in ms (default: 1000) |
| timeout | number | No | Max wait time (default: 300000) |

### History Tools

#### `search_command_history`

Full-text search across command history.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query |
| limit | number | No | Max results (default: 50) |

#### `get_recent_commands`

Get most recent command executions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | number | No | Number to retrieve (default: 100) |
| outputFormat | string | No | json or toon |

#### `get_command_by_id`

Retrieve a command by database ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| commandId | number | Yes | Command ID |

#### `get_command_by_process_id`

Look up a command by its process ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | Process ID |

#### `get_command_stats`

Get execution statistics.

**Parameters:** None

**Returns:**
```json
{
  "total": 150,
  "failures": 10,
  "avgDuration": 2345.67
}
```

#### `advanced_search`

Search with advanced filters and output modes.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query |
| filters | object | No | Advanced filters |
| outputLevel | string | No | summary, preview, excerpts, full |
| outputFormat | string | No | json or toon |
| limit | number | No | Max results |

#### `get_aggregations`

Get aggregated statistics.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| groupBy | string | Yes | command, cwd, exitCode, hour, day |
| includeStats | boolean | No | Include detailed stats |
| limit | number | No | Max groups |
| filters | object | No | Apply filters |

#### `compare_executions`

Compare output between two commands.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| commandId1 | number | Yes | First command ID |
| commandId2 | number | Yes | Second command ID |

#### `get_last_failures`

Get recent failed commands.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | number | No | Max failures (default: 10) |
| outputLevel | string | No | Output detail level |
| since | string | No | ISO date string |

#### `get_similar_commands`

Find commands similar to a reference.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| commandId | number | Yes | Reference command ID |
| limit | number | No | Max results |
| outputLevel | string | No | Output detail level |

#### `get_command_chain`

Get sequence of commands in same directory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| startId | number | Yes | Center command ID |
| maxCommands | number | No | Max in chain (default: 10) |
| outputLevel | string | No | Output detail level |

### Template Tools

#### `save_template`

Save a reusable command template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Template name |
| command | string | Yes | Command to save |
| title | string | No | Display title |
| description | string | No | Template description |
| tags | array | No | Tags for organization |
| ... | ... | No | Other execute options |

#### `list_templates`

List saved templates.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| tag | string | No | Filter by tag |

#### `delete_template`

Delete a saved template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Template name |

### Session Tools

#### `start_session`

Start a new command session.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Session name |
| description | string | No | Session description |

#### `end_session`

End the current session.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| status | string | No | completed or abandoned |

#### `get_session`

Get session details.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | No | Session name |
| id | number | No | Session ID |

#### `list_sessions`

List all sessions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| status | string | No | Filter by status |
| limit | number | No | Max results |

### Whitelist Tools

#### `whitelist_command`

Add a command to the whitelist with optional argument restrictions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| command_base | string | Yes | Command base (e.g., "npm") |
| description | string | No | Why whitelisted |
| allowedArgs | string[] | No | Regex patterns for permitted arguments |
| blockedArgs | string[] | No | Regex patterns for denied arguments |

**Argument Validation:**
- If `allowedArgs` is set, command arguments must match at least one pattern
- If `blockedArgs` is set, command is blocked if any pattern matches
- `blockedArgs` takes precedence over `allowedArgs`

**Example:**
```json
{
  "command_base": "rm",
  "description": "Remove files (restricted)",
  "allowedArgs": ["^-r\\s", "^-f\\s"],
  "blockedArgs": ["--no-preserve-root", "-rf\\s+/"]
}
```

#### `list_whitelisted_commands`

List all whitelisted commands.

**Parameters:** None

#### `remove_whitelisted_command`

Remove a command from whitelist.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| command_base | string | Yes | Command to remove |

### Admin Tools

#### `get_version`

Get Basher version info.

**Parameters:** None

#### `get_server_info`

Get server information including Web UI URL.

**Parameters:** None

#### `clear_history`

Clear all command history.

**Parameters:** None

---

## Web API Endpoints

When the web server is enabled, these REST endpoints are available.

### Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/execute` | Execute a command |
| GET | `/api/running` | Get running commands |
| GET | `/api/process/:id/output` | Get process output |
| POST | `/api/process/:id/terminate` | Terminate process |
| POST | `/api/process/:id/poll` | Poll until complete |

### History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/history` | Get recent history |
| GET | `/api/history/:id` | Get command by ID |
| GET | `/api/search` | Search history |
| GET | `/api/stats` | Get statistics |
| DELETE | `/api/history` | Clear history |

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List templates |
| POST | `/api/templates` | Save template |
| POST | `/api/templates/:name/run` | Run template |
| DELETE | `/api/templates/:name` | Delete template |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List sessions |
| POST | `/api/sessions/start` | Start session |
| POST | `/api/sessions/end` | End session |
| GET | `/api/sessions/:id` | Get session |

### Whitelist

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/whitelist` | List whitelist |
| POST | `/api/whitelist` | Add to whitelist |
| DELETE | `/api/whitelist/:command` | Remove from whitelist |

### Server-Sent Events

| Endpoint | Description |
|----------|-------------|
| `/api/events` | Real-time event stream |

**Event Types:**
- `command_started` - New command started
- `command_completed` - Command finished
- `command_terminated` - Command was killed
- `output_update` - New output available

---

## Error Codes

| Code | Description |
|------|-------------|
| `COMMAND_NOT_WHITELISTED` | Command base not in whitelist |
| `COMMAND_TIMEOUT` | Command exceeded timeout |
| `PROCESS_NOT_FOUND` | Process ID not found |
| `TEMPLATE_NOT_FOUND` | Template does not exist |
| `SESSION_NOT_FOUND` | Session does not exist |
| `INVALID_PARAMETERS` | Invalid tool parameters |

---

## Rate Limits

Web API endpoints have rate limiting:
- Default: 200 requests/minute
- Execute: 60 requests/minute
- Destructive: 10 requests/minute

### Per-Command Rate Limits

Certain commands have stricter per-command rate limits:

| Command | Limit | Window |
|---------|-------|--------|
| `rm`, `sudo` | 5 | 1 minute |
| `chmod`, `chown` | 10 | 1 minute |
| `wget` | 20 | 1 minute |
| `curl`, `docker` | 30 | 1 minute |
| `npm`, `git` | 60 | 1 minute |
