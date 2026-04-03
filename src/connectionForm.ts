import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ConnectionConfig } from './types';

export function showConnectionForm(
  existing?: ConnectionConfig
): Promise<ConnectionConfig | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      'postgresConnectionForm',
      existing ? `Edit Connection: ${existing.name}` : 'New PostgreSQL mTLS Connection',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = getFormHtml(existing);

    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'save') {
        const data = msg.data;
        resolve({
          id: existing?.id ?? crypto.randomUUID(),
          name: data.name.trim(),
          host: data.host.trim(),
          port: parseInt(data.port, 10),
          user: data.user.trim(),
          database: data.database.trim(),
          caPath: data.caPath.trim(),
          certPath: data.certPath.trim(),
          keyPath: data.keyPath.trim(),
        });
        panel.dispose();
      } else if (msg.type === 'cancel') {
        resolve(undefined);
        panel.dispose();
      } else if (msg.type === 'browse') {
        vscode.window.showOpenDialog({
          title: `Select ${msg.field}`,
          canSelectMany: false,
        }).then(uris => {
          if (uris?.[0]) {
            panel.webview.postMessage({ type: 'fileSelected', field: msg.field, path: uris[0].fsPath });
          }
        });
      }
    });

    panel.onDidDispose(() => resolve(undefined));
  });
}

