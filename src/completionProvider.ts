import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';

interface TableMeta {
  schema: string;
  name: string;
  type: 'table' | 'view';
  columns: ColumnMeta[];
}

interface ColumnMeta {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

interface FunctionMeta {
  schema: string;
  name: string;
  returnType: string;
}

// Cache per connection ID
const metaCache = new Map<string, {
  tables: TableMeta[];
  functions: FunctionMeta[];
  schemas: string[];
  timestamp: number;
}>();

const CACHE_TTL = 60_000; // 1 minute

async function fetchMetadata(connManager: ConnectionManager, connId: string) {
  const cached = metaCache.get(connId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }

  if (!connManager.isConnected(connId)) { return null; }

  try {
    // Fetch all tables and views
    const tablesResult = await connManager.executeQuery(connId,
      `SELECT table_schema, table_name, table_type
       FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY table_schema, table_name`
    );

    // Fetch all columns with PK info
    const columnsResult = await connManager.executeQuery(connId,
      `SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
              CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT kcu.table_schema, kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
       ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
       WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY c.table_schema, c.table_name, c.ordinal_position`
    );

    // Fetch functions
    const functionsResult = await connManager.executeQuery(connId,
      `SELECT routine_schema, routine_name, data_type
       FROM information_schema.routines
       WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
         AND routine_type = 'FUNCTION'
       ORDER BY routine_schema, routine_name`
    );

    // Fetch schemas
    const schemasResult = await connManager.executeQuery(connId,
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`
    );

    // Build table map
    const tableMap = new Map<string, TableMeta>();
    for (const row of tablesResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      tableMap.set(key, {
        schema: row.table_schema as string,
        name: row.table_name as string,
        type: (row.table_type as string) === 'VIEW' ? 'view' : 'table',
        columns: [],
      });
    }

    // Attach columns
    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const table = tableMap.get(key);
      if (table) {
        table.columns.push({
          name: row.column_name as string,
          dataType: row.data_type as string,
          isNullable: row.is_nullable === 'YES',
          isPrimaryKey: row.is_pk as boolean,
        });
      }
    }

    const functions: FunctionMeta[] = functionsResult.rows.map(r => ({
      schema: r.routine_schema as string,
      name: r.routine_name as string,
      returnType: r.data_type as string,
    }));

    const schemas = schemasResult.rows.map(r => r.schema_name as string);

    const meta = {
      tables: Array.from(tableMap.values()),
      functions,
      schemas,
      timestamp: Date.now(),
    };
    metaCache.set(connId, meta);
    return meta;
  } catch {
    return null;
  }
}

// SQL keywords for basic completion
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'AS', 'ON', 'JOIN',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL',
  'ORDER', 'BY', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
  'UNION', 'ALL', 'INTERSECT', 'EXCEPT', 'DISTINCT',
  'INSERT', 'INTO', 'VALUES', 'DEFAULT', 'RETURNING',
  'UPDATE', 'SET', 'DELETE', 'TRUNCATE',
  'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'SCHEMA',
  'IF', 'THEN', 'ELSE', 'END', 'CASE', 'WHEN',
  'WITH', 'RECURSIVE', 'LATERAL',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
  'CAST', 'ARRAY', 'ROW', 'OVER', 'PARTITION', 'WINDOW',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'EXPLAIN', 'ANALYZE', 'VERBOSE',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'CONSTRAINT',
  'NOT NULL', 'DEFAULT', 'SERIAL', 'BIGSERIAL', 'TEXT', 'INTEGER', 'BIGINT',
  'BOOLEAN', 'TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'NUMERIC', 'JSONB', 'JSON', 'UUID',
  'VARCHAR', 'CHAR', 'SMALLINT', 'REAL', 'DOUBLE PRECISION', 'BYTEA', 'INTERVAL',
];

/**
 * Parse the SQL text to find table names/aliases referenced before the cursor.
 * Returns a map of alias/name → qualified table name.
 */
function parseTableReferences(text: string): Map<string, TableRef> {
  const refs = new Map<string, TableRef>();
  // Match: FROM/JOIN table_name [alias] or schema.table_name [alias]
  const pattern = /(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const schema = match[1] || '';
    const table = match[2];
    const alias = match[3] || table;
    refs.set(alias.toLowerCase(), { schema, table, alias });
    refs.set(table.toLowerCase(), { schema, table, alias });
  }
  return refs;
}

interface TableRef {
  schema: string;
  table: string;
  alias: string;
}

export function createCompletionProvider(
  connManager: ConnectionManager,
  getConnIdForFile: (uri: string) => string | undefined,
): vscode.CompletionItemProvider {
  return {
    async provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      _token: vscode.CancellationToken,
      _context: vscode.CompletionContext,
    ): Promise<vscode.CompletionItem[]> {
      const connId = getConnIdForFile(document.uri.toString());
      if (!connId) { return []; }

      const meta = await fetchMetadata(connManager, connId);
      if (!meta) { return []; }

      const lineText = document.lineAt(position).text;
      const textBefore = lineText.substring(0, position.character);
      const fullText = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

      const items: vscode.CompletionItem[] = [];

      // After a dot — provide columns for the table/alias
      const dotMatch = textBefore.match(/(\w+)\.\w*$/);
      if (dotMatch) {
        const prefix = dotMatch[1].toLowerCase();
        const tableRefs = parseTableReferences(fullText);
        const ref = tableRefs.get(prefix);

        if (ref) {
          // It's a table alias/name — show columns
          const tableMeta = meta.tables.find(t =>
            t.name.toLowerCase() === ref.table.toLowerCase() &&
            (!ref.schema || t.schema.toLowerCase() === ref.schema.toLowerCase())
          );
          if (tableMeta) {
            for (const col of tableMeta.columns) {
              const item = new vscode.CompletionItem(col.name, vscode.CompletionItemKind.Field);
              item.detail = `${col.dataType}${col.isPrimaryKey ? ' (PK)' : ''}${col.isNullable ? '' : ' NOT NULL'}`;
              item.documentation = `Column of ${tableMeta.schema}.${tableMeta.name}`;
              item.sortText = `0_${col.name}`;
              items.push(item);
            }
            return items;
          }
        }

        // It might be schema.table — show tables in that schema
        const schemaMatch = meta.schemas.find(s => s.toLowerCase() === prefix);
        if (schemaMatch) {
          for (const t of meta.tables.filter(t => t.schema.toLowerCase() === prefix)) {
            const kind = t.type === 'view' ? vscode.CompletionItemKind.Interface : vscode.CompletionItemKind.Class;
            const item = new vscode.CompletionItem(t.name, kind);
            item.detail = `${t.type} (${t.columns.length} columns)`;
            item.sortText = `0_${t.name}`;
            items.push(item);
          }
          for (const f of meta.functions.filter(f => f.schema.toLowerCase() === prefix)) {
            const item = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Function);
            item.detail = `\u2192 ${f.returnType}`;
            items.push(item);
          }
          return items;
        }

        return items;
      }

      // After FROM/JOIN — prioritize table names
      const fromJoinMatch = textBefore.match(/(?:FROM|JOIN)\s+\w*$/i);

      // Table and view names
      for (const t of meta.tables) {
        const kind = t.type === 'view' ? vscode.CompletionItemKind.Interface : vscode.CompletionItemKind.Class;
        const item = new vscode.CompletionItem(t.name, kind);
        item.detail = `${t.schema}.${t.name} (${t.type})`;
        item.documentation = new vscode.MarkdownString(
          t.columns.slice(0, 20).map(c =>
            `${c.isPrimaryKey ? '\uD83D\uDD11' : '\u00A0\u00A0\u00A0'} \`${c.name}\` ${c.dataType}`
          ).join('  \n') +
          (t.columns.length > 20 ? `  \n... and ${t.columns.length - 20} more` : '')
        );
        item.sortText = fromJoinMatch ? `0_${t.name}` : `2_${t.name}`;
        // If schema is not public, insert schema-qualified name
        if (t.schema !== 'public') {
          item.insertText = `${t.schema}.${t.name}`;
        }
        items.push(item);
      }

