import * as vscode from 'vscode';
import * as http from 'http';
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
  private serverUrl: string;

  constructor(private context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('commandNConquer');
    this.serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
  }

  refresh(): void {
    this.loadCommands();
  }

  async loadCommands(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('commandNConquer');
      const limit = config.get<number>('maxHistoryItems') || 100;

      const response = await this.fetchJson(`${this.serverUrl}/api/history?limit=${limit}`);
      if (response.success) {
        this.commands = response.data;
        this._onDidChangeTreeData.fire();
      }
    } catch (error) {
      // Silently fail - server might not be running
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

    if (this.commands.length === 0) {
      // Show a placeholder when no commands are available
      const placeholder = new vscode.TreeItem(
        'No commands found',
        vscode.TreeItemCollapsibleState.None
      );
      placeholder.description = 'Make sure the MCP server is running';
      placeholder.iconPath = new vscode.ThemeIcon('info');
      placeholder.contextValue = 'placeholder';
      return Promise.resolve([placeholder as any]);
    }

    return Promise.resolve(
      this.commands.map(cmd => new CommandTreeItem(cmd, this.context))
    );
  }

  getCommand(id: number): CommandHistoryItem | undefined {
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
    private context: vscode.ExtensionContext
  ) {
    super(commandData.command, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    this.iconPath = this.getIcon();
    this.contextValue = 'commandItem';

    // Make it clickable to open output
    this.command = {
      command: 'commandNConquer.openOutput',
      title: 'Open Output',
      arguments: [commandData.id]
    };
  }

  private getTooltip(): string {
    const success = this.commandData.exitCode === 0;
    return `Command: ${this.commandData.command}\n` +
           `Exit Code: ${this.commandData.exitCode}\n` +
           `Duration: ${this.commandData.duration}ms\n` +
           `Working Directory: ${this.commandData.cwd}\n` +
           `Timestamp: ${new Date(this.commandData.timestamp).toLocaleString()}\n` +
           `Status: ${success ? '✓ Success' : '✗ Failed'}`;
  }

  private getDescription(): string {
    const date = new Date(this.commandData.timestamp);
    const timeStr = date.toLocaleTimeString();
    const success = this.commandData.exitCode === 0;
    const statusIcon = success ? '✓' : '✗';
    return `${statusIcon} ${timeStr} [${this.commandData.duration}ms]`;
  }

  private getIcon(): vscode.ThemeIcon {
    const success = this.commandData.exitCode === 0;
    if (success) {
      return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else {
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    }
  }
}

// Statistics Tree Data Provider
class StatsProvider implements vscode.TreeDataProvider<StatsTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<StatsTreeItem | undefined | null | void> = new vscode.EventEmitter<StatsTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<StatsTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private stats: Stats | null = null;
  private serverUrl: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('commandNConquer');
    this.serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
  }

  refresh(): void {
    this.loadStats();
  }

  async loadStats(): Promise<void> {
    try {
      const response = await this.fetchJson(`${this.serverUrl}/api/stats`);
      if (response.success) {
        this.stats = response.data;
        this._onDidChangeTreeData.fire();
      }
    } catch (error) {
      // Silently fail - server might not be running
      this.stats = null;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: StatsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StatsTreeItem): Thenable<StatsTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    if (!this.stats) {
      // Show placeholder when server is not connected
      const placeholder = new StatsTreeItem('Not Connected', 'Server not running', 'warning');
      return Promise.resolve([placeholder]);
    }

    const successRate = this.stats.total > 0
      ? (((this.stats.total - this.stats.failures) / this.stats.total) * 100).toFixed(2)
      : '0';

    return Promise.resolve([
      new StatsTreeItem('Total Commands', this.stats.total.toString(), 'symbol-number'),
      new StatsTreeItem('Failed Commands', this.stats.failures.toString(), 'error'),
      new StatsTreeItem('Success Rate', `${successRate}%`, 'pass'),
      new StatsTreeItem('Avg Duration', `${this.stats.avgDuration}ms`, 'watch')
    ]);
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

// Stats Tree Item
class StatsTreeItem extends vscode.TreeItem {
  constructor(
    public readonly labelText: string,
    public readonly value: string,
    iconName: string
  ) {
    super(labelText, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.iconPath = new vscode.ThemeIcon(iconName);
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
  private statsProvider: StatsProvider;

  constructor(historyProvider: CommandHistoryProvider, statsProvider: StatsProvider) {
    this.historyProvider = historyProvider;
    this.statsProvider = statsProvider;
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
      // Refresh tree views
      this.historyProvider.refresh();
      this.statsProvider.refresh();

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
  const statsProvider = new StatsProvider();
  const outputProvider = new CommandOutputProvider(historyProvider);

  // Register tree views
  const historyTreeView = vscode.window.createTreeView('commandNConquer.commandHistory', {
    treeDataProvider: historyProvider
  });

  const statsTreeView = vscode.window.createTreeView('commandNConquer.stats', {
    treeDataProvider: statsProvider
  });

  // Register virtual document provider
  const outputScheme = 'command-output';
  vscode.workspace.registerTextDocumentContentProvider(outputScheme, outputProvider);

  // Initial load
  historyProvider.loadCommands();
  statsProvider.loadStats();

  // Connect to SSE for real-time updates
  const sseClient = new SSEClient(historyProvider, statsProvider);
  sseClient.connect();

  // Auto-refresh interval
  const config = vscode.workspace.getConfiguration('commandNConquer');
  const refreshInterval = config.get<number>('refreshInterval') || 5000;
  let refreshTimer: NodeJS.Timeout | undefined;

  if (refreshInterval > 0) {
    refreshTimer = setInterval(() => {
      historyProvider.refresh();
      statsProvider.refresh();
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
      statsProvider.refresh();
      vscode.window.showInformationMessage('Command history refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commandNConquer.openOutput', async (commandId: number) => {
      const command = historyProvider.getCommand(commandId);
      if (command) {
        CommandOutputPanel.createOrShow(context.extensionUri, commandId, command);
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
                  statsProvider.refresh();
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
    vscode.commands.registerCommand('commandNConquer.openWebDashboard', () => {
      const config = vscode.workspace.getConfiguration('commandNConquer');
      const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
      vscode.env.openExternal(vscode.Uri.parse(serverUrl));
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
  context.subscriptions.push(statsTreeView);

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
