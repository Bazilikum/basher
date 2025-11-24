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

// Command History Tree Data Provider
class CommandHistoryProvider implements vscode.TreeDataProvider<CommandTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommandTreeItem | undefined | null | void> = new vscode.EventEmitter<CommandTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CommandTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private commands: CommandHistoryItem[] = [];
  private runningCommands: CommandHistoryItem[] = [];
  private dbPath: string | null = null;
  private lastError: string | null = null;
  private serverPort: number = 3000;

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
    try {
      this.lastError = null; // Clear previous errors

      // Fetch running commands from web API
      try {
        const url = `http://localhost:${this.serverPort}/api/running`;
        console.log('[Basher] Fetching running commands from:', url);
        const runningResponse = await this.fetchJson(url);
        console.log('[Basher] Running commands response:', runningResponse);
        if (runningResponse.success && runningResponse.data) {
          console.log('[Basher] Found running commands:', runningResponse.data.length);
          this.runningCommands = runningResponse.data.map((proc: RunningProcess) => ({
            id: proc.id,
            command: proc.title || proc.command,
            cwd: '',
            timestamp: new Date(Date.now() - proc.duration).toISOString(),
            exitCode: -1,
            duration: proc.duration,
            stdout: '',
            stderr: '',
            processId: proc.id,
            status: 'running' as const
          }));
        } else {
          this.runningCommands = [];
        }
      } catch (error) {
        // Server might not be running
        console.error('[Basher] Failed to fetch running commands:', error);
        this.runningCommands = [];
      }

      if (!this.dbPath || !fs.existsSync(this.dbPath)) {
        this.commands = [];
        if (this.runningCommands.length === 0) {
          this.lastError = !this.dbPath ? 'No workspace folder found' : 'Database file not found';
        }
        this._onDidChangeTreeData.fire();
        return;
      }

      const config = vscode.workspace.getConfiguration('commandNConquer');
      const limit = config.get<number>('maxHistoryItems') || 100;

      // Read directly from SQLite database using sql.js
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(this.dbPath);
      const db = new SQL.Database(fileBuffer);

      const result = db.exec(`
        SELECT id, command, title, cwd, timestamp, exit_code, duration, stdout, stderr
        FROM command_history
        ORDER BY id DESC
        LIMIT ${limit}
      `);

      if (result.length > 0 && result[0].values.length > 0) {
        this.commands = result[0].values.map((row: any[]) => ({
          id: row[0] as number,
          command: (row[2] as string) || (row[1] as string), // Use title if available, fallback to command
          cwd: row[3] as string,
          timestamp: row[4] as string,
          exitCode: row[5] as number,
          duration: row[6] as number,
          stdout: (row[7] as string) || '',
          stderr: (row[8] as string) || '',
          status: 'completed' as const
        }));
      } else {
        this.commands = [];
      }

      db.close();
      this._onDidChangeTreeData.fire();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Basher] Failed to load commands from database:', error);
      this.lastError = `Error loading database: ${errorMsg}`;
      this.commands = [];
      this._onDidChangeTreeData.fire();
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
    // Check running commands first
    const runningCmd = this.runningCommands.find(cmd => cmd.processId === id);
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

    // Make it clickable to open output
    const commandId = commandData.status === 'running' ? commandData.processId! : commandData.id;
    this.command = {
      command: 'commandNConquer.openOutput',
      title: 'Open Output',
      arguments: [commandId, commandData.status === 'running']
    };
  }

  private getTooltip(): string {
    if (this.commandData.status === 'running') {
      return `ID: ${this.commandData.processId}\n` +
             `Command: ${this.commandData.command}\n` +
             `Status: ⏳ Running\n` +
             `Duration: ${this.commandData.duration}ms\n` +
             `Process ID: ${this.commandData.processId}`;
    }

    const success = this.commandData.exitCode === 0;
    return `ID: ${this.commandData.id}\n` +
           `Command: ${this.commandData.command}\n` +
           `Exit Code: ${this.commandData.exitCode}\n` +
           `Duration: ${this.commandData.duration}ms\n` +
           `Working Directory: ${this.commandData.cwd}\n` +
           `Timestamp: ${new Date(this.commandData.timestamp).toLocaleString()}\n` +
           `Status: ${success ? '✓ Success' : '✗ Failed'}`;
  }

  private getDescription(): string {
    const idPrefix = `#${this.commandData.id || this.commandData.processId}`;

    if (this.commandData.status === 'running') {
      const durationSec = (this.commandData.duration / 1000).toFixed(1);
      return `${idPrefix} ⏳ Running [${durationSec}s]`;
    }

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

  constructor(private context: vscode.ExtensionContext) {
    this.findServerPort();
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
    const url = `http://localhost:${this.serverPort}/api/running`;
    console.log(`[Basher] Fetching running commands from: ${url}`);

    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', async () => {
          try {
            const result = JSON.parse(data);
            if (result.success && result.data) {
              console.log(`[Basher] Found ${result.data.length} running commands on port ${this.serverPort}`);

              // Fetch output for each running command
              const commandsWithOutput = await Promise.all(
                result.data.map(async (cmd: any) => {
                  try {
                    const output = await this.fetchProcessOutput(cmd.id);
                    return { ...cmd, stdout: output.stdout || '', stderr: output.stderr || '' };
                  } catch (error) {
                    console.error(`[Basher] Failed to fetch output for process ${cmd.id}:`, error);
                    return { ...cmd, stdout: '', stderr: '' };
                  }
                })
              );

              resolve(commandsWithOutput);
            } else {
              resolve([]);
            }
          } catch (error) {
            resolve([]);
          }
        });
      }).on('error', (err) => {
        console.error(`[Basher] Failed to connect to port ${this.serverPort}:`, err);
        resolve([]);
      });
    });
  }

  private async fetchProcessOutput(processId: number): Promise<any> {
    const url = `http://localhost:${this.serverPort}/api/process/${processId}/output?lines=10`;

    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.success && result.data) {
              resolve(result.data);
            } else {
              resolve({ stdout: '', stderr: '' });
            }
          } catch (error) {
            resolve({ stdout: '', stderr: '' });
          }
        });
      }).on('error', () => {
        resolve({ stdout: '', stderr: '' });
      });
    });
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
  const historyProvider = new CommandHistoryProvider(context);
  const runningCommandsProvider = new RunningCommandsProvider(context);
  const outputProvider = new CommandOutputProvider(historyProvider);

  // Register tree views
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
      const command = historyProvider.getCommand(commandId);
      if (command) {
        CommandOutputPanel.createOrShow(context.extensionUri, commandId, command, isRunning);
      } else {
        vscode.window.showErrorMessage(`Command ${commandId} not found`);
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

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.openWebDashboard', () => {
      // Try to read port from .basher/port file
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

      const serverUrl = `http://localhost:${port}`;
      vscode.env.openExternal(vscode.Uri.parse(serverUrl));
      vscode.window.showInformationMessage(`Opening Basher Web UI at ${serverUrl}`);
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
  context.subscriptions.push(historyTreeView);

  context.subscriptions.push(new vscode.Disposable(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
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
