import * as vscode from 'vscode';
import { QueryResult } from './types';

export class QueryResultsPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'postgresQueryResults';
  private view?: vscode.WebviewView;
  private pendingUpdate?: { result: QueryResult; query: string };

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage((msg: { type: string; csv: string }) => {
      if (msg.type === 'exportCsv') {
        QueryResultsPanel.exportCsvToFile(msg.csv);
      }
    });

    // If a query was run before the view was visible, show it now
    if (this.pendingUpdate) {
      this.update(this.pendingUpdate.result, this.pendingUpdate.query);
      this.pendingUpdate = undefined;
    }
  }

  show(result: QueryResult, query: string): void {
    if (this.view) {
      this.view.show(true);
      this.update(result, query);
    } else {
      // View not yet resolved — store for when it becomes visible
      this.pendingUpdate = { result, query };
      vscode.commands.executeCommand('postgresQueryResults.focus');
    }
  }

  private update(result: QueryResult, query: string): void {
    if (!this.view) { return; }
    this.view.webview.html = this.getHtml(result, query);
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

  private getHtml(result: QueryResult, query: string): string {
    const escapeHtml = (s: unknown): string =>
      String(s ?? 'NULL')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const copyIcon = `<span class="copy-btn" title="Copy to clipboard"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h8v8H4z" opacity="0"/><path d="M4 1.5H2a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h1V2.5h8V1.5H4zm1 2h9a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zm.5 1v9h8v-9h-8z"/></svg></span>`;

    const headerCells = result.columns.map(c =>
      `<th><span class="cell-content">${escapeHtml(c)}</span>${copyIcon}</th>`
    ).join('');
    const bodyRows = result.rows.map(row => {
      const cells = result.columns.map(col => {
        const val = row[col];
        const cssClass = val === null || val === undefined ? 'null-value' : '';
        return `<td class="${cssClass}"><span class="cell-content">${escapeHtml(val)}</span>${copyIcon}</td>`;
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
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 8px; }
  .status-bar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 10px; margin-bottom: 8px;
    background: var(--header-bg); border-radius: 4px;
    font-size: 12px; color: var(--vscode-descriptionForeground);
  }
  .status-bar .info { display: flex; gap: 16px; }
  .status-bar button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
  }
  .status-bar button:hover { background: var(--vscode-button-hoverBackground); }
  .query-preview {
    padding: 6px 10px; margin-bottom: 8px;
    background: var(--header-bg); border-radius: 4px;
    font-family: var(--vscode-editor-font-family); font-size: 11px;
    white-space: pre-wrap; max-height: 60px; overflow-y: auto;
    border-left: 3px solid var(--accent);
  }
  .table-wrapper { overflow: auto; max-height: calc(100vh - 110px); border: 1px solid var(--border); border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th {
    position: sticky; top: 0; z-index: 1;
    background: var(--header-bg); text-align: left;
    padding: 5px 8px; border-bottom: 2px solid var(--border);
    font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none;
    font-size: 12px;
  }
  th:hover { background: var(--hover-bg); }
  td { padding: 3px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; max-width: 350px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
  th, td { position: relative; }
  th { padding-right: 24px; }
  td { padding-right: 24px; }
  .cell-content { display: inline; }
  .copy-btn {
    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
    opacity: 0; cursor: pointer; color: var(--vscode-descriptionForeground);
    display: inline-flex; align-items: center; padding: 2px; border-radius: 3px;
    transition: opacity 0.15s;
  }
  .copy-btn:hover { color: var(--fg); background: var(--hover-bg); }
  th:hover .copy-btn, td:hover .copy-btn { opacity: 1; }
  .copy-toast {
    position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    padding: 4px 12px; border-radius: 4px; font-size: 11px;
    opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 100;
  }
  .copy-toast.show { opacity: 1; }
  tr:hover td { background: var(--hover-bg); }
  .null-value { color: var(--vscode-disabledForeground); font-style: italic; }
  .no-results { text-align: center; padding: 24px; color: var(--vscode-disabledForeground); }
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
<div class="copy-toast" id="copyToast">Copied!</div>
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

  // Copy button handler
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cell = btn.parentElement;
      const content = cell.querySelector('.cell-content').textContent;
      navigator.clipboard.writeText(content).then(() => {
        const toast = document.getElementById('copyToast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1200);
      });
    });
  });

  // Column sorting
  document.querySelectorAll('th').forEach((th, i) => {
    let asc = true;
    th.addEventListener('click', () => {
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
}
