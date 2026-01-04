# Installation

## Quick Install (Recommended)

Install Basher directly from GitHub using Claude Code with automatic project detection:

```bash
claude mcp add --transport stdio basher --env WEB_PORT=3000 --env LOG_LEVEL=info -- npx -y github:Bazilikum/basher --project "$(pwd)"
```

This command:
- Downloads and installs Basher automatically from GitHub
- Configures it as an MCP server in Claude Code
- Automatically creates a `.basher` folder in your project directory
- Stores command history isolated per project
- Sets up the web UI (auto-detects available port starting from 3000)
- No manual cloning or building required

**Verify installation:**
```bash
claude mcp list
```

You should see `basher` in the list of configured servers.

## Basher Light (Minimal Mode)

For maximum context efficiency, use Basher Light with only 5 essential tools (~80% fewer tokens in definitions):

```bash
claude mcp add --transport stdio basher-light -- npx -y github:Bazilikum/basher/dist/index-light.js --project "$(pwd)"
```

**Basher Light includes:**
- `execute_command` - Run commands with history
- `get_command` - Look up results by ID or processId
- `get_running_commands` - List running commands
- `terminate_command` - Stop a running command
- `get_version` - Version info

**When to use Light vs Full:**
| Use Case | Recommendation |
|----------|----------------|
| Simple command execution | Basher Light |
| Need history search/analytics | Full Basher |
| Context-constrained environments | Basher Light |
| Complex workflows with sessions | Full Basher |

## Manual Installation (For Development)

If you want to develop or modify Basher:

1. **Clone and build:**

```bash
git clone https://github.com/Bazilikum/basher.git
cd basher
npm install
npm run build
```

2. **Add to Claude Code:**

```bash
claude mcp add --transport stdio basher --env WEB_PORT=3000 --env LOG_LEVEL=info -- node $(pwd)/dist/index.js --project "$(pwd)"
```

## Share with Your Team

Create `.mcp.json` in your project root to share the configuration:

```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher", "--project", "${workspaceFolder}"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

**Note**: `${workspaceFolder}` will be automatically replaced with the actual project path by Claude Code.

Commit this file to version control, and your team automatically gets Basher configured with project-specific isolation when they open the project.

## Environment Variables

Configure Basher via environment variables in your MCP config:

```json
{
  "env": {
    "LOG_LEVEL": "debug",           // trace, debug, info, warn, error, fatal
    "WEB_PORT": "3000",              // Starting port for web UI (auto-increments if busy)
    "DB_PATH": "./custom.db",        // Custom database location (optional)
    "BASHER_MAX_ENTRIES": "1000",    // Max commands to keep (default: 1000)
    "BASHER_MAX_AGE_DAYS": "7"       // Max age in days (default: 7)
  }
}
```

### Auto-Cleanup

Basher automatically cleans up old command history to prevent unbounded database growth. Cleanup runs on startup and after each command execution.

- **By count**: Keeps only the most recent N commands (default: 1000)
- **By age**: Removes commands older than N days (default: 7)
- Whichever limit is hit first triggers cleanup

Example for a smaller, faster database:
```json
{
  "env": {
    "BASHER_MAX_ENTRIES": "500",
    "BASHER_MAX_AGE_DAYS": "3"
  }
}
```

## Running Multiple Instances Simultaneously

With the `--project` argument, Basher automatically creates isolated `.basher` folders in each project. Simply configure unique web ports for each project:

### Using Project-Scoped `.mcp.json` (Recommended)

Create `.mcp.json` in each project root:

**Project A** (`.mcp.json`):
```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher", "--project", "${workspaceFolder}"],
      "env": {
        "WEB_PORT": "3001",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Project B** (`.mcp.json`):
```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher", "--project", "${workspaceFolder}"],
      "env": {
        "WEB_PORT": "3002",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**What Happens Automatically:**
- ✅ Each project gets its own `.basher/history.db` database
- ✅ `.basher/.gitignore` is auto-created to exclude database and runtime files
- ✅ Port auto-detection: if configured port is busy, finds next available
- ✅ VS Code extension reads from shared database
- ✅ Command history is completely isolated per project
- ✅ No manual path configuration needed
- ✅ Multiple instances can run simultaneously without conflicts

**Legacy DB_PATH Support:**

For backward compatibility, you can still use explicit paths:

```json
{
  "env": {
    "DB_PATH": "/absolute/path/to/custom/location/history.db",
    "WEB_PORT": "3000"
  }
}
```
