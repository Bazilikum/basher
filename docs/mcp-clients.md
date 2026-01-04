# MCP Clients Configuration

Basher works with any MCP-compatible AI client. Below are configuration instructions for popular clients.

## Claude Code (CLI)

The recommended way to use Basher:

```bash
claude mcp add --transport stdio basher --env WEB_PORT=3000 --env LOG_LEVEL=info -- npx -y github:Bazilikum/basher --project "$(pwd)"
```

**Verify installation:**
```bash
claude mcp list
```

## Cline (VS Code)

Cline uses VS Code's settings.json for MCP configuration:

1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`)
2. Search for: **"Cline: MCP Settings"**
3. Click "Edit in settings.json"
4. Add Basher configuration:

```json
{
  "cline.mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

## Cursor IDE

Cursor stores MCP configuration in its own settings:

1. Open Cursor Settings (`Cmd+,` / `Ctrl+,`)
2. Navigate to: **Features → Model Context Protocol**
3. Add Basher configuration:

```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

## Windsurf IDE

1. Open Windsurf Settings → MCP Servers
2. Add the same JSON configuration as Cursor above

## Claude Desktop

Claude Desktop uses a separate configuration file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "basher": {
      "command": "npx",
      "args": ["-y", "github:Bazilikum/basher"],
      "env": {
        "LOG_LEVEL": "info",
        "WEB_PORT": "3000"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config file.

## Project-Specific Configuration

For project-scoped isolation, use `.mcp.json` in your project root:

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

This ensures:
- Each project gets its own `.basher/history.db` database
- Command history is completely isolated per project
- Team members automatically get the correct configuration

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

## MCP Inspector (Testing)

Test Basher tools interactively with the official MCP inspector:

```bash
npx @modelcontextprotocol/inspector npx -y github:Bazilikum/basher
```

Opens at http://localhost:5173 with a web UI to test all MCP tools without needing an AI client.

## Basher Light (Minimal Mode)

For maximum context efficiency (~80% fewer tokens in tool definitions):

```bash
claude mcp add --transport stdio basher-light -- npx -y github:Bazilikum/basher/dist/index-light.js --project "$(pwd)"
```

**Basher Light includes:**
- `execute_command` - Run commands with history
- `get_command` - Look up results by ID or processId
- `get_running_commands` - List running commands
- `terminate_command` - Stop a running command
- `get_version` - Version info
