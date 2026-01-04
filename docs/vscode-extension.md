# VS Code Extension

The Basher VS Code extension provides a native sidebar panel to browse command history without leaving your editor.

## Installation

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/Bazilikum/basher/releases)
2. In VS Code: `Cmd+Shift+P` → **"Extensions: Install from VSIX..."**
3. Select the downloaded `basher-vscode-x.x.x.vsix` file

## Features

### Left Sidebar Panel

- **Activity Bar Icon**: Terminal icon in the left activity bar
- **Command History View**: Scrollable list of all executed commands with:
  - Color-coded status indicators (✓ success / ✗ failed / ⏳ running)
  - Custom command titles (human-readable names instead of raw shell commands)
  - Timestamps and duration
  - Inline buttons for quick actions
  - Click to open output in editor pane
  - Real-time updates every 1 second

### Running Commands Monitor

- **Split layout** showing multiple commands simultaneously
- **Real-time output streaming** (updates every 500ms)
- **Auto-scroll** to latest output
- **Last 10 lines** of stdout displayed for each command
- **Command duration timer**
- **Automatic removal** when commands complete

### Editor Integration

- **Virtual Documents**: Command outputs open as read-only text documents in editor panes
- **Multi-pane Support**: Open multiple command outputs side-by-side
- **Full Output Display**: Organized view with:
  - Command details (working directory, exit code, duration, timestamp)
  - Command title (if provided)
  - Tabbed interface for STDOUT/STDERR/METADATA
  - Syntax highlighting for command output
  - Clear separation and formatting

- **Live Output Streaming**: Watch commands execute in real-time
  - Auto-scroll toggle to follow latest output
  - Per-line timestamps for precise debugging
  - Incremental updates without tab switching

### Real-time Updates

- **SSE Integration**: Automatic updates when new commands are executed
- **Auto-refresh**: Configurable refresh interval (default 5 seconds)
- **Notifications**: VS Code notifications when commands complete

### Actions

- **Refresh**: Manual refresh button in toolbar
- **Search**: Full-text search across all command history with quick pick
- **Rerun**: Execute any command again with one click
- **Open Web Dashboard**: Quick access to the full web UI

## Configuration

Set these in VS Code Settings (`Cmd+,` or `Ctrl+,`):

```json
{
  "basher.serverUrl": "http://localhost:3000",
  "basher.autoRefresh": true,
  "basher.refreshInterval": 5000,
  "basher.maxHistoryItems": 100
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| serverUrl | URL of the Basher web server | http://localhost:3000 |
| autoRefresh | Enable auto-refresh | true |
| refreshInterval | Auto-refresh interval in milliseconds | 5000 |
| maxHistoryItems | Maximum commands to display | 100 |

## Workspace Isolation

The extension automatically isolates commands by workspace using the shared SQLite database:

1. **Shared Database**: All Basher instances in a workspace write to the same `.basher/history.db` database
2. **Direct Database Access**: The extension reads command history directly from the database using sql.js
3. **Multi-Project Support**: Each workspace has its own `.basher/` folder with isolated history
4. **Independent Instances**: Each terminal can run its own Basher server on different ports (auto-discovered)

**How it works:**
- When you open a project with a `.mcp.json` configuration that includes `--project "${workspaceFolder}"`, Basher creates a `.basher/` folder in that project
- All terminals write to the same `history.db` database
- The VS Code extension reads directly from this database
- Commands from different projects are completely isolated

**No configuration needed** - it just works!

## Usage

1. Start the Basher MCP server:
   ```bash
   npm start
   ```

2. In VS Code, click the **terminal icon** in the left activity bar

3. The extension will show:
   - **Command History** panel with all executed commands
   - **Statistics** panel with execution metrics

4. Click any command in the list to open its output in an editor pane

5. Use the toolbar buttons to:
   - Refresh the history
   - Search for commands
   - Open the web dashboard

6. Right-click (or use inline buttons) on any command to:
   - View full output
   - Rerun the command

## Troubleshooting

### Extension doesn't activate
- Ensure the MCP server is running (`npm start` in project root)
- Check the server URL in settings matches where the server is running
- Look for errors in VS Code Developer Tools (Help > Toggle Developer Tools)

### Command list is empty
- Click the refresh button in the toolbar
- Verify the server URL is correct in settings
- Check that commands have been executed via the MCP server

### Output doesn't open
- Ensure the command is still in the history (check max history items setting)
- Try refreshing the history
- Check the VS Code console for errors

### Real-time updates not working
- SSE connection may have failed
- Check network connectivity to the server
- Auto-refresh (every 5 seconds) will still work as fallback
