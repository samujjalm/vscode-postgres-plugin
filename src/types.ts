export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  database: string;
  caPath: string;
  certPath: string;
  keyPath: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  command: string;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface IndexInfo {
  name: string;
  definition: string;
  isUnique: boolean;
  isPrimary: boolean;
}
