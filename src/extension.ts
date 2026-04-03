import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { ConnectionsTreeProvider, ConnectionItem } from './connectionsTreeProvider';
import { DatabaseTreeProvider } from './databaseTreeProvider';
import { QueryResultsPanel } from './queryResultsPanel';
import { showConnectionForm } from './connectionForm';

export function activate(context: vscode.ExtensionContext) {
  const connManager = new ConnectionManager(context);
  const connTree = new ConnectionsTreeProvider(connManager);
  const dbTree = new DatabaseTreeProvider(connManager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('postgresConnections', connTree),
    vscode.window.registerTreeDataProvider('postgresDatabaseObjects', dbTree),
  );

  // Add Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.addConnection', async () => {
      const config = await showConnectionForm();
      if (config) {
        await connManager.addConnection(config);
        vscode.window.showInformationMessage(`Connection "${config.name}" added.`);
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

  // Connect
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
      const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: '-- Write your SQL query here\n' });
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

      const connId = connManager.getActiveConnectionId();
      if (!connId) {
        vscode.window.showWarningMessage('No active database connection. Connect first.');
        return;
      }

      // Use selection if available, otherwise the whole document
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

        QueryResultsPanel.show(result, query);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Query failed: ${msg}`);
      }
    })
  );

  // View Table Data
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.viewTableData', async (item: any) => {
      const connId = connManager.getActiveConnectionId();
      if (!connId) { return; }

      const schema = item.schemaName || 'public';
      const table = item.tableName || item.label;
      const query = `SELECT * FROM "${schema}"."${table}" LIMIT 100`;

      try {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Loading ${schema}.${table}...` },
          () => connManager.executeQuery(connId, query)
        );
        QueryResultsPanel.show(result, query);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to load table: ${msg}`);
      }
    })
  );

  // View Table Structure
  context.subscriptions.push(
    vscode.commands.registerCommand('postgres-mtls.viewTableStructure', async (item: any) => {
      const connId = connManager.getActiveConnectionId();
      if (!connId) { return; }

      const schema = item.schemaName || 'public';
      const table = item.tableName || item.label;
      const query = `SELECT column_name, data_type, is_nullable, column_default
                     FROM information_schema.columns
                     WHERE table_schema = '${schema}' AND table_name = '${table}'
                     ORDER BY ordinal_position`;

      try {
        const result = await connManager.executeQuery(connId, query);
        QueryResultsPanel.show(result, `-- Structure of ${schema}.${table}`);
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
