import * as vscode from 'vscode';
import * as fs from 'fs';
import { Client, types } from 'pg';
import { ConnectionConfig, QueryResult } from './types';

// Return date/timestamp types as raw strings instead of JS Date objects
types.setTypeParser(1082, (val: string) => val); // date
types.setTypeParser(1083, (val: string) => val); // time
types.setTypeParser(1114, (val: string) => val); // timestamp
types.setTypeParser(1184, (val: string) => val); // timestamptz
types.setTypeParser(1266, (val: string) => val); // timetz

export class ConnectionManager {
  private connections = new Map<string, Client>();
  private configs = new Map<string, ConnectionConfig>();
  private context: vscode.ExtensionContext;
  private _onDidChangeConnection = new vscode.EventEmitter<void>();
  readonly onDidChangeConnection = this._onDidChangeConnection.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadConfigs();
  }

  private loadConfigs(): void {
    const saved = this.context.globalState.get<ConnectionConfig[]>('connections', []);
    for (const config of saved) {
      this.configs.set(config.id, config);
    }
  }

  private async saveConfigs(): Promise<void> {
    await this.context.globalState.update('connections', Array.from(this.configs.values()));
  }

  getAllConfigs(): ConnectionConfig[] {
    return Array.from(this.configs.values());
  }

  getConfig(id: string): ConnectionConfig | undefined {
    return this.configs.get(id);
  }

  isConnected(id: string): boolean {
    return this.connections.has(id);
  }

  getActiveConnectionId(): string | undefined {
    for (const [id] of this.connections) {
      return id;
    }
    return undefined;
  }

  async addConnection(config: ConnectionConfig): Promise<void> {
    this.configs.set(config.id, config);
    await this.saveConfigs();
    this._onDidChangeConnection.fire();
  }

  async updateConnection(config: ConnectionConfig): Promise<void> {
    if (this.isConnected(config.id)) {
      await this.disconnect(config.id);
    }
    this.configs.set(config.id, config);
    await this.saveConfigs();
    this._onDidChangeConnection.fire();
  }

  async deleteConnection(id: string): Promise<void> {
    if (this.isConnected(id)) {
      await this.disconnect(id);
    }
    this.configs.delete(id);
    await this.saveConfigs();
    this._onDidChangeConnection.fire();
  }

  async connect(id: string): Promise<void> {
    const config = this.configs.get(id);
    if (!config) {
      throw new Error(`Connection config not found: ${id}`);
    }

    // Validate certificate files exist
    for (const [label, path] of [
      ['CA certificate', config.caPath],
      ['Client certificate', config.certPath],
      ['Client key', config.keyPath],
    ] as const) {
      if (!fs.existsSync(path)) {
        throw new Error(`${label} not found: ${path}`);
      }
    }

    const client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync(config.caPath, 'utf-8'),
        cert: fs.readFileSync(config.certPath, 'utf-8'),
        key: fs.readFileSync(config.keyPath, 'utf-8'),
      },
    });

    await client.connect();
    this.connections.set(id, client);
    this._onDidChangeConnection.fire();
  }

  async disconnect(id: string): Promise<void> {
    const client = this.connections.get(id);
    if (client) {
      await client.end();
      this.connections.delete(id);
      this._onDidChangeConnection.fire();
    }
  }

  async executeQuery(id: string, sql: string): Promise<QueryResult> {
    const client = this.connections.get(id);
    if (!client) {
      throw new Error('Not connected. Please connect first.');
    }

    const start = Date.now();
    const result = await client.query(sql);
    const duration = Date.now() - start;

    const columns = result.fields?.map(f => f.name) ?? [];
    const rows = (result.rows as Record<string, unknown>[]) ?? [];

    return {
      columns,
      rows,
      rowCount: result.rowCount ?? 0,
      duration,
      command: result.command ?? '',
    };
  }

  dispose(): void {
    for (const [id] of this.connections) {
      this.disconnect(id).catch(() => {});
    }
    this._onDidChangeConnection.dispose();
  }
}
