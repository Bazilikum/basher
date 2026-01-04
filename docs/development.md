# Development

## Building

```bash
npm run build
```

## Development Mode (with auto-reload)

```bash
npm run dev
```

## Watch Mode

```bash
npm run watch
```

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Linting

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Project Structure

```
basher/
├── src/
│   ├── index.ts                       # Main MCP server with all tool handlers
│   ├── services/
│   │   ├── command-executor.ts        # Command execution with timestamps
│   │   ├── history-manager.ts         # SQLite history management
│   │   ├── advanced-queries.ts        # Token-efficient query methods
│   │   ├── process-manager.ts         # Process tracking and termination
│   │   ├── logger.config.ts           # Pino logger configuration
│   │   ├── web-server.ts              # Web UI server with SSE and auto port discovery
│   │   ├── whitelist-manager.ts       # Command whitelisting security
│   │   ├── output-parser.ts           # Structured output parsing
│   │   ├── command-templates.ts       # Reusable command templates
│   │   ├── command-sessions.ts        # Command session management
│   │   └── failure-analyzer.ts        # Error analysis and suggestions
│   ├── utils/
│   │   └── output-formatter.ts        # Output formatting utilities
│   └── types/
│       └── index.ts                   # TypeScript type definitions
├── public/
│   └── index.html                     # Web dashboard UI
├── vscode-extension/                  # VS Code extension
│   ├── src/
│   │   ├── extension.ts               # Extension entry point
│   │   └── outputPanel.ts             # Custom webview panels
│   ├── dist/                          # Compiled extension
│   ├── package.json                   # Extension manifest
│   └── README.md                      # Extension documentation
├── dist/                              # Compiled JavaScript
├── logs/                              # Log files (git-ignored)
├── data/                              # SQLite database (git-ignored)
├── package.json
├── tsconfig.json
└── README.md
```

## Logging

Logs are stored in the `logs/` directory using Pino for structured JSON logging:

- **File Output**: `logs/command-execution.log` - All logs in JSON format
- **Console Output**: Warnings and errors only, pretty-printed

Configure log level via environment variable:
```bash
export LOG_LEVEL=debug
```

Supported levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

## Database

Command history is stored in `data/command-history.db` using SQLite with the following features:

- Full-text search using FTS5
- Indexes on timestamp, command, and exit code
- Automatic cleanup of old entries (configurable)

## Releases

### VS Code Extension

To create a new VS Code extension release:

1. **Update the version** in `vscode-extension/package.json`
2. **Commit the changes**:
   ```bash
   git add vscode-extension/package.json
   git commit -m "Bump VS Code extension to v1.x.x"
   ```
3. **Create and push a tag**:
   ```bash
   git tag vscode-v1.x.x
   git push origin main --tags
   ```
4. **GitHub Actions** will automatically:
   - Build the extension
   - Package the `.vsix` file
   - Create a GitHub release with the artifact

The tag must follow the format `vscode-v*` (e.g., `vscode-v1.8.0`).

### Server Release

To release a new version of the Basher MCP server:

1. **Update the version** in `package.json`
2. **Update CHANGELOG.md** with release notes
3. **Commit and tag**:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "Release v1.x.x"
   git tag v1.x.x
   git push origin main --tags
   ```

## Contributing

Issues and pull requests are welcome at https://github.com/Bazilikum/basher

## License

MIT

## Author

Bazilikum
