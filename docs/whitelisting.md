# Command Whitelisting

Basher includes a command whitelisting system that provides defense-in-depth security by requiring explicit approval for command bases before they can be executed.

## How It Works

1. **Command Base Extraction**: When a command is executed, Basher extracts the base command (e.g., `npm install express` → `npm`)
2. **Whitelist Check**: The command base is checked against the whitelist
3. **Blocked Commands**: If not whitelisted, the command is blocked with instructions for the AI to request user approval
4. **Approval Flow**: AI must ask the user for permission, then use `whitelist_command` tool to add it

## Default Whitelisted Commands

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

## Whitelist Configuration

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

## Tools

### `whitelist_command`

Add a command to the whitelist. **IMPORTANT**: AI must always ask for user permission before calling this tool.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| command_base | string | Yes | The base command to whitelist (e.g., "rm", "kubectl") |
| description | string | No | Description of the command |

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

### `list_whitelisted_commands`

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

### `remove_whitelisted_command`

Remove a command from the whitelist.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| command_base | string | Yes | The base command to remove |

**Example:**
```typescript
{
  "command_base": "dangerous-cmd"
}
```

## Blocked Command Response

When a command is blocked, the response includes:

```json
{
  "status": "blocked",
  "error": "COMMAND_NOT_WHITELISTED",
  "commandBase": "rm",
  "message": "Command 'rm' is not whitelisted.",
  "instructions": "Ask user for permission, then use whitelist_command tool"
}
```

The AI will then ask the user:
> "May I whitelist the 'rm' command to proceed?"

Once approved, the AI calls `whitelist_command` and retries the original command.