      // Schema names
      for (const s of meta.schemas) {
        const item = new vscode.CompletionItem(s, vscode.CompletionItemKind.Module);
        item.detail = 'schema';
        item.sortText = `3_${s}`;
        items.push(item);
      }

      // Function names
      for (const f of meta.functions) {
        const item = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Function);
        item.detail = `${f.schema}.${f.name} \u2192 ${f.returnType}`;
        item.insertText = new vscode.SnippetString(`${f.name}($0)`);
        item.sortText = `4_${f.name}`;
        items.push(item);
      }

      // Column names from all referenced tables (for SELECT, WHERE, etc.)
      if (!fromJoinMatch) {
        const tableRefs = parseTableReferences(fullText);
        const seenCols = new Set<string>();
        for (const ref of tableRefs.values()) {
          const tableMeta = meta.tables.find(t =>
            t.name.toLowerCase() === ref.table.toLowerCase() &&
            (!ref.schema || t.schema.toLowerCase() === ref.schema.toLowerCase())
          );
          if (tableMeta) {
            for (const col of tableMeta.columns) {
              if (seenCols.has(col.name)) { continue; }
              seenCols.add(col.name);
              const item = new vscode.CompletionItem(col.name, vscode.CompletionItemKind.Field);
              item.detail = `${col.dataType} — ${tableMeta.name}`;
              item.sortText = `1_${col.name}`;
              items.push(item);
            }
          }
        }
      }

      // SQL keywords
      for (const kw of SQL_KEYWORDS) {
        const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
        item.sortText = `5_${kw}`;
        items.push(item);
      }

      return items;
    },
  };
}

export function invalidateCache(connId?: string) {
  if (connId) {
    metaCache.delete(connId);
  } else {
    metaCache.clear();
  }
}
