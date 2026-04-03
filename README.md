# PostgreSQL mTLS Explorer — VS Code Extension

A Visual Studio Code extension for connecting to PostgreSQL databases using **Mutual TLS (mTLS)** authentication, designed for environments that use **Teleport / Infrastructure Access Control** with short-lived X.509 certificates.

## Features

- **mTLS Authentication** — Connect using CA certificate, client certificate, and client key (no passwords)
- **Database Object Browser** — Explore schemas, tables, views, functions, columns, and indexes in a tree view
- **SQL Query Editor** — Write and execute SQL queries with syntax highlighting
- **Results Panel** — View query results in a sortable table with column sorting
- **CSV Export** — Export query results to CSV files
- **Multiple Connections** — Save and manage multiple database connection configurations
- **View Table Data** — Quick-view the first 100 rows of any table

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Visual Studio Code](https://code.visualstudio.com/) v1.85 or later
- Valid mTLS certificates (CA, client cert, client key) — typically from Teleport's `tsh` CLI

## Connection Configuration

Each connection requires:

| Field    | Description                          | Example                                                                                     |
|----------|--------------------------------------|---------------------------------------------------------------------------------------------|
| Name     | Friendly display name                | `crypto-transfer`                                                                           |
| Host     | PostgreSQL/Teleport proxy host       | `teleport-proxy-internal-02603afb6b39269e.elb.eu-central-1.amazonaws.com`                   |
| Port     | Connection port                      | `3080`                                                                                      |
| User     | Database user                        | `teleport_admin`                                                                            |
| Database | Target database name                 | `crypto_transfer`                                                                           |
| CA       | Path to CA certificate (.pem)        | `~/.tsh/keys/teleport.internal.corp.example.com/cas/corporate.pem`                          |
| Cert     | Path to client certificate (.crt)    | `~/.tsh/keys/teleport.internal.corp.example.com/user@example.com-db/staging/db-name.crt`    |
| Key      | Path to client private key (.key)    | `~/.tsh/keys/teleport.internal.corp.example.com/user@example.com-db/staging/db-name.key`    |

> **Note:** Teleport issues short-lived certificates. You may need to run `tsh db login <db-name>` to refresh expired certificates before connecting.

---

## Development Setup (Testing Locally)

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd postgres-rw
npm install
```

### 2. Compile the extension

```bash
npm run compile
```

Or use watch mode during development:

```bash
npm run watch
```

### 3. Run in VS Code (Extension Development Host)

1. Open the `postgres-rw` folder in VS Code
2. Press **F5** (or go to **Run > Start Debugging**)
3. This opens a new **Extension Development Host** window with the extension loaded
4. In the new window, look for the **database icon** in the Activity Bar (left sidebar)

### 4. Test the connection

1. Click the **+** button in the "Connections" panel to add a new connection
2. Fill in your connection details (host, port, user, database, certificate paths)
3. Click the **plug icon** next to your connection to connect
4. Browse database objects in the "Database Objects" panel
5. Click the **file icon** to open a new SQL editor, write a query, and press **Cmd+Shift+Enter** (Mac) / **Ctrl+Shift+Enter** (Windows/Linux) to execute

---

## Usage

### Adding a Connection
Click the **+** icon in the Connections panel or run the command **PostgreSQL mTLS: Add Connection** from the command palette (`Cmd+Shift+P`).

### Connecting / Disconnecting
- Click the **plug icon** next to a saved connection to connect
- Click the **disconnect icon** to disconnect
- Right-click a connection for edit/delete options

### Browsing Database Objects
Once connected, the Database Objects panel shows:
- **Schemas** — expandable to reveal:
  - **Tables** — expandable to show columns (with types, nullability, PK indicators) and indexes
  - **Views** — listed under each schema
  - **Functions** — with return type annotations

### Running Queries
1. Open a `.sql` file or create a new SQL editor via the command palette
2. Write your SQL query
3. Press **Cmd+Shift+Enter** (Mac) or **Ctrl+Shift+Enter** to execute
4. Select specific text to execute only that portion
5. Results appear in a side panel with:
   - Row count and execution time
   - Sortable columns (click headers)
   - **Export CSV** button

### Viewing Table Data
Right-click any table in the tree view and select **View Table Data (Top 100)**.

---

## Packaging the Extension (.vsix)

To create a distributable `.vsix` file for sharing with teammates:

```bash
# Install the packaging tool (if not already installed)
npm install -g @vscode/vsce

# Package the extension
vsce package
```

This produces a file like `postgres-mtls-explorer-0.1.0.vsix`.

### Installing a .vsix file

Others can install it in VS Code:

```bash
code --install-extension postgres-mtls-explorer-0.1.0.vsix
```

Or in VS Code: **Extensions** > **...** menu > **Install from VSIX...**

---

## Publishing to the VS Code Marketplace

### 1. Create a publisher account

1. Go to the [Visual Studio Marketplace Management page](https://marketplace.visualstudio.com/manage)
2. Sign in with a Microsoft account
3. Create a **publisher** (e.g., `samujjal`)

### 2. Create a Personal Access Token (PAT)

1. Go to [Azure DevOps](https://dev.azure.com/) and sign in
2. Click your profile icon > **Personal access tokens**
3. Create a new token with:
   - **Organization**: All accessible organizations
   - **Scopes**: select **Marketplace > Manage**
4. Copy the token

### 3. Login and publish

```bash
# Login with your publisher credentials
vsce login <publisher-name>
# Paste your PAT when prompted

# Publish
vsce publish
```

### 4. Updating the extension

1. Update the `version` in `package.json` (e.g., `0.1.0` → `0.2.0`)
2. Run `vsce publish` again

### Publish checklist

- [ ] Update `version` in `package.json`
- [ ] Ensure `publisher` in `package.json` matches your Marketplace publisher ID
- [ ] Add an icon file at `media/icon.png` (128x128 minimum)
- [ ] Review the `README.md` — it becomes the Marketplace listing page
- [ ] Add a `CHANGELOG.md` if desired
- [ ] Run `vsce package` to verify the build before publishing

---

## Project Structure

```
postgres-rw/
├── src/
│   ├── extension.ts              # Entry point — registers commands and views
│   ├── connectionManager.ts      # mTLS connection logic and query execution
│   ├── connectionForm.ts         # Multi-step input UI for connection config
│   ├── connectionsTreeProvider.ts # Connections sidebar tree view
│   ├── databaseTreeProvider.ts   # Database objects tree (schemas/tables/views/etc.)
│   ├── queryResultsPanel.ts      # Webview panel for query results display
│   └── types.ts                  # Shared TypeScript interfaces
├── media/
│   └── database.svg              # Activity bar icon
├── package.json                  # Extension manifest and dependencies
├── tsconfig.json                 # TypeScript configuration
└── README.md
```

## Keyboard Shortcuts

| Shortcut                     | Action      |
|------------------------------|-------------|
| `Cmd+Shift+Enter` (Mac)     | Run query   |
| `Ctrl+Shift+Enter` (Win/Linux) | Run query |

## License

Proprietary. See [LICENSE](LICENSE) for details.
