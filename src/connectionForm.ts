import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ConnectionConfig } from './types';

export async function showConnectionForm(
  existing?: ConnectionConfig
): Promise<ConnectionConfig | undefined> {
  const name = await vscode.window.showInputBox({
    title: 'Connection Name',
    prompt: 'A friendly name for this connection',
    value: existing?.name ?? '',
    validateInput: v => (v.trim() ? null : 'Name is required'),
  });
  if (!name) { return undefined; }

  const host = await vscode.window.showInputBox({
    title: 'Host',
    prompt: 'PostgreSQL host address',
    value: existing?.host ?? '',
    validateInput: v => (v.trim() ? null : 'Host is required'),
  });
  if (!host) { return undefined; }

  const portStr = await vscode.window.showInputBox({
    title: 'Port',
    prompt: 'PostgreSQL port',
    value: existing?.port?.toString() ?? '5432',
    validateInput: v => {
      const n = parseInt(v, 10);
      return n > 0 && n < 65536 ? null : 'Enter a valid port number (1-65535)';
    },
  });
  if (!portStr) { return undefined; }

  const user = await vscode.window.showInputBox({
    title: 'User',
    prompt: 'Database user',
    value: existing?.user ?? '',
    validateInput: v => (v.trim() ? null : 'User is required'),
  });
  if (!user) { return undefined; }

  const database = await vscode.window.showInputBox({
    title: 'Database',
    prompt: 'Database name',
    value: existing?.database ?? '',
    validateInput: v => (v.trim() ? null : 'Database is required'),
  });
  if (!database) { return undefined; }

  const caPath = await pickFile('CA Certificate (.pem)', existing?.caPath);
  if (!caPath) { return undefined; }

  const certPath = await pickFile('Client Certificate (.crt)', existing?.certPath);
  if (!certPath) { return undefined; }

  const keyPath = await pickFile('Client Key (.key)', existing?.keyPath);
  if (!keyPath) { return undefined; }

  return {
    id: existing?.id ?? crypto.randomUUID(),
    name: name.trim(),
    host: host.trim(),
    port: parseInt(portStr, 10),
    user: user.trim(),
    database: database.trim(),
    caPath,
    certPath,
    keyPath,
  };
}

async function pickFile(label: string, defaultPath?: string): Promise<string | undefined> {
  const choice = defaultPath
    ? await vscode.window.showQuickPick(
        [
          { label: `Keep existing: ${defaultPath}`, value: defaultPath },
          { label: `Browse for new ${label}...`, value: '__browse__' },
          { label: 'Enter path manually...', value: '__manual__' },
        ],
        { title: label }
      )
    : await vscode.window.showQuickPick(
        [
          { label: `Browse for ${label}...`, value: '__browse__' },
          { label: 'Enter path manually...', value: '__manual__' },
        ],
        { title: label }
      );

  if (!choice) { return undefined; }
  if (choice.value === '__browse__') {
    const uris = await vscode.window.showOpenDialog({
      title: label,
      canSelectMany: false,
      openLabel: `Select ${label}`,
    });
    return uris?.[0]?.fsPath;
  }
  if (choice.value === '__manual__') {
    return vscode.window.showInputBox({
      title: label,
      prompt: `Full path to ${label}`,
      validateInput: v => (v.trim() ? null : 'Path is required'),
    });
  }
  return choice.value;
}
