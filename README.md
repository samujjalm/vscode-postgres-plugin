# PostgreSQL mTLS Explorer — VS Code Extension

A Visual Studio Code extension for connecting to PostgreSQL databases using **Mutual TLS (mTLS)** authentication, designed for environments that use **Teleport / Infrastructure Access Control** with short-lived X.509 certificates.

---

## Features

- **Teleport Integration** — Import connections directly from Teleport with a single service name
- **mTLS Authentication** — Connect using CA certificate, client certificate, and client key (no passwords)
- **Multiple Connections** — Manage multiple database connections with read-only / read-write user roles
- **Database Object Browser** — Explore schemas, tables, views, functions, columns, and indexes in a tree view
- **SQL Query Editor** — Write and execute queries in `.psql` files with rich PostgreSQL syntax highlighting
- **IntelliSense** — Autocomplete for table names, column names, functions, and SQL keywords based on the connected database
- **Per-File Connections** — Each `.psql` file remembers which database connection it uses
- **Results Panel** — View query results in the bottom panel with sortable columns, copy-to-clipboard, and CSV export
- **Rich Syntax Highlighting** — PostgreSQL-specific highlighting for keywords, data types, functions, JSON operators, dollar-quoted strings, and more

---

## Quick Start

### Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) v1.85 or later
- [Teleport CLI (`tsh`)](https://goteleport.com/docs/installation/) installed and logged in
- Active Teleport session (`tsh login`)

### 1. Install the Extension

```bash
code --install-extension postgres-mtls-explorer-0.1.0.vsix
```

Or in VS Code: **Extensions** > **...** menu > **Install from VSIX...**

### 2. Add a Connection from Teleport (Recommended)

1. Click the **database icon** in the Activity Bar (left sidebar) to open the PostgreSQL Explorer
2. In the **Connections** panel, click the **cloud icon** (Add from Teleport)
3. Enter the Teleport database service name (e.g. `crypto-transfer`)
4. Select the database user role:
   - `teleport_readonly` — Read-only access
   - `teleport_admin` — Read-write access
   - Or enter a custom user
5. The extension runs `tsh db login` and `tsh db config` automatically to set up the connection

### 3. Connect and Query

1. Click the **plug icon** next to your connection to connect
2. Create a new `.psql` file or use the **new file icon** in the Database Objects panel
3. Write your SQL and press **Cmd+Enter** (Mac) / **Ctrl+Enter** (Windows/Linux) to execute
4. Results appear in the **PG Results** tab in the bottom panel

---

## Usage Guide

### Adding Connections

**From Teleport (recommended):**
Click the cloud icon or run `Cmd+Shift+P` > **"PostgreSQL mTLS: Add from Teleport"**. Just provide the service name and user role — all certificate paths are configured automatically.

**Manual configuration:**
Click the + icon or run `Cmd+Shift+P` > **"PostgreSQL mTLS: Add Connection (Manual)"**. Fill in the connection form with:

| Field    | Description                          | Example                                                              |
|----------|--------------------------------------|----------------------------------------------------------------------|
| Name     | Friendly display name                | `crypto-transfer`                                                    |
| Host     | PostgreSQL/Teleport proxy host       | `teleport-proxy-internal-...elb.eu-central-1.amazonaws.com`          |
| Port     | Connection port                      | `3080`                                                               |
| User     | Database user                        | `teleport_admin` or `teleport_readonly`                              |
| Database | Target database name                 | `crypto_transfer`                                                    |
| CA       | Path to CA certificate (.pem)        | `~/.tsh/keys/.../cas/corporate.pem`                                  |
| Cert     | Path to client certificate (.crt)    | `~/.tsh/keys/.../<user>-db/staging/<db>.crt`                         |
| Key      | Path to client private key (.key)    | `~/.tsh/keys/.../<user>-db/staging/<db>.key`                         |

> **Note:** Teleport issues short-lived certificates. Run `tsh db login <db-name>` to refresh expired certificates.

### Managing Connections

- **Connect** — Click the plug icon next to a connection, or it auto-connects when you run a query
- **Disconnect** — Click the disconnect icon
- **Edit / Delete** — Right-click a connection
- Multiple connections can be active simultaneously

### Writing and Running Queries

1. Create a `.psql` file (the extension owns this file type — `.sql` files are left to other extensions like Snowflake)
2. Write your SQL query
3. **Run the full file:** Press **Cmd+Enter**
4. **Run a selection:** Select specific SQL text, then press **Cmd+Enter**
5. Results appear in the **PG Results** tab in the bottom panel

### Per-File Connection Binding

Each `.psql` file is bound to a specific database connection. You can see and change the connection in three ways:

- **CodeLens (line 1)** — Clickable text above your first line showing the connection name, database, and status
- **Status bar (bottom right)** — Shows connection name, database, and schema
- **Right-click** > **"Change DB Connection"** in the editor context menu

When you run a query on a file with no connection assigned, you'll be prompted to pick one.

### Browsing Database Objects

The **Database Objects** panel shows all connected databases as top-level nodes, each expandable to reveal:

- **Schemas** (e.g. `public`, `analytics`)
  - **Tables** — with columns (type, nullability, primary key indicators) and indexes
  - **Views**
  - **Functions** — with return type annotations

Right-click a table for:
- **View Table Data (Top 100)** — quick preview of table contents
- **View Table Structure** — column definitions

### IntelliSense / Autocomplete

When connected, the extension provides context-aware autocomplete in `.psql` files:

- **After `FROM` / `JOIN`** — table and view names (prioritized)
- **After `table.` or `alias.`** — columns for that table
- **After `schema.`** — tables, views, and functions in that schema
- **In `SELECT`, `WHERE`, etc.** — columns from referenced tables, plus SQL keywords
- **Functions** — with parentheses auto-inserted

Trigger with **Ctrl+Space** or type naturally.

### Query Results

Results appear in the **PG Results** tab in the bottom panel:

- **Status bar** — command type, row count, execution time
- **Sortable columns** — click any column header to sort
- **Copy cell** — hover over any cell to reveal a copy icon
- **Export CSV** — click the Export CSV button
- **Timestamps** — displayed as raw database values (no JavaScript formatting)

---

## Keyboard Shortcuts

| Shortcut                        | Action              |
|---------------------------------|---------------------|
| `Cmd+Enter` (Mac)              | Run query           |
| `Ctrl+Enter` (Windows/Linux)   | Run query           |
| `Ctrl+Space`                   | Trigger IntelliSense |

---

## Development Setup

### Clone and install

```bash
git clone https://github.com/samujjalm/vscode-postgres-plugin
cd postgres-rw
npm install
```

### Compile

```bash
npm run compile
# or watch mode:
npm run watch
```

### Run in development

1. Open the `postgres-rw` folder in VS Code
2. Press **F5** to launch the Extension Development Host
3. After code changes, run `npm run compile` and press **Cmd+Shift+F5** to restart

---

## Packaging and Publishing

### Package as .vsix

```bash
npm install -g @vscode/vsce
vsce package
```

This produces `postgres-mtls-explorer-<version>.vsix`.

### Install from .vsix

```bash
code --install-extension postgres-mtls-explorer-0.1.0.vsix
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

---

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

## License

Proprietary. See [LICENSE](LICENSE) for details.
