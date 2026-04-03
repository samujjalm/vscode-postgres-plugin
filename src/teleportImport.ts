import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { ConnectionConfig } from './types';

const execFileAsync = promisify(execFile);

/**
 * Parse a psql connection string from `tsh db config --format=cmd`.
 * Format: /path/to/psql "postgres://user@host:port/db?sslrootcert=...&sslcert=...&sslkey=...&sslmode=..."
 */
function parseConnectionString(output: string, serviceName: string): ConnectionConfig {
  const urlMatch = output.match(/"(postgres:\/\/[^"]+)"/);
  if (!urlMatch) {
    throw new Error('Could not parse tsh db config output');
  }

  const url = new URL(urlMatch[1]);

  return {
    id: crypto.randomUUID(),
    name: serviceName,
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: url.username || 'postgres',
    database: url.pathname.replace(/^\//, '') || serviceName,
    caPath: url.searchParams.get('sslrootcert') || '',
    certPath: url.searchParams.get('sslcert') || '',
    keyPath: url.searchParams.get('sslkey') || '',
  };
}

/**
 * Import a connection from Teleport.
 * Asks for service name and db user, runs tsh db login + tsh db config.
 */
export async function importFromTeleport(): Promise<ConnectionConfig | undefined> {
  // Check if tsh is available
  try {
    await execFileAsync('tsh', ['version']);
  } catch {
    const action = await vscode.window.showErrorMessage(
      'Teleport CLI (tsh) not found. Please install it and ensure it\'s in your PATH.',
      'Learn More'
    );
    if (action === 'Learn More') {
      vscode.env.openExternal(vscode.Uri.parse('https://goteleport.com/docs/installation/'));
    }
    return undefined;
  }

  // Ask for the service name
  const serviceName = await vscode.window.showInputBox({
    title: 'Teleport Database Service Name',
    prompt: 'Enter the Teleport database service name (e.g. crypto-transfer)',
    placeHolder: 'crypto-transfer',
    validateInput: v => v.trim() ? null : 'Service name is required',
  });
  if (!serviceName) { return undefined; }

  // Ask for database user
  const dbUser = await vscode.window.showQuickPick(
    [
      { label: 'teleport_readonly', description: 'Read-only access' },
      { label: 'teleport_admin', description: 'Read-write access' },
      { label: 'Other...', description: 'Enter a custom database user' },
    ],
    {
      title: `Database User for ${serviceName}`,
      placeHolder: 'Select the database user role',
    }
  );
  if (!dbUser) { return undefined; }

  let selectedUser = dbUser.label;
  if (selectedUser === 'Other...') {
    const custom = await vscode.window.showInputBox({
      title: 'Database User',
      prompt: 'Enter the database user name',
      validateInput: v => v.trim() ? null : 'User is required',
    });
    if (!custom) { return undefined; }
    selectedUser = custom.trim();
  }

  // Login to the database (generates certificates)
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Logging in to ${serviceName} as ${selectedUser}...` },
      () => execFileAsync('tsh', ['db', 'login', '--db-user', selectedUser, serviceName.trim()])
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to login: ${msg}`);
    return undefined;
  }

  // Get connection config
  try {
    const { stdout } = await execFileAsync('tsh', ['db', 'config', '--format=cmd', serviceName.trim()]);
    const config = parseConnectionString(stdout, serviceName.trim());
    config.user = selectedUser;
    const suffix = selectedUser.includes('readonly') ? '(ro)' : selectedUser.includes('admin') ? '(rw)' : `(${selectedUser})`;
    config.name = `${serviceName.trim()} ${suffix}`;
    return config;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to get config: ${msg}`);
    return undefined;
  }
}
