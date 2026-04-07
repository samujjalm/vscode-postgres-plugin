# Development Guide

## Clone and Install

```bash
git clone https://github.com/samujjalm/vscode-postgres-plugin
cd postgres-rw
npm install
```

## Compile

```bash
npm run compile
# or watch mode:
npm run watch
```

## Run in Development

1. Open the `postgres-rw` folder in VS Code
2. Press **F5** to launch the Extension Development Host
3. After code changes, run `npm run compile` and press **Cmd+Shift+F5** to restart

## Packaging and Publishing

### Package as .vsix

```bash
npm install -g @vscode/vsce
vsce package
```

This produces `sam-postgres-mtls-explorer-<version>.vsix`.

### Install from .vsix

```bash
code --install-extension sam-postgres-mtls-explorer-0.1.0.vsix
```

Or in VS Code: **Extensions** > **...** > **Install from VSIX...**

### Publish to VS Code Marketplace

1. Create a publisher at the [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
2. Create a [Personal Access Token](https://dev.azure.com/) with **Marketplace > Manage** scope
3. Login and publish:

```bash
vsce login <publisher-name>
vsce publish
```

## Project Structure

```
postgres-rw/
├── src/
│   ├── extension.ts              # Entry point — registers commands, views, providers
│   ├── connectionManager.ts      # mTLS connection logic and query execution
│   ├── connectionForm.ts         # Webview form for manual connection config
│   ├── connectionsTreeProvider.ts # Connections sidebar tree view
│   ├── databaseTreeProvider.ts   # Database objects tree (schemas/tables/views/etc.)
│   ├── queryResultsPanel.ts      # Bottom panel webview for query results
│   ├── completionProvider.ts     # IntelliSense for tables, columns, functions, keywords
│   ├── teleportImport.ts         # Teleport CLI integration (tsh db login/config)
│   └── types.ts                  # Shared TypeScript interfaces
├── syntaxes/
│   └── psql.tmLanguage.json      # PostgreSQL TextMate grammar for syntax highlighting
├── media/
│   ├── database.svg              # Activity bar icon
│   └── icon.png                  # Extension marketplace icon
├── language-configuration.json   # Bracket, comment, and auto-closing pairs
├── package.json                  # Extension manifest and dependencies
├── tsconfig.json                 # TypeScript configuration
└── README.md
```
