# Basher - VS Code Extension

Fully integrated VS Code extension for Basher that brings command history, statistics, and live outputs directly into your editor.

## Features

### Left Sidebar Panel
- **Activity Bar Icon**: Terminal icon in the left activity bar
- **Command History View**: Scrollable list of all executed commands with:
  - Color-coded status indicators (✓ success / ✗ failed)
  - Timestamps and duration
  - Inline buttons for quick actions
  - Click to open output in editor pane
- **Statistics View**: Real-time stats including:
  - Total commands executed
  - Failed commands count
  - Success rate percentage
  - Average execution duration

### Editor Integration
- **Virtual Documents**: Command outputs open as read-only text documents in editor panes
- **Multi-pane Support**: Open multiple command outputs side-by-side
- **Full Output Display**: Organized view with:
  - Command details (working directory, exit code, duration, timestamp)
  - STDOUT section
  - STDERR section
  - Clear separation and formatting

### Real-time Updates
- **SSE Integration**: Automatic updates when new commands are executed
- **Auto-refresh**: Configurable refresh interval (default 5 seconds)
- **Notifications**: VS Code notifications when commands complete

### Actions
- **Refresh**: Manual refresh button in toolbar
- **Search**: Full-text search across all command history with quick pick
- **Rerun**: Execute any command again with one click
- **Open Web Dashboard**: Quick access to the full web UI

## Requirements

The Basher MCP server must be running for this extension to work.

## Installation

### From VSIX

1. Build the extension:
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   npm run package
   ```

2. Install in VS Code:
   - Open VS Code
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Extensions: Install from VSIX"
   - Select `basher-vscode-1.0.0.vsix`

### Development Mode

1. Open the `vscode-extension` folder in VS Code
2. Press `F5` to launch in Extension Development Host

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

## Configuration

Configure in VS Code Settings (`Cmd+,` or `Ctrl+,`):

- **Basher: Server URL**
  - URL of the web server (default: `http://localhost:3000`)

- **Basher: Refresh Interval**
  - Auto-refresh interval in milliseconds (default: 5000)
  - Set to 0 to disable auto-refresh

- **Basher: Max History Items**
  - Maximum commands to display in the tree (default: 100)

## Features in Detail

### Command List
Each command in the history view shows:
- Full command text as the label
- Success/failure indicator (✓/✗)
- Execution time and duration in the description
- Color-coded icon (green for success, red for failure)
- Hover tooltip with complete details

### Output Editor
When you click a command, it opens a virtual document showing:
```
================================================================================
Command: npm install
Working Directory: /Users/you/project
Exit Code: 0 ✓
Duration: 5234ms
Timestamp: 1/17/2025, 10:30:00 AM
================================================================================

────────────────────────────────────────────────────────────────────────────────
STDOUT:
────────────────────────────────────────────────────────────────────────────────
added 136 packages in 5.2s
...

────────────────────────────────────────────────────────────────────────────────
STDERR:
────────────────────────────────────────────────────────────────────────────────
(if any errors occurred)
```

### Search Functionality
Press the search icon in the Command History toolbar to:
1. Enter a search query
2. Search across commands, stdout, and stderr
3. Select from results in a quick pick menu
4. Open the selected command's output

### Rerun Commands
Click the play icon (▶) next to any command to:
1. Re-execute with the same parameters
2. See a notification when started
3. Get automatic refresh when completed
4. See the new execution appear at the top of the list

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

## Architecture

The extension consists of:

1. **TreeDataProvider** - Manages the command history tree view
2. **StatsProvider** - Displays execution statistics
3. **CommandOutputProvider** - Virtual document provider for outputs
4. **SSEClient** - Real-time updates via Server-Sent Events
5. **Commands** - Handlers for refresh, search, rerun, etc.

All communication with the MCP server happens via HTTP REST API and SSE.

## License

MIT
