import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database } from 'sql.js';
import { CommandOutputPanel } from './outputPanel';

// Types
interface CommandHistoryItem {
  id: number;
  command: string;
  cwd: string;
  timestamp: string;
  exitCode: number;
  duration: number;
  stdout: string;
  stderr: string;
  processId?: number;
  status?: 'completed' | 'running';
}

interface RunningProcess {
  id: number;
  pid: number;
  command: string;
  title: string;
  duration: number;
}

interface Stats {
  total: number;
  failures: number;
  avgDuration: number;
}

interface ServerEntry {
  port: number;
  pid: number;
  startTime: string;
  cwd: string;
}

// Web Servers Tree Data Provider
class WebServersProvider implements vscode.TreeDataProvider<ServerTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ServerTreeItem | undefined | null | void> = new vscode.EventEmitter<ServerTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ServerTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private servers: ServerEntry[] = [];
  private refreshInterval: NodeJS.Timeout | undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.startAutoRefresh();
  }

  private startAutoRefresh(): void {
    // Refresh every 5 seconds
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, 5000);
  }

  public stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  refresh(): void {
    this.loadServers();
    this._onDidChangeTreeData.fire();
  }

  private loadServers(): void {
    this.servers = [];

    // Check workspace folder first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const serversFile = path.join(workspaceFolders[0].uri.fsPath, '.basher', 'servers.json');
      this.readServersFile(serversFile);
    }

    // Also check home directory
    const homePath = process.env.HOME || process.env.USERPROFILE || '';
    const homeServersFile = path.join(homePath, '.basher', 'servers.json');
    if (homeServersFile !== path.join(workspaceFolders?.[0]?.uri.fsPath || '', '.basher', 'servers.json')) {
      this.readServersFile(homeServersFile);
    }

    // Filter out stale entries (check if PIDs are alive)
    this.servers = this.servers.filter(s => this.isProcessAlive(s.pid));

    // Deduplicate by port
    const seen = new Set<number>();
    this.servers = this.servers.filter(s => {
      if (seen.has(s.port)) return false;
      seen.add(s.port);
      return true;
    });
  }

  private readServersFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          this.servers.push(...parsed);
        }
      }
    } catch (error) {
      console.error('[Basher] Failed to read servers.json:', error);
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  getTreeItem(element: ServerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ServerTreeItem): Thenable<ServerTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    this.loadServers();

    if (this.servers.length === 0) {
      const noServers = new ServerTreeItem(
        'No running servers',
        vscode.TreeItemCollapsibleState.None
      );
      noServers.iconPath = new vscode.ThemeIcon('info');
      noServers.description = 'Start a basher instance to see Web UI links';
      return Promise.resolve([noServers]);
    }

    return Promise.resolve(
      this.servers.map(server => {
        const item = new ServerTreeItem(
          `http://localhost:${server.port}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('globe');
        item.description = path.basename(server.cwd);
        item.tooltip = `Port: ${server.port}\nPID: ${server.pid}\nStarted: ${new Date(server.startTime).toLocaleString()}\nDirectory: ${server.cwd}`;
        item.command = {
          command: 'commandNConquer.openServerUrl',
          title: 'Open Web UI',
          arguments: [server.port]
        };
        item.contextValue = 'webServer';
        return item;
      })
    );
  }

  public getServers(): ServerEntry[] {
    this.loadServers();
    return this.servers;
  }
}

class ServerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

// Command History Tree Data Provider
class CommandHistoryProvider implements vscode.TreeDataProvider<CommandTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommandTreeItem | undefined | null | void> = new vscode.EventEmitter<CommandTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CommandTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private commands: CommandHistoryItem[] = [];
  private runningCommands: CommandHistoryItem[] = [];
  private dbPath: string | null = null;
  private lastError: string | null = null;
  private serverPort: number = 3000;
  private isLoading: boolean = false; // Prevent concurrent refreshes

  constructor(private context: vscode.ExtensionContext) {
    this.findDatabasePath();
    this.findServerPort();
  }

  /**
   * Find the .basher/history.db file in the workspace
   */
  private findDatabasePath(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const basherDir = path.join(workspaceFolders[0].uri.fsPath, '.basher');
      const dbFile = path.join(basherDir, 'history.db');
      if (fs.existsSync(dbFile)) {
        this.dbPath = dbFile;
      }
    }
  }

  /**
   * Find the server port from .basher/port file
   */
  private findServerPort(): void {
    // Try workspace folder first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const portFile = path.join(workspaceFolders[0].uri.fsPath, '.basher', 'port');
      try {
        if (fs.existsSync(portFile)) {
          const portContent = fs.readFileSync(portFile, 'utf-8').trim();
          const parsedPort = parseInt(portContent, 10);
          if (!isNaN(parsedPort)) {
            this.serverPort = parsedPort;
            console.log('[Basher] Found workspace-specific port:', parsedPort);
            return;
          }
        }
      } catch (error) {
        // Continue to home directory fallback
      }
    }

    // Fallback to home directory (for global basher instances)
    try {
      const homeDir = require('os').homedir();
      const portFile = path.join(homeDir, '.basher', 'port');
      if (fs.existsSync(portFile)) {
        const portContent = fs.readFileSync(portFile, 'utf-8').trim();
        const parsedPort = parseInt(portContent, 10);
        if (!isNaN(parsedPort)) {
          this.serverPort = parsedPort;
          console.log('[Basher] Found global port in home directory:', parsedPort);
          return;
        }
      }
    } catch (error) {
      // Use default port
    }

    console.log('[Basher] Using default port:', this.serverPort);
  }

  refresh(): void {
    this.findDatabasePath(); // Re-check in case it was created
    this.findServerPort(); // Re-check port
    this.loadCommands();
  }

  async loadCommands(): Promise<void> {
    // Prevent concurrent refreshes which cause flickering
    if (this.isLoading) {
      console.log('[Basher] Skipping loadCommands - already loading');
      return;
    }

    this.isLoading = true;
    try {
      this.lastError = null; // Clear previous errors

      if (!this.dbPath || !fs.existsSync(this.dbPath)) {
        this.commands = [];
        this.runningCommands = [];
        this.lastError = !this.dbPath ? 'No workspace folder found' : 'Database file not found';
        this._onDidChangeTreeData.fire();
        return;
      }

      const config = vscode.workspace.getConfiguration('commandNConquer');
      const limit = config.get<number>('maxHistoryItems') || 100;

      // Read ALL commands from SQLite database (both running and completed)
      // This is the single source of truth now
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(this.dbPath);
      const db = new SQL.Database(fileBuffer);

      const result = db.exec(`
        SELECT id, command, title, cwd, timestamp, exit_code, duration, stdout, stderr, process_id, status
        FROM command_history
        ORDER BY
          CASE WHEN status = 'running' THEN 0 ELSE 1 END,
          id DESC
        LIMIT ${limit}
      `);

      // Clear both arrays
      this.runningCommands = [];
      this.commands = [];

      if (result.length > 0 && result[0].values.length > 0) {
        for (const row of result[0].values) {
          const status = (row[10] as string) || 'completed';
          const item: CommandHistoryItem = {
            id: row[0] as number,
            command: (row[2] as string) || (row[1] as string), // Use title if available
            cwd: (row[3] as string) || '',
            timestamp: row[4] as string,
            exitCode: row[5] as number,
            duration: row[6] as number,
            stdout: (row[7] as string) || '',
            stderr: (row[8] as string) || '',
            processId: row[9] as number | undefined,
            status: status === 'running' ? 'running' : 'completed'
          };

          if (status === 'running') {
            this.runningCommands.push(item);
          } else {
            this.commands.push(item);
          }
        }
      }

      db.close();
      this._onDidChangeTreeData.fire();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Basher] Failed to load commands from database:', error);
      this.lastError = `Error loading database: ${errorMsg}`;
      this.commands = [];
      this.runningCommands = [];
      this._onDidChangeTreeData.fire();
    } finally {
      this.isLoading = false;
    }
  }

  getTreeItem(element: CommandTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CommandTreeItem): Thenable<CommandTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    if (this.lastError && this.runningCommands.length === 0) {
      // Show error message only if no running commands
      const errorItem = new vscode.TreeItem(
        this.lastError,
        vscode.TreeItemCollapsibleState.None
      );
      errorItem.iconPath = new vscode.ThemeIcon('error');
      errorItem.contextValue = 'error';
      errorItem.tooltip = `Database path: ${this.dbPath || 'Not found'}`;
      return Promise.resolve([errorItem as any]);
    }

    if (this.commands.length === 0 && this.runningCommands.length === 0) {
      // Show a placeholder when no commands are available
      const placeholder = new vscode.TreeItem(
        'No commands found',
        vscode.TreeItemCollapsibleState.None
      );
      placeholder.description = 'Execute commands via MCP';
      placeholder.iconPath = new vscode.ThemeIcon('info');
      placeholder.contextValue = 'placeholder';
      return Promise.resolve([placeholder as any]);
    }

    // Show running commands first, then completed commands
    const items = [
      ...this.runningCommands.map(cmd => new CommandTreeItem(cmd, this.context, this.serverPort)),
      ...this.commands.map(cmd => new CommandTreeItem(cmd, this.context, this.serverPort))
    ];

    return Promise.resolve(items);
  }

  getCommand(id: number): CommandHistoryItem | undefined {
    // Now that everything comes from DB with consistent IDs,
    // just search both arrays by database id
    const runningCmd = this.runningCommands.find(cmd => cmd.id === id);
    if (runningCmd) {
      return runningCmd;
    }

    return this.commands.find(cmd => cmd.id === id);
  }

  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }
}

// Command Tree Item
class CommandTreeItem extends vscode.TreeItem {
  constructor(
    public readonly commandData: CommandHistoryItem,
    private context: vscode.ExtensionContext,
    private serverPort: number = 3000
  ) {
    super(commandData.command, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    this.iconPath = this.getIcon();
    this.contextValue = commandData.status === 'running' ? 'runningCommandItem' : 'commandItem';

    // Make it clickable to open output - always use database ID now
    this.command = {
      command: 'commandNConquer.openOutput',
      title: 'Open Output',
      arguments: [commandData.id, commandData.status === 'running']
    };
  }

  private getTooltip(): string {
    if (this.commandData.status === 'running') {
      return `ID: #${this.commandData.id}\n` +
             `Command: ${this.commandData.command}\n` +
             `Status: ⏳ Running\n` +
             `Duration: ${this.commandData.duration}ms`;
    }

    const success = this.commandData.exitCode === 0;
    return `Database ID: #${this.commandData.id}\n` +
           `Command: ${this.commandData.command}\n` +
           `Exit Code: ${this.commandData.exitCode}\n` +
           `Duration: ${this.commandData.duration}ms\n` +
           `Working Directory: ${this.commandData.cwd}\n` +
           `Timestamp: ${new Date(this.commandData.timestamp).toLocaleString()}\n` +
           `Status: ${success ? '✓ Success' : '✗ Failed'}`;
  }

  private getDescription(): string {
    if (this.commandData.status === 'running') {
      // For running commands, show process ID with P prefix to distinguish from database ID
      const durationSec = (this.commandData.duration / 1000).toFixed(1);
      return `P${this.commandData.processId} ⏳ Running [${durationSec}s]`;
    }

    // For completed commands, show database ID
    const idPrefix = `#${this.commandData.id}`;
    const date = new Date(this.commandData.timestamp);
    const timeStr = date.toLocaleTimeString();
    const success = this.commandData.exitCode === 0;
    const statusIcon = success ? '✓' : '✗';
    return `${idPrefix} ${statusIcon} ${timeStr} [${this.commandData.duration}ms]`;
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.commandData.status === 'running') {
      return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
    }

    const success = this.commandData.exitCode === 0;
    if (success) {
      return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else {
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    }
  }
}

// Statistics Tree Data Provider
class RunningCommandsProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _updateInterval?: NodeJS.Timeout;
  private serverPort: number = 3000;
  private dbPath: string | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.findServerPort();
    this.findDatabasePath();
  }

  /**
   * Find the .basher/history.db file in the workspace
   */
  private findDatabasePath(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const dbPath = path.join(workspacePath, '.basher', 'history.db');
      if (fs.existsSync(dbPath)) {
        this.dbPath = dbPath;
        return;
      }
    }
    // Try home directory
    const homePath = process.env.HOME || process.env.USERPROFILE || '';
    const homeDbPath = path.join(homePath, '.basher', 'history.db');
    if (fs.existsSync(homeDbPath)) {
      this.dbPath = homeDbPath;
    }
  }

  /**
   * Find the server port from .basher/port file
   */
  private findServerPort(): void {
    // Try workspace folder first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const portFile = path.join(workspacePath, '.basher', 'port');

      console.log(`[Basher] Looking for workspace port file at: ${portFile}`);

      try {
        if (fs.existsSync(portFile)) {
          const portContent = fs.readFileSync(portFile, 'utf-8').trim();
          const parsedPort = parseInt(portContent, 10);
          if (!isNaN(parsedPort)) {
            console.log(`[Basher] Found workspace-specific port ${parsedPort} in ${workspacePath}`);
            this.serverPort = parsedPort;
            return;
          } else {
            console.warn(`[Basher] Invalid port in workspace file: ${portContent}`);
          }
        } else {
          console.log(`[Basher] Workspace port file not found`);
        }
      } catch (error) {
        console.error(`[Basher] Error reading workspace port file:`, error);
      }
    }

    // Fallback to home directory (for global basher instances)
    try {
      const homeDir = require('os').homedir();
      const portFile = path.join(homeDir, '.basher', 'port');

      console.log(`[Basher] Looking for global port file at: ${portFile}`);

      if (fs.existsSync(portFile)) {
        const portContent = fs.readFileSync(portFile, 'utf-8').trim();
        const parsedPort = parseInt(portContent, 10);
        if (!isNaN(parsedPort)) {
          console.log(`[Basher] Found global port ${parsedPort} in home directory`);
          this.serverPort = parsedPort;
          return;
        } else {
          console.warn(`[Basher] Invalid port in global file: ${portContent}`);
        }
      } else {
        console.log(`[Basher] Global port file not found`);
      }
    } catch (error) {
      console.error(`[Basher] Error reading global port file:`, error);
    }

    console.log(`[Basher] Using default port ${this.serverPort}`);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Start polling for updates every 500ms
    this.startUpdating();

    // Clean up when view is disposed
    webviewView.onDidDispose(() => {
      this.stopUpdating();
    });

    // Handle visibility changes
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.startUpdating();
      } else {
        this.stopUpdating();
      }
    });
  }

  private startUpdating() {
    if (this._updateInterval) {
      return;
    }

    // Initial update
    this.updateRunningCommands();

    // Update every 500ms
    this._updateInterval = setInterval(() => {
      this.updateRunningCommands();
    }, 500);
  }

  private stopUpdating() {
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = undefined;
    }
  }

  private async updateRunningCommands() {
    if (!this._view) {
      return;
    }

    try {
      // Refresh port before each request
      this.findServerPort();
      const running = await this.fetchRunningCommands();
      this._view.webview.postMessage({ type: 'update', commands: running });
    } catch (error) {
      console.error('[Basher] Failed to fetch running commands:', error);
    }
  }

  private async fetchRunningCommands(): Promise<any[]> {
    // Read running commands from DB (single source of truth)
    // Output is now periodically flushed to DB by the server
    this.findDatabasePath(); // Refresh path

    if (!this.dbPath || !fs.existsSync(this.dbPath)) {
      return [];
    }

    try {
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(this.dbPath);
      const db = new SQL.Database(fileBuffer);

      const result = db.exec(`
        SELECT id, command, title, cwd, timestamp, exit_code, duration, stdout, stderr, process_id, status
        FROM command_history
        WHERE status = 'running'
        ORDER BY id DESC
      `);

      db.close();

      if (result.length === 0 || result[0].values.length === 0) {
        return [];
      }

      // Map DB rows to running commands format
      // Output is now read directly from DB (periodically updated by server)
      const runningFromDb = result[0].values.map((row: any[]) => ({
        id: row[0] as number,
        command: (row[2] as string) || (row[1] as string),
        title: row[2] as string,
        cwd: (row[3] as string) || '',
        timestamp: row[4] as string,
        duration: Date.now() - new Date(row[4] as string).getTime(),
        processId: row[9] as number,
        isRunning: true,
        stdout: (row[7] as string) || '', // Read from DB directly
        stderr: (row[8] as string) || '', // Read from DB directly
      }));

      return runningFromDb;
    } catch (error) {
      console.error('[Basher] Failed to read running commands from DB:', error);
      return [];
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Running Commands</title>
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }
        .command-panel {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .command-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
            font-size: 11px;
        }
        .command-title {
            font-weight: 600;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .command-duration {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
        }
        .command-output {
            flex: 1;
            overflow-y: auto;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 4px 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            line-height: 1.4;
        }
        .output-line {
            white-space: pre-wrap;
            word-break: break-all;
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        .empty-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        .empty-text {
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container" id="container">
        <div class="empty-state">
            <div class="empty-icon">⏳</div>
            <div class="empty-text">No commands currently running</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const container = document.getElementById('container');

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                updateCommands(message.commands);
            }
        });

        function updateCommands(commands) {
            if (!commands || commands.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-icon">⏳</div>
                        <div class="empty-text">No commands currently running</div>
                    </div>
                \`;
                return;
            }

            container.innerHTML = '';
            commands.forEach(cmd => {
                const panel = document.createElement('div');
                panel.className = 'command-panel';

                const header = document.createElement('div');
                header.className = 'command-header';

                const title = document.createElement('div');
                title.className = 'command-title';
                title.textContent = cmd.title || cmd.command;
                title.title = cmd.command;

                const duration = document.createElement('div');
                duration.className = 'command-duration';
                const seconds = Math.floor(cmd.duration / 1000);
                duration.textContent = seconds + 's';

                header.appendChild(title);
                header.appendChild(duration);

                const output = document.createElement('div');
                output.className = 'command-output';

                // Get last 10 lines of output
                const stdout = cmd.stdout || '';
                const lines = stdout.split('\\n').filter(l => l.trim()).slice(-10);
                lines.forEach(line => {
                    const lineDiv = document.createElement('div');
                    lineDiv.className = 'output-line';
                    // Remove timestamp prefix if present
                    const cleaned = line.replace(/^\\[.*?\\]\\s*/, '');
                    lineDiv.textContent = cleaned;
                    output.appendChild(lineDiv);
                });

                panel.appendChild(header);
                panel.appendChild(output);
                container.appendChild(panel);

                // Auto-scroll to bottom after DOM updates
                setTimeout(() => {
                    output.scrollTop = output.scrollHeight;
                }, 0);
            });
        }
    </script>
</body>
</html>`;
  }
}

// Virtual Document Content Provider for Command Outputs
class CommandOutputProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private serverUrl: string;
  private historyProvider: CommandHistoryProvider;

  constructor(historyProvider: CommandHistoryProvider) {
    this.historyProvider = historyProvider;
    const config = vscode.workspace.getConfiguration('commandNConquer');
    this.serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const commandId = parseInt(uri.path);
    const command = this.historyProvider.getCommand(commandId);

    if (!command) {
      return `Command ${commandId} not found`;
    }

    const success = command.exitCode === 0;
    const statusSymbol = success ? '✓' : '✗';
    const timestamp = new Date(command.timestamp).toLocaleString();

    let content = '';
    content += `${'='.repeat(80)}\n`;
    content += `Command: ${command.command}\n`;
    content += `Working Directory: ${command.cwd}\n`;
    content += `Exit Code: ${command.exitCode} ${statusSymbol}\n`;
    content += `Duration: ${command.duration}ms\n`;
    content += `Timestamp: ${timestamp}\n`;
    content += `${'='.repeat(80)}\n\n`;

    if (command.stdout) {
      content += `${'─'.repeat(80)}\n`;
      content += `STDOUT:\n`;
      content += `${'─'.repeat(80)}\n`;
      content += command.stdout;
      content += `\n\n`;
    }

    if (command.stderr) {
      content += `${'─'.repeat(80)}\n`;
      content += `STDERR:\n`;
      content += `${'─'.repeat(80)}\n`;
      content += command.stderr;
      content += `\n\n`;
    }

    if (!command.stdout && !command.stderr) {
      content += `(No output)\n`;
    }

    return content;
  }

  update(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }
}

