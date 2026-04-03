import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { ConnectionsTreeProvider, ConnectionItem } from './connectionsTreeProvider';
import { DatabaseTreeProvider } from './databaseTreeProvider';
import { QueryResultsPanel } from './queryResultsPanel';
import { showConnectionForm } from './connectionForm';
import { createCompletionProvider, invalidateCache } from './completionProvider';

// Maps file URI string → connection config ID
let fileConnectionMap: Map<string, string>;

export function activate(context: vscode.ExtensionContext) {
  const connManager = new ConnectionManager(context);
  const connTree = new ConnectionsTreeProvider(connManager);
  const dbTree = new DatabaseTreeProvider(connManager);
  const resultsPanel = new QueryResultsPanel();

  // Restore file-to-connection mappings
  const saved = context.workspaceState.get<[string, string][]>('fileConnectionMap', []);
  fileConnectionMap = new Map(saved);

  // --- Schema cache (connId → schema string) ---
  const schemaCache = new Map<string, string>();

  async function getSchema(connId: string): Promise<string> {
    if (schemaCache.has(connId)) { return schemaCache.get(connId)!; }
    if (!connManager.isConnected(connId)) { return 'public'; }
    try {
      const result = await connManager.executeQuery(connId, 'SHOW search_path');
      const raw = result.rows[0]?.search_path as string ?? 'public';
      // search_path can be e.g. '"$user", public' — extract the effective schemas
      const schema = raw.replace(/"\$user",?\s*/g, '').trim() || 'public';
      schemaCache.set(connId, schema);
      return schema;
    } catch {
      return 'public';
    }
  }

  // Clear schema cache on connect/disconnect
  connManager.onDidChangeConnection(() => schemaCache.clear());

  // --- Status bar item ---
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'postgres-mtls.selectConnection';
  statusBarItem.tooltip = 'Click to change PostgreSQL connection for this file';
  context.subscriptions.push(statusBarItem);

  async function updateStatusBar() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'psql') {
      statusBarItem.hide();
      return;
    }

    const fileUri = editor.document.uri.toString();
    const connId = fileConnectionMap.get(fileUri);
    const config = connId ? connManager.getConfig(connId) : undefined;

    if (config) {
      const connected = connManager.isConnected(config.id);
      const schema = connected ? await getSchema(config.id) : 'public';
      const icon = connected ? '$(database)' : '$(circle-outline)';
      statusBarItem.text = `${icon} ${config.name}  \u2502  ${config.database}  \u2502  ${schema}`;
      statusBarItem.backgroundColor = connected
        ? undefined
        : new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.tooltip = `Connection: ${config.name}\nDatabase: ${config.database}\nSchema: ${schema}\nHost: ${config.host}:${config.port}\nUser: ${config.user}\nStatus: ${connected ? 'Connected' : 'Disconnected'}\n\nClick to change`;
    } else {
      statusBarItem.text = '$(plug) Select DB Connection';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.tooltip = 'No connection selected — click to choose';
    }
    statusBarItem.show();
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    connManager.onDidChangeConnection(() => updateStatusBar()),
  );
  updateStatusBar();

  // --- Helper: save file mapping ---
  async function setFileConnection(fileUri: string, connId: string) {
    fileConnectionMap.set(fileUri, connId);
    await context.workspaceState.update('fileConnectionMap', Array.from(fileConnectionMap.entries()));
    updateStatusBar();
  }

  // --- Helper: get connection for current file, prompting if needed ---
  async function getConnectionForFile(editor: vscode.TextEditor): Promise<string | undefined> {
    const fileUri = editor.document.uri.toString();
    let connId = fileConnectionMap.get(fileUri);

    // Validate the mapped connection still exists
    if (connId && !connManager.getConfig(connId)) {
      fileConnectionMap.delete(connId);
      connId = undefined;
    }

    if (!connId) {
      connId = await promptSelectConnection(fileUri);
      if (!connId) { return undefined; }
    }

    // Auto-connect if not already connected
    if (!connManager.isConnected(connId)) {
      const config = connManager.getConfig(connId)!;
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Connecting to ${config.name}...` },
          () => connManager.connect(connId!)
        );
        vscode.window.showInformationMessage(`Connected to "${config.name}".`);
        dbTree.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Connection failed: ${msg}`);
        return undefined;
      }
    }

    return connId;
  }

  // --- Select Connection quick pick ---
  async function promptSelectConnection(fileUri?: string): Promise<string | undefined> {
    const configs = connManager.getAllConfigs();
    if (configs.length === 0) {
      const action = await vscode.window.showWarningMessage(
        'No connections configured.', 'Add Connection'
      );
      if (action === 'Add Connection') {
        await vscode.commands.executeCommand('postgres-mtls.addConnection');
      }
      return undefined;
    }

    const items = configs.map(c => {
      const connected = connManager.isConnected(c.id);
      return {
        label: `${connected ? '$(database)' : '$(circle-outline)'} ${c.name}`,
        description: `${c.user}@${c.host}:${c.port}/${c.database}`,
        detail: connected ? 'Connected' : 'Disconnected — will auto-connect',
        id: c.id,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Select PostgreSQL Connection',
      placeHolder: 'Choose a connection for this file',
    });

    if (picked && fileUri) {
      await setFileConnection(fileUri, picked.id);
    }
    return picked?.id;
  }

  // --- Register providers ---
  // --- CodeLens: clickable connection info on line 1 ---
  const codeLensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: connManager.onDidChangeConnection,
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
      if (document.languageId !== 'psql') { return []; }
      const fileUri = document.uri.toString();
      const connId = fileConnectionMap.get(fileUri);
      const config = connId ? connManager.getConfig(connId) : undefined;
      const range = new vscode.Range(0, 0, 0, 0);

      if (config) {
        const connected = connManager.isConnected(config.id);
        const dot = connected ? '\u25CF' : '\u25CB';
        return [new vscode.CodeLens(range, {
          title: `${dot} ${config.name}  \u2502  ${config.database}  — click to change`,
          command: 'postgres-mtls.selectConnection',
        })];
      }
      return [new vscode.CodeLens(range, {
        title: '\u26A0 No connection — click to select',
        command: 'postgres-mtls.selectConnection',
      })];
    },
  };

  // --- IntelliSense completion provider ---
  const completionProvider = createCompletionProvider(
    connManager,
    (uri) => fileConnectionMap.get(uri),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('postgresConnections', connTree),
    vscode.window.registerTreeDataProvider('postgresDatabaseObjects', dbTree),
    vscode.window.registerWebviewViewProvider(QueryResultsPanel.viewType, resultsPanel),
    vscode.languages.registerCodeLensProvider({ language: 'psql' }, codeLensProvider),
    vscode.languages.registerCompletionItemProvider(
      { language: 'psql' },
      completionProvider,
      '.', // trigger after dot for schema.table and table.column
    ),
  );

  // Invalidate IntelliSense cache on connect/disconnect
  connManager.onDidChangeConnection(() => invalidateCache());

  // Set context for panel visibility
  const updateContext = () => {
    vscode.commands.executeCommand('setContext', 'postgres-mtls.hasConnection', connManager.getAllConfigs().length > 0);
  };
  connManager.onDidChangeConnection(updateContext);
  updateContext();

  // --- Commands ---

  // Select Connection for File
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.selectConnection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'psql') {
        vscode.window.showWarningMessage('Open a .psql file first.');
        return;
      }
      await promptSelectConnection(editor.document.uri.toString());
    })
  );

  // Add Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.addConnection', async () => {
      const config = await showConnectionForm();
      if (config) {
        await connManager.addConnection(config);
        vscode.window.showInformationMessage(`Connection "${config.name}" added.`);
        updateStatusBar();
      }
    })
  );

  // Edit Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.editConnection', async (item: ConnectionItem) => {
      const config = await showConnectionForm(item.config);
      if (config) {
        await connManager.updateConnection(config);
        vscode.window.showInformationMessage(`Connection "${config.name}" updated.`);
      }
    })
  );

  // Delete Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.deleteConnection', async (item: ConnectionItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Delete connection "${item.config.name}"?`, { modal: true }, 'Delete'
      );
      if (confirm === 'Delete') {
        await connManager.deleteConnection(item.config.id);
        vscode.window.showInformationMessage(`Connection "${item.config.name}" deleted.`);
      }
    })
  );

  // Connect (from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.connect', async (item: ConnectionItem) => {
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Connecting to ${item.config.name}...` },
          () => connManager.connect(item.config.id)
        );
        vscode.window.showInformationMessage(`Connected to "${item.config.name}".`);
        dbTree.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Connection failed: ${msg}`);
      }
    })
  );

  // Disconnect
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.disconnect', async (item: ConnectionItem) => {
      await connManager.disconnect(item.config.id);
      vscode.window.showInformationMessage(`Disconnected from "${item.config.name}".`);
      dbTree.refresh();
    })
  );

  // Refresh DB objects
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.refreshObjects', () => dbTree.refresh())
  );

  // New SQL Query
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.newQuery', async () => {
      const doc = await vscode.workspace.openTextDocument({ language: 'psql', content: '-- Write your PostgreSQL query here\n' });
      await vscode.window.showTextDocument(doc);
    })
  );

  // Run Query
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.runQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor with SQL.');
        return;
      }

      const connId = await getConnectionForFile(editor);
      if (!connId) { return; }

      const selection = editor.selection;
      const query = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

      if (!query.trim()) {
        vscode.window.showWarningMessage('No SQL to execute.');
        return;
      }

      try {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Running query...' },
          () => connManager.executeQuery(connId, query)
        );
        resultsPanel.show(result, query);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Query failed: ${msg}`);
      }
    })
  );

  // View Table Data
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.viewTableData', async (item: any) => {
      const connId = item.connId || connManager.getActiveConnectionId();
      if (!connId) { return; }

      const schema = item.schemaName || 'public';
      const table = item.tableName || item.label;
      const query = `SELECT * FROM "${schema}"."${table}" LIMIT 100`;

      try {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Loading ${schema}.${table}...` },
          () => connManager.executeQuery(connId, query)
        );
        resultsPanel.show(result, query);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to load table: ${msg}`);
      }
    })
  );

  // View Table Structure
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.viewTableStructure', async (item: any) => {
      const connId = item.connId || connManager.getActiveConnectionId();
      if (!connId) { return; }

      const schema = item.schemaName || 'public';
      const table = item.tableName || item.label;
      const query = `SELECT column_name, data_type, is_nullable, column_default
                     FROM information_schema.columns
                     WHERE table_schema = '${schema}' AND table_name = '${table}'
                     ORDER BY ordinal_position`;

      try {
        const result = await connManager.executeQuery(connId, query);
        resultsPanel.show(result, `-- Structure of ${schema}.${table}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to load structure: ${msg}`);
      }
    })
  );

  // Export CSV
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.exportCsv', () => {
      vscode.window.showInformationMessage('Use the "Export CSV" button in the query results panel.');
    })
  );

  context.subscriptions.push({ dispose: () => connManager.dispose() });
}

export function deactivate() {}
