# MCP Tools Reference

Basher provides 27 MCP tools organized into categories.

## Command Execution

### `execute_command`

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
| timestamps | boolean | No | Add per-line timestamps (default: false) |
| analyzeFailure | boolean | No | Auto-analyze failures (default: true) |
| diffWithLast | boolean | No | Compare with last similar command |
| trackProgress | boolean | No | Track progress indicators |
| retry | object | No | Retry configuration |

**Execution Modes:**

| Mode | Parameters | Behavior |
|------|------------|----------|
| Background | `background: true` (default) | Returns immediately with `processId` |
| Synchronous | `background: false` | Waits for command to complete |
| Wait for Pattern | `waitFor: "pattern"` | Waits until pattern matches in output |

**Examples:**

```typescript
// Background
{ "command": "npm run build" }

// Wait for specific output
{
  "command": "npm run dev",
  "waitFor": "Listening on port",
  "waitTimeout": 60000
}

// Parse test output
{
  "command": "npm test",
  "background": false,
  "parseAs": "jest"
}

// Retry with exponential backoff
{
  "command": "curl https://api.example.com/health",
  "retry": { "attempts": 3, "backoff": "exponential", "delayMs": 1000 }
}
```

---

## History & Search

### `search_command_history`

Search past command executions using full-text search.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query (searches command, stdout, stderr) |
| limit | number | No | Maximum results (default: 50) |
| exitCode | number | No | Filter by exit code |

### `get_recent_commands`

Retrieve the most recent command executions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | number | No | Number of commands (default: 100) |

### `get_command`

Retrieve a command by either its database ID or process ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| commandId | number | No* | The database ID of the command |
| processId | number | No* | The process ID returned by execute_command |

*One of `commandId` or `processId` must be provided.

### `clear_history`

Clear all command history from the database. This cannot be undone.

### `get_command_stats`

Get statistics about command execution history.

**Returns:** totalCommands, failedCommands, successRate, averageDuration

### `advanced_search`

Search with advanced filtering and tiered output levels for maximum token efficiency.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query for full-text search |
| limit | number | No | Maximum results (default: 50) |
| outputLevel | string | No | summary, preview, excerpts, full |
| contextLines | number | No | Lines of context for excerpts (default: 3) |
| filters | object | No | Advanced filters |

**Filters:**
- `dateRange`: { from, to } - ISO dates
- `workingDir`: Filter by working directory
- `commandPattern`: Glob pattern (e.g., "npm*")
- `exitCodes`: Array of exit codes
- `minDuration`, `maxDuration`: Duration range in ms
- `status`: "completed" | "running" | "terminated"
- `hasStderr`: Filter commands with/without stderr

### `get_aggregations`

Get aggregated statistics grouped by command, directory, exit code, or time.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| groupBy | string | Yes | command, cwd, exitCode, hour, day |
| includeStats | boolean | No | Include detailed statistics (default: true) |
| limit | number | No | Maximum number of groups |
| filters | object | No | Apply filters before aggregation |

### `compare_executions`

Compare output differences between two command executions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| commandId1 | number | Yes | First command ID |
| commandId2 | number | Yes | Second command ID |

### `get_last_failures`

Quick access to recent failed commands.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | number | No | Maximum failures (default: 10) |
| outputLevel | string | No | Output detail level |
| since | string | No | ISO date - only failures after this date |

### `get_similar_commands`

Find commands similar to a given command (same base command and working directory).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| commandId | number | Yes | Reference command ID |
| limit | number | No | Maximum results (default: 10) |
| outputLevel | string | No | Output detail level |

### `get_command_chain`

Get a sequence of commands executed in the same working directory around a specific command.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| startId | number | Yes | Center the chain around this command ID |
| maxCommands | number | No | Maximum commands in chain (default: 10) |
| outputLevel | string | No | Output detail level |

---

## Process Management

### `terminate_command`

Terminate a running command by its process ID. Sends SIGTERM, then SIGKILL after 5 seconds.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | The process ID to terminate |

### `get_running_commands`

Get a list of all currently running commands with their process IDs.

**Returns:** Array of { processId, command, startTime, duration }

### `get_process_output`

Get the current output from a running command by process ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | The process ID of the running command |
| lines | number | No | Number of last lines to retrieve |

---

## Templates (v1.8.0)

### `save_template`

Save a reusable command template with predefined settings.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Unique template name |
| command | string | Yes | The command to save |
| title | string | No | Human-readable title |
| cwd | string | No | Working directory |
| timeout | number | No | Timeout in milliseconds |
| parseAs | string | No | Parser type |
| waitFor | string | No | Pattern to wait for |
| waitTimeout | number | No | Wait timeout in ms |
| retry | object | No | Retry configuration |
| description | string | No | Template description |
| tags | string[] | No | Tags for categorization |

### `run_template`

Execute a saved command template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Template name to run |
| cwd | string | No | Override working directory |
| background | boolean | No | Override background setting |

### `list_templates`

List all saved command templates.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| tag | string | No | Filter by tag |

### `delete_template`

Delete a saved command template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Template name to delete |

---

## Sessions (v1.8.0)

### `start_session`

Start a new command session to group related commands together.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Session name |
| description | string | No | Session description |
| metadata | object | No | Custom metadata |

**Returns:** { id, name, status, startedAt, commandCount }

### `end_session`

End the current active session.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| status | string | No | completed (default) or abandoned |

### `get_session`

Get a session by ID or name.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | number | No* | Session ID |
| name | string | No* | Session name (gets most recent) |

*One parameter must be provided.

### `list_sessions`

List all command sessions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| status | string | No | Filter by status |
| limit | number | No | Maximum results (default: 50) |

---

## Whitelisting (v1.10.0)

See [Whitelisting](whitelisting.md) for complete documentation.

### `whitelist_command`

Add a command to the whitelist. AI must always ask for user permission first.

### `list_whitelisted_commands`

View all currently whitelisted commands.

### `remove_whitelisted_command`

Remove a command from the whitelist.

---

## Utilities

### `get_version`

Get the current version of Basher MCP server.

**Returns:** { name, version, description }

### `poll_until_complete`

Efficiently wait for a background command to complete without wasting tokens on repeated polling.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| processId | number | Yes | The process ID to wait for |
| pollInterval | number | No | How often to check in ms (default: 1000) |
| timeout | number | No | Maximum wait in ms (default: 300000) |
