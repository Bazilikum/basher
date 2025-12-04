import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

export class CommandOutputPanel {
  private static readonly viewType = 'commandNConquer.outputPanel';
  private static panels = new Map<number, CommandOutputPanel>();
  private static extensionVersion: string = '';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _commandId: number;
  private _commandData: CommandHistoryItem;
  private _disposables: vscode.Disposable[] = [];
  private _isRunning: boolean = false;
  private _pollInterval: NodeJS.Timeout | undefined;

  private static getExtensionVersion(): string {
    if (CommandOutputPanel.extensionVersion) {
      return CommandOutputPanel.extensionVersion;
    }
    try {
      const packageJsonPath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      CommandOutputPanel.extensionVersion = packageJson.version || '1.0.0';
    } catch (error) {
      CommandOutputPanel.extensionVersion = '1.0.0';
    }
    return CommandOutputPanel.extensionVersion;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    commandId: number,
    commandData: CommandHistoryItem,
    isRunning: boolean = false
  ): CommandOutputPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel for this command, show it
    if (CommandOutputPanel.panels.has(commandId)) {
      const existingPanel = CommandOutputPanel.panels.get(commandId)!;
      // Reveal with preserveFocus: false to ensure the panel gets focus
      existingPanel._panel.reveal(column, false);
      return existingPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      CommandOutputPanel.viewType,
      `#${commandId} ${commandData.command}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    const outputPanel = new CommandOutputPanel(panel, extensionUri, commandId, commandData, isRunning);
    CommandOutputPanel.panels.set(commandId, outputPanel);
    return outputPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    commandId: number,
    commandData: CommandHistoryItem,
    isRunning: boolean = false
  ) {
    this._panel = panel;
    this._commandId = commandId;
    this._commandData = commandData;
    this._isRunning = isRunning;

    // Set the webview's initial html content
    this._update();

    // Start polling for live updates if command is running
    if (this._isRunning) {
      this.startPolling();
    }

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            return;
          case 'rerun':
            await this.rerunCommand();
            return;
        }
      },
      null,
      this._disposables
    );
  }

  private async rerunCommand() {
    const command = this._commandData;

    try {
      const config = vscode.workspace.getConfiguration('commandNConquer');
      const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

      vscode.window.showInformationMessage(`Rerunning: ${command.command}`);

      // Make POST request to /api/execute
      const http = await import('http');
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

      // Notify webview that rerun is complete
      this._panel.webview.postMessage({ command: 'rerunComplete' });

    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rerun command: ${error}`);
      this._panel.webview.postMessage({ command: 'rerunComplete' });
    }
  }

  private startPolling(): void {
    // Poll for updates every 500ms
    this._pollInterval = setInterval(async () => {
      try {
        const http = await import('http');
        const config = vscode.workspace.getConfiguration('commandNConquer');
        const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

        // Fetch current output from API
        const url = new URL(`${serverUrl}/api/process/${this._commandId}/output`);

        await new Promise((resolve, reject) => {
          http.get(url.toString(), (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const result = JSON.parse(data);
                if (result.success && result.data) {
                  // Update command data with new output
                  this._commandData.stdout = result.data.stdout || '';
                  this._commandData.stderr = result.data.stderr || '';
                  this._commandData.duration = result.data.duration || 0;

                  // Send incremental update to webview instead of regenerating HTML
                  this._panel.webview.postMessage({
                    command: 'updateOutput',
                    stdout: this._commandData.stdout,
                    stderr: this._commandData.stderr,
                    duration: this._commandData.duration
                  });

                  resolve(result);
                } else if (!result.success) {
                  // Command completed or not found - fetch final result from history
                  this.stopPolling();
                  this.fetchCompletedCommand();
                  resolve(result);
                }
              } catch (error) {
                reject(error);
              }
            });
          }).on('error', () => {
            // Stop polling if server is down
            this.stopPolling();
          });
        });
      } catch (error) {
        // Stop polling on error
        this.stopPolling();
      }
    }, 500);
  }

  private stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = undefined;
      this._isRunning = false;
    }
  }

  private async fetchCompletedCommand(): Promise<void> {
    try {
      const http = await import('http');
      const config = vscode.workspace.getConfiguration('commandNConquer');
      const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

      // Fetch completed command from history by process ID
      const url = new URL(`${serverUrl}/api/command/by-process/${this._commandId}`);

      await new Promise((resolve, reject) => {
        http.get(url.toString(), (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.success && result.data) {
                // Update command data with final result
                this._commandData = {
                  id: result.data.id,
                  command: result.data.command,
                  cwd: result.data.cwd,
                  timestamp: result.data.timestamp,
                  exitCode: result.data.exitCode,
                  duration: result.data.duration,
                  stdout: result.data.stdout || '',
                  stderr: result.data.stderr || '',
                };

                // Update panel title with database ID
                this._panel.title = `#${result.data.id} ${result.data.command}`;

                // Send completion update to webview
                this._panel.webview.postMessage({
                  command: 'commandCompleted',
                  id: result.data.id,
                  exitCode: result.data.exitCode,
                  duration: result.data.duration,
                  stdout: result.data.stdout || '',
                  stderr: result.data.stderr || '',
                  success: result.data.exitCode === 0,
                });

                resolve(result);
              } else {
                // Fallback: just mark as completed with current data
                this._panel.webview.postMessage({
                  command: 'commandCompleted',
                  id: this._commandId,
                  exitCode: this._commandData.exitCode,
                  duration: this._commandData.duration,
                  stdout: this._commandData.stdout,
                  stderr: this._commandData.stderr,
                  success: this._commandData.exitCode === 0,
                });
                resolve(result);
              }
            } catch (error) {
              reject(error);
            }
          });
        }).on('error', (error) => {
          // On error, just mark as completed with current data
          this._panel.webview.postMessage({
            command: 'commandCompleted',
            id: this._commandId,
            exitCode: this._commandData.exitCode,
            duration: this._commandData.duration,
            stdout: this._commandData.stdout,
            stderr: this._commandData.stderr,
            success: this._commandData.exitCode === 0,
          });
          resolve(null);
        });
      });
    } catch (error) {
      // Fallback: just update UI to show completed
      this._panel.webview.postMessage({
        command: 'commandCompleted',
        id: this._commandId,
        exitCode: this._commandData.exitCode,
        duration: this._commandData.duration,
        stdout: this._commandData.stdout,
        stderr: this._commandData.stderr,
        success: this._commandData.exitCode === 0,
      });
    }
  }

  public dispose() {
    this.stopPolling();
    CommandOutputPanel.panels.delete(this._commandId);

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const command = this._commandData;
    const isRunning = this._isRunning;
    const success = command.exitCode === 0;
    const statusSymbol = isRunning ? '⏳' : (success ? '✓' : '✗');
    const statusColor = isRunning ? '#ff9800' : (success ? '#4caf50' : '#f44336');
    const timestamp = new Date(command.timestamp).toLocaleString();

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const formatOutput = (output: string, type: 'stdout' | 'stderr'): string => {
      if (!output) return '';

      const commandStartTime = new Date(command.timestamp).getTime();
      const className = type === 'stderr' ? 'line-stderr' : 'line-stdout';

      const lines = output.split('\n').map((line, idx) => {
        // Try to extract timestamp from line like [2025-11-20T12:53:42.698Z]
        const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);

        if (timestampMatch) {
          const lineTime = new Date(timestampMatch[1]).getTime();
          const elapsed = lineTime - commandStartTime;
          const elapsedSec = (elapsed / 1000).toFixed(3);
          const cleanLine = line.substring(timestampMatch[0].length).trimStart();

          return `<div class="line ${className}" data-line="${type}-${idx}">` +
            `<span class="timestamp-col">+${elapsedSec}s</span>` +
            `<span class="content-col">${escapeHtml(cleanLine)}</span>` +
            `</div>`;
        } else {
          return `<div class="line ${className}" data-line="${type}-${idx}">` +
            `<span class="timestamp-col"></span>` +
            `<span class="content-col">${escapeHtml(line)}</span>` +
            `</div>`;
        }
      }).join('');

      return `<div class="output-separator"></div>${lines}`;
    };

    const formatMixedOutput = (stdout: string, stderr: string): string => {
      const commandStartTime = new Date(command.timestamp).getTime();
      let output = '<div class="output-separator"></div>';

      const formatLine = (line: string, type: 'stdout' | 'stderr', idx: number): string => {
        const className = type === 'stderr' ? 'line-stderr' : 'line-stdout';
        const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);

        if (timestampMatch) {
          const lineTime = new Date(timestampMatch[1]).getTime();
          const elapsed = lineTime - commandStartTime;
          const elapsedSec = (elapsed / 1000).toFixed(3);
          const cleanLine = line.substring(timestampMatch[0].length).trimStart();

          return `<div class="line ${className}" data-line="${type}-${idx}">` +
            `<span class="timestamp-col">+${elapsedSec}s</span>` +
            `<span class="content-col">${escapeHtml(cleanLine)}</span>` +
            `</div>`;
        } else {
          return `<div class="line ${className}" data-line="${type}-${idx}">` +
            `<span class="timestamp-col"></span>` +
            `<span class="content-col">${escapeHtml(line)}</span>` +
            `</div>`;
        }
      };

      if (stdout) {
        stdout.split('\n').forEach((line, idx) => {
          output += formatLine(line, 'stdout', idx);
        });
      }
      if (stderr) {
        stderr.split('\n').forEach((line, idx) => {
          output += formatLine(line, 'stderr', idx);
        });
      }
      return output;
    };

    const extensionVersion = CommandOutputPanel.getExtensionVersion();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Command Output</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .command-info {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            font-size: 12px;
        }
        .version-badge {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 600;
            white-space: nowrap;
        }
        .info-item {
            display: flex;
            gap: 6px;
        }
        .info-label {
            color: var(--vscode-descriptionForeground);
        }
        .info-value {
            font-weight: 500;
        }
        .status {
            color: ${statusColor};
            font-weight: bold;
        }
        .toolbar {
            display: flex;
            gap: 8px;
            padding: 8px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            align-items: center;
        }
        .tabs {
            display: flex;
            gap: 4px;
            flex: 1;
        }
        .tab {
            padding: 6px 12px;
            cursor: pointer;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        .tab:hover {
            background: var(--vscode-list-hoverBackground);
            color: var(--vscode-foreground);
            border-color: var(--vscode-focusBorder);
        }
        .tab.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            box-shadow: 0 0 0 1px var(--vscode-button-background);
            font-weight: 600;
        }
        .filter-section {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .filter-input {
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        }
        .filter-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .filter-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .auto-scroll-section {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .auto-scroll-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--vscode-foreground);
            cursor: pointer;
            user-select: none;
        }
        .auto-scroll-label input[type="checkbox"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
        }
        .auto-scroll-label span {
            white-space: nowrap;
        }
        .rerun-button {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
        }
        .rerun-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .rerun-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .rerun-button.running {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .output-container {
            flex: 1;
            overflow: auto;
            padding: 16px;
        }
        .output-content {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .line {
            padding: 2px 0;
            display: flex;
            gap: 12px;
        }
        .timestamp-col {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            min-width: 80px;
            flex-shrink: 0;
            text-align: right;
            font-family: var(--vscode-editor-font-family);
            opacity: 0.7;
        }
        .content-col {
            flex: 1;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .line-stderr .content-col {
            color: var(--vscode-errorForeground);
        }
        .line-stdout .content-col {
            color: var(--vscode-foreground);
        }
        .line.hidden {
            display: none;
        }
        .line.highlight {
            background: var(--vscode-editor-findMatchHighlightBackground);
        }
        .output-separator {
            border-top: 2px solid var(--vscode-panel-border);
            margin: 12px 0;
            opacity: 0.5;
        }
        .empty-message {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="command-info">
            <div class="info-item">
                <span class="info-label">ID:</span>
                <span class="info-value">#${command.id}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Command:</span>
                <span class="info-value">${escapeHtml(command.command)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Directory:</span>
                <span class="info-value">${escapeHtml(command.cwd)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Exit Code:</span>
                <span class="info-value status">${isRunning ? 'Running...' : command.exitCode} ${statusSymbol}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Duration:</span>
                <span class="info-value">${command.duration}ms</span>
            </div>
            <div class="info-item">
                <span class="info-label">Time:</span>
                <span class="info-value">${timestamp}</span>
            </div>
        </div>
        <div class="version-badge">v${extensionVersion}</div>
    </div>

    <div class="toolbar">
        <div class="tabs">
            <button class="tab active" data-tab="stdout">STDOUT</button>
            <button class="tab" data-tab="stderr">STDERR</button>
            <button class="tab" data-tab="mixed">MIXED</button>
            <button class="tab" data-tab="info">INFO</button>
        </div>
        <div class="filter-section">
            <span class="filter-label">Search:</span>
            <input type="text" class="filter-input" id="searchInput" placeholder="Highlight text...">
            <span class="filter-label">Filter:</span>
            <input type="text" class="filter-input" id="filterInput" placeholder="Regex or text...">
        </div>
        <div class="auto-scroll-section">
            <label class="auto-scroll-label">
                <input type="checkbox" id="autoScrollCheckbox" checked>
                <span>Auto-scroll</span>
            </label>
        </div>
        <button class="rerun-button" id="rerunButton">
            <span>▶</span>
            <span id="rerunText">Rerun</span>
        </button>
    </div>

    <div class="output-container">
        <div id="output-stdout" class="output-content">
            ${command.stdout ? formatOutput(command.stdout, 'stdout') : '<div class="empty-message">No stdout output</div>'}
        </div>
        <div id="output-stderr" class="output-content" style="display: none;">
            ${command.stderr ? formatOutput(command.stderr, 'stderr') : '<div class="empty-message">No stderr output</div>'}
        </div>
        <div id="output-mixed" class="output-content" style="display: none;">
            ${formatMixedOutput(command.stdout, command.stderr)}
        </div>
        <div id="output-info" class="output-content" style="display: none;">
            <div class="line">Command ID: ${command.id}</div>
            <div class="line">Command: ${escapeHtml(command.command)}</div>
            <div class="line">Working Directory: ${escapeHtml(command.cwd)}</div>
            <div class="line">Exit Code: ${command.exitCode}</div>
            <div class="line">Duration: ${command.duration}ms</div>
            <div class="line">Timestamp: ${timestamp}</div>
            <div class="line">STDOUT Length: ${command.stdout ? command.stdout.length : 0} chars</div>
            <div class="line">STDERR Length: ${command.stderr ? command.stderr.length : 0} chars</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const tabs = document.querySelectorAll('.tab');
        const outputs = document.querySelectorAll('.output-content');
        const searchInput = document.getElementById('searchInput');
        const filterInput = document.getElementById('filterInput');
        const rerunButton = document.getElementById('rerunButton');
        const rerunText = document.getElementById('rerunText');
        const autoScrollCheckbox = document.getElementById('autoScrollCheckbox');
        const outputContainer = document.querySelector('.output-container');
        let currentTab = 'stdout';

        // Auto-scroll function
        function scrollToBottom() {
            if (autoScrollCheckbox && autoScrollCheckbox.checked && outputContainer) {
                outputContainer.scrollTop = outputContainer.scrollHeight;
            }
        }

        // Rerun button
        rerunButton.addEventListener('click', () => {
            rerunButton.disabled = true;
            rerunButton.classList.add('running');
            rerunText.textContent = 'Running...';

            vscode.postMessage({
                command: 'rerun',
                commandId: ${command.id}
            });
        });

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'rerunComplete':
                    rerunButton.disabled = false;
                    rerunButton.classList.remove('running');
                    rerunText.textContent = 'Rerun';
                    break;
                case 'updateOutput':
                    // Update output content dynamically without resetting tabs
                    updateOutputContent(message.stdout, message.stderr, message.duration);
                    break;
                case 'commandCompleted':
                    // Command finished - update status in place
                    handleCommandCompleted(message);
                    break;
            }
        });

        function handleCommandCompleted(data) {
            // Update status display
            const statusElements = document.querySelectorAll('.status');
            const statusSymbol = data.success ? '✓' : '✗';
            const statusColor = data.success ? '#4caf50' : '#f44336';
            statusElements.forEach(el => {
                el.textContent = data.exitCode + ' ' + statusSymbol;
                el.style.color = statusColor;
            });

            // Update ID if changed
            const idElements = document.querySelectorAll('.info-value');
            idElements.forEach(el => {
                const parent = el.parentElement;
                if (parent && parent.querySelector('.info-label')?.textContent === 'ID:') {
                    el.textContent = '#' + data.id;
                }
            });

            // Update duration
            const durationElements = document.querySelectorAll('.info-value');
            durationElements.forEach(el => {
                const parent = el.parentElement;
                if (parent && parent.querySelector('.info-label')?.textContent === 'Duration:') {
                    el.textContent = data.duration + 'ms';
                }
            });

            // Final output update
            updateOutputContent(data.stdout, data.stderr, data.duration);

            // Show completion notification in the panel
            const header = document.querySelector('.header');
            if (header) {
                // Add a subtle completion indicator
                let indicator = document.querySelector('.completion-indicator');
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.className = 'completion-indicator';
                    indicator.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; height: 3px; background: ' + statusColor + '; animation: fadeIn 0.3s ease;';
                    header.style.position = 'relative';
                    header.appendChild(indicator);
                }
            }
        }

        function updateOutputContent(stdout, stderr, duration) {
            // Update duration display
            const durationElements = document.querySelectorAll('.info-value');
            durationElements.forEach(el => {
                const parent = el.parentElement;
                if (parent && parent.querySelector('.info-label')?.textContent === 'Duration:') {
                    el.textContent = duration + 'ms';
                }
            });

            // Helper function to format output
            const commandStartTime = new Date('${command.timestamp}').getTime();

            const formatOutput = (output, type) => {
                if (!output) return '<div class="empty-message">No ' + type + ' output</div>';

                const className = type === 'stderr' ? 'line-stderr' : 'line-stdout';
                const lines = output.split('\\n').map((line, idx) => {
                    const timestampMatch = line.match(/^\\[(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z)\\]/);

                    if (timestampMatch) {
                        const lineTime = new Date(timestampMatch[1]).getTime();
                        const elapsed = lineTime - commandStartTime;
                        const elapsedSec = (elapsed / 1000).toFixed(3);
                        const cleanLine = line.substring(timestampMatch[0].length).trimStart();

                        return '<div class="line ' + className + '" data-line="' + type + '-' + idx + '">' +
                            '<span class="timestamp-col">+' + elapsedSec + 's</span>' +
                            '<span class="content-col">' + escapeHtml(cleanLine) + '</span>' +
                            '</div>';
                    } else {
                        return '<div class="line ' + className + '" data-line="' + type + '-' + idx + '">' +
                            '<span class="timestamp-col"></span>' +
                            '<span class="content-col">' + escapeHtml(line) + '</span>' +
                            '</div>';
                    }
                }).join('');

                return '<div class="output-separator"></div>' + lines;
            };

            function escapeHtml(text) {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            // Update stdout
            const stdoutEl = document.getElementById('output-stdout');
            if (stdoutEl) {
                stdoutEl.innerHTML = formatOutput(stdout, 'stdout');
            }

            // Update stderr
            const stderrEl = document.getElementById('output-stderr');
            if (stderrEl) {
                stderrEl.innerHTML = formatOutput(stderr, 'stderr');
            }

            // Update mixed output
            const mixedEl = document.getElementById('output-mixed');
            if (mixedEl) {
                let mixedOutput = '<div class="output-separator"></div>';
                if (stdout) {
                    stdout.split('\\n').forEach((line, idx) => {
                        const timestampMatch = line.match(/^\\[(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z)\\]/);
                        if (timestampMatch) {
                            const lineTime = new Date(timestampMatch[1]).getTime();
                            const elapsed = lineTime - commandStartTime;
                            const elapsedSec = (elapsed / 1000).toFixed(3);
                            const cleanLine = line.substring(timestampMatch[0].length).trimStart();
                            mixedOutput += '<div class="line line-stdout" data-line="stdout-' + idx + '">' +
                                '<span class="timestamp-col">+' + elapsedSec + 's</span>' +
                                '<span class="content-col">' + escapeHtml(cleanLine) + '</span>' +
                                '</div>';
                        } else {
                            mixedOutput += '<div class="line line-stdout" data-line="stdout-' + idx + '">' +
                                '<span class="timestamp-col"></span>' +
                                '<span class="content-col">' + escapeHtml(line) + '</span>' +
                                '</div>';
                        }
                    });
                }
                if (stderr) {
                    stderr.split('\\n').forEach((line, idx) => {
                        const timestampMatch = line.match(/^\\[(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z)\\]/);
                        if (timestampMatch) {
                            const lineTime = new Date(timestampMatch[1]).getTime();
                            const elapsed = lineTime - commandStartTime;
                            const elapsedSec = (elapsed / 1000).toFixed(3);
                            const cleanLine = line.substring(timestampMatch[0].length).trimStart();
                            mixedOutput += '<div class="line line-stderr" data-line="stderr-' + idx + '">' +
                                '<span class="timestamp-col">+' + elapsedSec + 's</span>' +
                                '<span class="content-col">' + escapeHtml(cleanLine) + '</span>' +
                                '</div>';
                        } else {
                            mixedOutput += '<div class="line line-stderr" data-line="stderr-' + idx + '">' +
                                '<span class="timestamp-col"></span>' +
                                '<span class="content-col">' + escapeHtml(line) + '</span>' +
                                '</div>';
                        }
                    });
                }
                mixedEl.innerHTML = mixedOutput;
            }

            // Reapply filters after updating content
            applySearch();
            applyFilter();

            // Auto-scroll to bottom if enabled
            scrollToBottom();
        }

        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                currentTab = tabName;

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                outputs.forEach(output => {
                    output.style.display = 'none';
                });
                document.getElementById('output-' + tabName).style.display = 'block';

                // Reapply filters
                applySearch();
                applyFilter();
            });
        });

        // Search (highlighting)
        searchInput.addEventListener('input', (e) => {
            applySearch();
        });

        function applySearch() {
            const query = searchInput.value.trim();
            const currentOutput = document.getElementById('output-' + currentTab);
            const lines = currentOutput.querySelectorAll('.line');

            lines.forEach(line => {
                line.classList.remove('highlight');
                if (query && line.textContent.toLowerCase().includes(query.toLowerCase())) {
                    line.classList.add('highlight');
                }
            });
        }

        // Filter (hiding non-matching lines)
        filterInput.addEventListener('input', (e) => {
            applyFilter();
        });

        function applyFilter() {
            const query = filterInput.value.trim();
            if (!query) {
                // Show all lines
                const currentOutput = document.getElementById('output-' + currentTab);
                const lines = currentOutput.querySelectorAll('.line');
                lines.forEach(line => line.classList.remove('hidden'));
                return;
            }

            const currentOutput = document.getElementById('output-' + currentTab);
            const lines = currentOutput.querySelectorAll('.line');

            // Try as regex first
            let regex;
            let isValidRegex = true;
            try {
                regex = new RegExp(query, 'i');
            } catch (e) {
                isValidRegex = false;
            }

            lines.forEach(line => {
                const text = line.textContent;
                let matches;

                if (isValidRegex) {
                    matches = regex.test(text);
                } else {
                    matches = text.toLowerCase().includes(query.toLowerCase());
                }

                if (matches) {
                    line.classList.remove('hidden');
                } else {
                    line.classList.add('hidden');
                }
            });
        }

        // Initial scroll to bottom if running command
        const isRunningCommand = ${isRunning ? 'true' : 'false'};
        if (isRunningCommand) {
            scrollToBottom();
        }
    </script>
</body>
</html>`;
  }
}
