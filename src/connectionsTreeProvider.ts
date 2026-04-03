import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { ConnectionConfig } from './types';

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private connectionManager: ConnectionManager) {
    connectionManager.onDidChangeConnection(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConnectionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ConnectionItem[] {
    return this.connectionManager.getAllConfigs().map(config => {
      const connected = this.connectionManager.isConnected(config.id);
      return new ConnectionItem(config, connected);
    });
  }
}

export class ConnectionItem extends vscode.TreeItem {
  constructor(
    public readonly config: ConnectionConfig,
    public readonly connected: boolean
  ) {
    super(config.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${config.host}:${config.port}/${config.database}`;
    this.tooltip = `${config.name}\n${config.user}@${config.host}:${config.port}/${config.database}\nStatus: ${connected ? 'Connected' : 'Disconnected'}`;
    this.contextValue = connected ? 'connected' : 'disconnected';
    this.iconPath = new vscode.ThemeIcon(
      connected ? 'database' : 'circle-outline',
      connected
        ? new vscode.ThemeColor('charts.green')
        : new vscode.ThemeColor('disabledForeground')
    );
  }
}