// SSE Client for Real-time Updates
class SSEClient {
  private eventSource: any = null;
  private serverUrl: string;
  private historyProvider: CommandHistoryProvider;

  constructor(historyProvider: CommandHistoryProvider) {
    this.historyProvider = historyProvider;
    const config = vscode.workspace.getConfiguration('commandNConquer');
    this.serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
  }

  connect(): void {
    try {
      const url = `${this.serverUrl}/api/events`;

      const req = http.get(url, (res) => {
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                this.handleEvent(data);
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        });

        res.on('error', () => {
          // Silently ignore SSE errors
        });
      });

      req.on('error', () => {
        // Silently ignore connection errors - server might not be running
      });
    } catch (error) {
      // Silently ignore - server might not be running
    }
  }

  private handleEvent(event: any): void {
    if (event.type === 'command_executed') {
      // Refresh history view
      this.historyProvider.refresh();

      // Show notification
      vscode.window.showInformationMessage(
        `Command completed: ${event.data.command} (exit ${event.data.exitCode})`
      );
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource = null;
    }
  }
}

// Extension Activation
export function activate(context: vscode.ExtensionContext) {
  console.log('Basher extension is now active');

  // Create providers
  const webServersProvider = new WebServersProvider(context);
  const historyProvider = new CommandHistoryProvider(context);
  const runningCommandsProvider = new RunningCommandsProvider(context);
  const outputProvider = new CommandOutputProvider(historyProvider);

  // Register tree views
  const webServersTreeView = vscode.window.createTreeView('commandNConquer.webServers', {
    treeDataProvider: webServersProvider
  });

  const historyTreeView = vscode.window.createTreeView('commandNConquer.commandHistory', {
    treeDataProvider: historyProvider
  });

  // Register webview view for running commands
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('commandNConquer.runningCommands', runningCommandsProvider)
  );

  // Register virtual document provider
  const outputScheme = 'command-output';
  vscode.workspace.registerTextDocumentContentProvider(outputScheme, outputProvider);

  // Initial load
  historyProvider.loadCommands();

  // Connect to SSE for real-time updates
  const sseClient = new SSEClient(historyProvider);
  sseClient.connect();

  // Auto-refresh interval
  const config = vscode.workspace.getConfiguration('commandNConquer');
  const refreshInterval = config.get<number>('refreshInterval') || 5000;
  let refreshTimer: NodeJS.Timeout | undefined;

  if (refreshInterval > 0) {
    refreshTimer = setInterval(() => {
      historyProvider.refresh();
    }, refreshInterval);
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.focus', () => {
      vscode.commands.executeCommand('workbench.view.extension.basher');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.refresh', () => {
      historyProvider.refresh();
      vscode.window.showInformationMessage('Command history refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.openOutput', async (commandId: number, isRunning: boolean = false) => {
      let command = historyProvider.getCommand(commandId);

      // If command not found, try refreshing the data first (handles race condition)
      if (!command) {
        await historyProvider.loadCommands();
        command = historyProvider.getCommand(commandId);
      }

      if (command) {
        CommandOutputPanel.createOrShow(context.extensionUri, commandId, command, isRunning);
      } else {
        // Still not found - might be a very recent command, show message and refresh tree
        vscode.window.showWarningMessage(`Command ${commandId} not found. Refreshing...`);
        historyProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.rerunCommand', async (item: CommandTreeItem) => {
      const command = item.commandData;

      try {
        const config = vscode.workspace.getConfiguration('commandNConquer');
        const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

        vscode.window.showInformationMessage(`Rerunning: ${command.command}`);

        // Make POST request to /api/execute
        const postData = JSON.stringify({
          command: command.command,
          cwd: command.cwd,
          timeout: 300000
        });

        await new Promise((resolve, reject) => {
          const url = new URL(`${serverUrl}/api/execute`);
          const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const result = JSON.parse(data);
                if (result.success) {
                  vscode.window.showInformationMessage(
                    `Command completed with exit code ${result.data.exitCode}`
                  );
                  historyProvider.refresh();
                } else {
                  vscode.window.showErrorMessage(`Command failed: ${result.error}`);
                }
                resolve(result);
              } catch (error) {
                reject(error);
              }
            });
          });

          req.on('error', reject);
          req.write(postData);
          req.end();
        });

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to rerun command: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.terminateCommand', async (item: CommandTreeItem) => {
      const command = item.commandData;

      if (command.status !== 'running' || !command.processId) {
        vscode.window.showWarningMessage('Command is not running');
        return;
      }

      try {
        // Find the server port
        let serverPort = 3000;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const portFile = path.join(workspaceFolders[0].uri.fsPath, '.basher', 'port');
          if (fs.existsSync(portFile)) {
            const portContent = fs.readFileSync(portFile, 'utf-8').trim();
            const parsedPort = parseInt(portContent, 10);
            if (!isNaN(parsedPort)) {
              serverPort = parsedPort;
            }
          }
        }

        const result = await vscode.window.showWarningMessage(
          `Terminate command: ${command.command}?`,
          'Yes', 'No'
        );

        if (result !== 'Yes') {
          return;
        }

        // Make POST request to /api/terminate/:processId
        await new Promise((resolve, reject) => {
          const url = new URL(`http://localhost:${serverPort}/api/terminate/${command.processId}`);
          const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            }
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const result = JSON.parse(data);
                if (result.success) {
                  vscode.window.showInformationMessage(`Command terminated (Process ID: ${command.processId})`);
                  historyProvider.refresh();
                } else {
                  vscode.window.showErrorMessage(`Failed to terminate: ${result.error}`);
                }
                resolve(result);
              } catch (error) {
                reject(error);
              }
            });
          });

          req.on('error', reject);
          req.end();
        });

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to terminate command: ${error}`);
      }
    })
  );

  // Command to open a specific server URL (used by tree view items)
  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.openServerUrl', (port: number) => {
      const serverUrl = `http://localhost:${port}`;
      vscode.env.openExternal(vscode.Uri.parse(serverUrl));
      vscode.window.showInformationMessage(`Opening Basher Web UI at ${serverUrl}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.openWebDashboard', async () => {
      // Get all running servers
      const servers = webServersProvider.getServers();

      if (servers.length === 0) {
        // No servers running - try legacy port file
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let port = 3000;

        if (workspaceFolders && workspaceFolders.length > 0) {
          const portFile = path.join(workspaceFolders[0].uri.fsPath, '.basher', 'port');
          try {
            if (fs.existsSync(portFile)) {
              const portContent = fs.readFileSync(portFile, 'utf-8').trim();
              const parsedPort = parseInt(portContent, 10);
              if (!isNaN(parsedPort)) {
                port = parsedPort;
              }
            }
          } catch (error) {
            console.error('[Basher] Failed to read port file:', error);
          }
        }

        const serverUrl = `http://localhost:${port}`;
        vscode.env.openExternal(vscode.Uri.parse(serverUrl));
        vscode.window.showInformationMessage(`Opening Basher Web UI at ${serverUrl}`);
      } else if (servers.length === 1) {
        // Single server - open it directly
        const serverUrl = `http://localhost:${servers[0].port}`;
        vscode.env.openExternal(vscode.Uri.parse(serverUrl));
        vscode.window.showInformationMessage(`Opening Basher Web UI at ${serverUrl}`);
      } else {
        // Multiple servers - show quick pick
        const items = servers.map(s => ({
          label: `http://localhost:${s.port}`,
          description: path.basename(s.cwd),
          detail: `PID: ${s.pid} | Started: ${new Date(s.startTime).toLocaleString()}`,
          port: s.port
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a Basher Web UI to open',
          title: 'Multiple Basher Servers Running'
        });

        if (selected) {
          const serverUrl = `http://localhost:${selected.port}`;
          vscode.env.openExternal(vscode.Uri.parse(serverUrl));
          vscode.window.showInformationMessage(`Opening Basher Web UI at ${serverUrl}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.clearHistory', async () => {
      // Confirm with user
      const result = await vscode.window.showWarningMessage(
        'Clear all command history? This action cannot be undone.',
        { modal: true },
        'Clear History', 'Cancel'
      );

      if (result !== 'Clear History') {
        return;
      }

      try {
        // Find the server port
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let port = 3000; // default

        if (workspaceFolders && workspaceFolders.length > 0) {
          const portFile = path.join(workspaceFolders[0].uri.fsPath, '.basher', 'port');
          try {
            if (fs.existsSync(portFile)) {
              const portContent = fs.readFileSync(portFile, 'utf-8').trim();
              const parsedPort = parseInt(portContent, 10);
              if (!isNaN(parsedPort)) {
                port = parsedPort;
              }
            }
          } catch (error) {
            console.error('[Basher] Failed to read port file:', error);
          }
        }

        // Make DELETE request to /api/history
        await new Promise((resolve, reject) => {
          const url = new URL(`http://localhost:${port}/api/history`);
          const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            }
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const result = JSON.parse(data);
                if (result.success) {
                  vscode.window.showInformationMessage('Command history cleared successfully');
                  historyProvider.refresh();
                } else {
                  vscode.window.showErrorMessage(`Failed to clear history: ${result.error}`);
                }
                resolve(result);
              } catch (error) {
                reject(error);
              }
            });
          });

          req.on('error', reject);
          req.end();
        });

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to clear history: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.searchHistory', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search command history',
        placeHolder: 'Enter search query...'
      });

      if (query) {
        try {
          const config = vscode.workspace.getConfiguration('commandNConquer');
          const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

          const response = await fetchJson(`${serverUrl}/api/search?q=${encodeURIComponent(query)}&limit=50`);

          if (response.success && response.data.length > 0) {
            interface SearchQuickPickItem extends vscode.QuickPickItem {
              commandId: number;
            }

            const items: SearchQuickPickItem[] = response.data.map((cmd: CommandHistoryItem) => ({
              label: cmd.command,
              description: `Exit ${cmd.exitCode} - ${new Date(cmd.timestamp).toLocaleString()}`,
              detail: cmd.cwd,
              commandId: cmd.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
              placeHolder: `Found ${response.data.length} results`
            });

            if (selected) {
              vscode.commands.executeCommand('commandNConquer.openOutput', selected.commandId);
            }
          } else {
            vscode.window.showInformationMessage('No results found');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Search failed: ${error}`);
        }
      }
    })
  );

  // Cleanup
  context.subscriptions.push(webServersTreeView);
  context.subscriptions.push(historyTreeView);

  context.subscriptions.push(new vscode.Disposable(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    webServersProvider.stopAutoRefresh();
    sseClient.disconnect();
  }));
}

// Helper function
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

export function deactivate() {
  console.log('Basher extension is now deactivated');
}
