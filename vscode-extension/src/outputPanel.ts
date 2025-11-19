import * as vscode from 'vscode';

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

  private readonly _panel: vscode.WebviewPanel;
  private readonly _commandId: number;
  private readonly _commandData: CommandHistoryItem;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    commandId: number,
    commandData: CommandHistoryItem
  ): CommandOutputPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel for this command, show it
    if (CommandOutputPanel.panels.has(commandId)) {
      const existingPanel = CommandOutputPanel.panels.get(commandId)!;
      existingPanel._panel.reveal(column);
      return existingPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      CommandOutputPanel.viewType,
      `Output: ${commandData.command}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    const outputPanel = new CommandOutputPanel(panel, extensionUri, commandId, commandData);
    CommandOutputPanel.panels.set(commandId, outputPanel);
    return outputPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    commandId: number,
    commandData: CommandHistoryItem
  ) {
    this._panel = panel;
    this._commandId = commandId;
    this._commandData = commandData;

    // Set the webview's initial html content
    this._update();

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

  public dispose() {
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
    const success = command.exitCode === 0;
    const statusSymbol = success ? '✓' : '✗';
    const statusColor = success ? '#4caf50' : '#f44336';
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
      return output.split('\n').map((line, idx) => {
        const className = type === 'stderr' ? 'line-stderr' : 'line-stdout';
        return `<div class="line ${className}" data-line="${type}-${idx}">${escapeHtml(line)}</div>`;
      }).join('');
    };

    const formatMixedOutput = (stdout: string, stderr: string): string => {
      let output = '';
      if (stdout) {
        stdout.split('\n').forEach((line, idx) => {
          output += `<div class="line line-stdout" data-line="out-${idx}">${escapeHtml(line)}</div>`;
        });
      }
      if (stderr) {
        stderr.split('\n').forEach((line, idx) => {
          output += `<div class="line line-stderr" data-line="err-${idx}">${escapeHtml(line)}</div>`;
        });
      }
      return output;
    };

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
        }
        .command-info {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            font-size: 12px;
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
        }
        .line-stderr {
            color: var(--vscode-errorForeground);
        }
        .line-stdout {
            color: var(--vscode-foreground);
        }
        .line.hidden {
            display: none;
        }
        .line.highlight {
            background: var(--vscode-editor-findMatchHighlightBackground);
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
                <span class="info-label">Command:</span>
                <span class="info-value">${escapeHtml(command.command)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Directory:</span>
                <span class="info-value">${escapeHtml(command.cwd)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Exit Code:</span>
                <span class="info-value status">${command.exitCode} ${statusSymbol}</span>
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
        let currentTab = 'stdout';

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
            }
        });

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
    </script>
</body>
</html>`;
  }
}
