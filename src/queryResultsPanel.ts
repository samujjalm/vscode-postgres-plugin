import * as vscode from 'vscode';
import { QueryResult } from './types';

export class QueryResultsPanel {
  private static currentPanel: QueryResultsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: { type: string; csv: string }) => {
        if (msg.type === 'exportCsv') {
          QueryResultsPanel.exportCsvToFile(msg.csv);
        }
      },
      null,
      this.disposables
    );
  }

  private static async exportCsvToFile(csv: string): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'CSV': ['csv'] },
      defaultUri: vscode.Uri.file('query_results.csv'),
    });
    if (uri) {
      const fs = await import('fs');
      fs.writeFileSync(uri.fsPath, csv, 'utf-8');
      vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }
  }

  static show(result: QueryResult, query: string): QueryResultsPanel {
    const column = vscode.ViewColumn.Beside;

    if (QueryResultsPanel.currentPanel) {
      QueryResultsPanel.currentPanel.panel.reveal(column);
      QueryResultsPanel.currentPanel.update(result, query);
      return QueryResultsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'postgresResults',
      'Query Results',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    QueryResultsPanel.currentPanel = new QueryResultsPanel(panel);
    QueryResultsPanel.currentPanel.update(result, query);
    return QueryResultsPanel.currentPanel;
  }

  update(result: QueryResult, query: string): void {
    this.panel.webview.html = this.getHtml(result, query);
  }

  private getHtml(result: QueryResult, query: string): string {
    const escapeHtml = (s: unknown): string =>
      String(s ?? 'NULL')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const headerCells = result.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const bodyRows = result.rows.map(row => {
      const cells = result.columns.map(col => {
        const val = row[col];
        const cssClass = val === null || val === undefined ? 'null-value' : '';
        return `<td class="${cssClass}">${escapeHtml(val)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border);
    --header-bg: var(--vscode-editorGroupHeader-tabsBackground);
    --hover-bg: var(--vscode-list-hoverBackground);
    --accent: var(--vscode-focusBorder);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 12px; }
  .status-bar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; margin-bottom: 12px;
    background: var(--header-bg); border-radius: 4px;
    font-size: 12px; color: var(--vscode-descriptionForeground);
  }
  .status-bar .info { display: flex; gap: 16px; }
  .status-bar button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;
  }
  .status-bar button:hover { background: var(--vscode-button-hoverBackground); }
  .query-preview {
    padding: 8px 12px; margin-bottom: 12px;
    background: var(--header-bg); border-radius: 4px;
    font-family: var(--vscode-editor-font-family); font-size: 12px;
    white-space: pre-wrap; max-height: 80px; overflow-y: auto;
    border-left: 3px solid var(--accent);
  }
  .table-wrapper { overflow: auto; max-height: calc(100vh - 160px); border: 1px solid var(--border); border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th {
    position: sticky; top: 0; z-index: 1;
    background: var(--header-bg); text-align: left;
    padding: 6px 10px; border-bottom: 2px solid var(--border);
    font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none;
  }
  th:hover { background: var(--hover-bg); }
  td { padding: 4px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; max-width: 400px; overflow: hidden; text-overflow: ellipsis; }
  tr:hover td { background: var(--hover-bg); }
  .null-value { color: var(--vscode-disabledForeground); font-style: italic; }
  .no-results { text-align: center; padding: 40px; color: var(--vscode-disabledForeground); }
</style>
</head>
<body>
  <div class="status-bar">
    <div class="info">
      <span>${result.command ? result.command : 'SELECT'}</span>
      <span>${result.rowCount} row${result.rowCount === 1 ? '' : 's'}</span>
      <span>${result.duration}ms</span>
    </div>
    <button onclick="exportCsv()">Export CSV</button>
  </div>
  <div class="query-preview">${escapeHtml(query.length > 500 ? query.slice(0, 500) + '...' : query)}</div>
  ${result.columns.length > 0
    ? `<div class="table-wrapper">
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`
    : `<div class="no-results">${result.command || 'Query executed successfully'} — ${result.rowCount} row(s) affected</div>`
  }
<script>
  const vscode = acquireVsCodeApi();
  const data = ${JSON.stringify({ columns: result.columns, rows: result.rows })};

  function exportCsv() {
    const header = data.columns.join(',');
    const rows = data.rows.map(r =>
      data.columns.map(c => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\\n')
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',')
    );
    vscode.postMessage({ type: 'exportCsv', csv: [header, ...rows].join('\\n') });
  }

  // Column sorting
  document.querySelectorAll('th').forEach((th, i) => {
    let asc = true;
    th.addEventListener('click', () => {
      const col = data.columns[i];
      const tbody = document.querySelector('tbody');
      const rowEls = Array.from(tbody.querySelectorAll('tr'));
      rowEls.sort((a, b) => {
        const va = a.children[i].textContent;
        const vb = b.children[i].textContent;
        const na = Number(va), nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
      rowEls.forEach(r => tbody.appendChild(r));
      asc = !asc;
    });
  });
</script>
</body>
</html>`;
  }

  dispose(): void {
    QueryResultsPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