function getFormHtml(existing?: ConnectionConfig): string {
  const v = (val: string | number | undefined, fallback = '') => val !== undefined ? String(val) : fallback;

  return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border, #3c3c3c);
    --focus-border: var(--vscode-focusBorder);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --btn-sec-bg: var(--vscode-button-secondaryBackground);
    --btn-sec-fg: var(--vscode-button-secondaryForeground);
    --btn-sec-hover: var(--vscode-button-secondaryHoverBackground);
    --error: var(--vscode-errorForeground, #f48771);
    --desc: var(--vscode-descriptionForeground);
    --separator: var(--vscode-panel-border, #2d2d2d);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--fg);
    background: var(--bg);
    padding: 24px 32px;
    max-width: 700px;
    margin: 0 auto;
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .subtitle {
    color: var(--desc);
    font-size: 12px;
    margin-bottom: 24px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--desc);
    margin: 20px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--separator);
  }
  .field {
    margin-bottom: 16px;
  }
  label {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .hint {
    color: var(--desc);
    font-size: 11px;
    margin-bottom: 4px;
  }
  input[type="text"], input[type="number"] {
    width: 100%;
    padding: 6px 10px;
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    outline: none;
  }
  input:focus {
    border-color: var(--focus-border);
  }
  input.error {
    border-color: var(--error);
  }
  .error-msg {
    color: var(--error);
    font-size: 11px;
    margin-top: 2px;
    display: none;
  }
  .row {
    display: flex;
    gap: 12px;
  }
  .row .field { flex: 1; }
  .row .field.small { flex: 0 0 120px; }
  .file-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .file-row input { flex: 1; }
  .file-row button {
    flex-shrink: 0;
    padding: 6px 12px;
    background: var(--btn-sec-bg);
    color: var(--btn-sec-fg);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .file-row button:hover { background: var(--btn-sec-hover); }
  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 28px;
    padding-top: 16px;
    border-top: 1px solid var(--separator);
  }
  .btn {
    padding: 8px 20px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .btn-primary {
    background: var(--btn-bg);
    color: var(--btn-fg);
  }
  .btn-primary:hover { background: var(--btn-hover); }
  .btn-secondary {
    background: var(--btn-sec-bg);
    color: var(--btn-sec-fg);
  }
  .btn-secondary:hover { background: var(--btn-sec-hover); }
</style>
</head>
<body>
  <h1>${existing ? 'Edit Connection' : 'New PostgreSQL mTLS Connection'}</h1>
  <div class="subtitle">Connect to PostgreSQL using certificate-based mTLS authentication (Teleport)</div>

  <div class="section-title">Connection</div>

  <div class="field">
    <label for="name">Name</label>
    <div class="hint">A friendly name to identify this connection</div>
    <input type="text" id="name" placeholder="e.g. crypto-transfer" value="${v(existing?.name)}" />
    <div class="error-msg" id="name-error">Name is required</div>
  </div>

  <div class="row">
    <div class="field">
      <label for="host">Host</label>
      <input type="text" id="host" placeholder="e.g. teleport-proxy.example.com" value="${v(existing?.host)}" />
      <div class="error-msg" id="host-error">Host is required</div>
    </div>
    <div class="field small">
      <label for="port">Port</label>
      <input type="number" id="port" placeholder="3080" value="${v(existing?.port, '3080')}" min="1" max="65535" />
      <div class="error-msg" id="port-error">Invalid port</div>
    </div>
  </div>

  <div class="row">
    <div class="field">
      <label for="user">User</label>
      <input type="text" id="user" placeholder="e.g. teleport_admin" value="${v(existing?.user)}" />
      <div class="error-msg" id="user-error">User is required</div>
    </div>
    <div class="field">
      <label for="database">Database</label>
      <input type="text" id="database" placeholder="e.g. crypto_transfer" value="${v(existing?.database)}" />
      <div class="error-msg" id="database-error">Database is required</div>
    </div>
  </div>

  <div class="section-title">mTLS Certificates</div>

  <div class="field">
    <label for="caPath">CA Certificate (.pem)</label>
    <div class="hint">Certificate Authority that signed the server certificate</div>
    <div class="file-row">
      <input type="text" id="caPath" placeholder="/path/to/cas/corporate.pem" value="${v(existing?.caPath)}" />
      <button onclick="browse('caPath')">Browse</button>
    </div>
    <div class="error-msg" id="caPath-error">CA certificate path is required</div>
  </div>

  <div class="field">
    <label for="certPath">Client Certificate (.crt)</label>
    <div class="hint">Your client identity certificate</div>
    <div class="file-row">
      <input type="text" id="certPath" placeholder="/path/to/user-db/staging/db-name.crt" value="${v(existing?.certPath)}" />
      <button onclick="browse('certPath')">Browse</button>
    </div>
    <div class="error-msg" id="certPath-error">Client certificate path is required</div>
  </div>

  <div class="field">
    <label for="keyPath">Client Key (.key)</label>
    <div class="hint">Your private key proving ownership of the certificate</div>
    <div class="file-row">
      <input type="text" id="keyPath" placeholder="/path/to/user-db/staging/db-name.key" value="${v(existing?.keyPath)}" />
      <button onclick="browse('keyPath')">Browse</button>
    </div>
    <div class="error-msg" id="keyPath-error">Client key path is required</div>
  </div>

  <div class="actions">
    <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
    <button class="btn btn-primary" onclick="save()">
      ${existing ? 'Update Connection' : 'Save & Connect'}
    </button>
  </div>

<script>
  const vscode = acquireVsCodeApi();

  const fields = ['name', 'host', 'port', 'user', 'database', 'caPath', 'certPath', 'keyPath'];

  function browse(field) {
    vscode.postMessage({ type: 'browse', field });
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'fileSelected') {
      document.getElementById(msg.field).value = msg.path;
      clearError(msg.field);
    }
  });

  function clearError(field) {
    document.getElementById(field).classList.remove('error');
    document.getElementById(field + '-error').style.display = 'none';
  }

  function showError(field) {
    document.getElementById(field).classList.add('error');
    document.getElementById(field + '-error').style.display = 'block';
  }

  // Clear errors on input
  fields.forEach(f => {
    document.getElementById(f).addEventListener('input', () => clearError(f));
  });

  function save() {
    let valid = true;
    const data = {};
    for (const f of fields) {
      const el = document.getElementById(f);
      data[f] = el.value;
      if (!el.value.trim()) {
        showError(f);
        valid = false;
      } else {
        clearError(f);
      }
    }
    const port = parseInt(data.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      showError('port');
      valid = false;
    }
    if (valid) {
      vscode.postMessage({ type: 'save', data });
    }
  }

  function cancel() {
    vscode.postMessage({ type: 'cancel' });
  }

  // Submit on Ctrl/Cmd+Enter
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    if (e.key === 'Escape') cancel();
  });
</script>
</body>
</html>`;
}
