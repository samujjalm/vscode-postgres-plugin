import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';

type DbTreeNode = SchemaNode | CategoryNode | TableNode | ViewNode | FunctionNode | ColumnNode | IndexNode;

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DbTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DbTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private connectionManager: ConnectionManager) {
    connectionManager.onDidChangeConnection(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DbTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DbTreeNode): Promise<DbTreeNode[]> {
    const connId = this.connectionManager.getActiveConnectionId();
    if (!connId) { return []; }

    if (!element) {
      return this.getSchemas(connId);
    }
    if (element instanceof SchemaNode) {
      return [
        new CategoryNode('Tables', 'tables', element.schemaName, connId),
        new CategoryNode('Views', 'views', element.schemaName, connId),
        new CategoryNode('Functions', 'functions', element.schemaName, connId),
      ];
    }
    if (element instanceof CategoryNode) {
      switch (element.category) {
        case 'tables': return this.getTables(connId, element.schemaName);
        case 'views': return this.getViews(connId, element.schemaName);
        case 'functions': return this.getFunctions(connId, element.schemaName);
      }
    }
    if (element instanceof TableNode) {
      const columns = await this.getColumns(connId, element.schemaName, element.tableName);
      const indexes = await this.getIndexes(connId, element.schemaName, element.tableName);
      return [...columns, ...indexes];
    }
    return [];
  }

  private async getSchemas(connId: string): Promise<SchemaNode[]> {
    const result = await this.connectionManager.executeQuery(connId,
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`
    );
    return result.rows.map(r => new SchemaNode(r.schema_name as string));
  }

  private async getTables(connId: string, schema: string): Promise<TableNode[]> {
    const result = await this.connectionManager.executeQuery(connId,
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${schema}' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    return result.rows.map(r => new TableNode(r.table_name as string, schema));
  }

  private async getViews(connId: string, schema: string): Promise<ViewNode[]> {
    const result = await this.connectionManager.executeQuery(connId,
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = '${schema}'
       ORDER BY table_name`
    );
    return result.rows.map(r => new ViewNode(r.table_name as string, schema));
  }

  private async getFunctions(connId: string, schema: string): Promise<FunctionNode[]> {
    const result = await this.connectionManager.executeQuery(connId,
      `SELECT routine_name, data_type FROM information_schema.routines
       WHERE routine_schema = '${schema}' AND routine_type = 'FUNCTION'
       ORDER BY routine_name`
    );
    return result.rows.map(r => new FunctionNode(
      r.routine_name as string, r.data_type as string, schema
    ));
  }

  private async getColumns(connId: string, schema: string, table: string): Promise<ColumnNode[]> {
    const result = await this.connectionManager.executeQuery(connId,
      `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
              CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = '${schema}' AND tc.table_name = '${table}'
       ) pk ON c.column_name = pk.column_name
       WHERE c.table_schema = '${schema}' AND c.table_name = '${table}'
       ORDER BY c.ordinal_position`
    );
    return result.rows.map(r => new ColumnNode(
      r.column_name as string,
      r.data_type as string,
      r.is_nullable === 'YES',
      r.column_default as string | null,
      r.is_pk as boolean,
    ));
  }

  private async getIndexes(connId: string, schema: string, table: string): Promise<IndexNode[]> {
    const result = await this.connectionManager.executeQuery(connId,
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = '${schema}' AND tablename = '${table}'
       ORDER BY indexname`
    );
    return result.rows.map(r => new IndexNode(
      r.indexname as string, r.indexdef as string
    ));
  }
}

class SchemaNode extends vscode.TreeItem {
  constructor(public readonly schemaName: string) {
    super(schemaName, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    this.contextValue = 'schema';
  }
}

class CategoryNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly category: 'tables' | 'views' | 'functions',
    public readonly schemaName: string,
    public readonly connId: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'category';
  }
}

class TableNode extends vscode.TreeItem {
  constructor(
    public readonly tableName: string,
    public readonly schemaName: string,
  ) {
    super(tableName, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('symbol-class');
    this.contextValue = 'table';
    this.tooltip = `${schemaName}.${tableName}`;
  }
}

class ViewNode extends vscode.TreeItem {
  constructor(
    public readonly viewName: string,
    public readonly schemaName: string,
  ) {
    super(viewName, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('eye');
    this.contextValue = 'view';
    this.tooltip = `${schemaName}.${viewName}`;
  }
}

class FunctionNode extends vscode.TreeItem {
  constructor(
    public readonly functionName: string,
    public readonly returnType: string,
    public readonly schemaName: string,
  ) {
    super(functionName, vscode.TreeItemCollapsibleState.None);
    this.description = `→ ${returnType}`;
    this.iconPath = new vscode.ThemeIcon('symbol-function');
    this.contextValue = 'function';
  }
}

class ColumnNode extends vscode.TreeItem {
  constructor(
    name: string,
    dataType: string,
    isNullable: boolean,
    defaultValue: string | null,
    isPrimaryKey: boolean,
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);
    const pkLabel = isPrimaryKey ? '🔑 ' : '';
    const nullLabel = isNullable ? '' : ' NOT NULL';
    this.description = `${pkLabel}${dataType}${nullLabel}`;
    this.tooltip = `${name} ${dataType}${nullLabel}${defaultValue ? ` DEFAULT ${defaultValue}` : ''}${isPrimaryKey ? ' (PK)' : ''}`;
    this.iconPath = new vscode.ThemeIcon(isPrimaryKey ? 'key' : 'symbol-field');
    this.contextValue = 'column';
  }
}

class IndexNode extends vscode.TreeItem {
  constructor(name: string, definition: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = 'index';
    this.tooltip = definition;
    this.iconPath = new vscode.ThemeIcon('list-tree');
    this.contextValue = 'index';
  }
}
