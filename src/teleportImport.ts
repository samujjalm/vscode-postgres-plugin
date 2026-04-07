import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { ConnectionConfig } from './types';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB for large tsh db ls output

interface TeleportDb {
  name: string;
  description: string;
  labels: Record<string, string>;
}

/**
 * List available PostgreSQL databases from Teleport.
 */
async function listTeleportDatabases(): Promise<TeleportDb[]> {
  const { stdout } = await execFileAsync('tsh', ['db', 'ls', '--format=json'], { maxBuffer: MAX_BUFFER });
  const raw = JSON.parse(stdout) as any[];
  return raw
    .filter(db => db.spec?.protocol === 'postgres')
    .map(db => ({
      name: db.metadata.name as string,
      description: (db.metadata.description as string) || '',
      labels: db.metadata.labels || {},
    }));
}

/**
 * Parse a psql connection string from `tsh db config --format=cmd`.
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
 * Prompt user to pick a database from `tsh db ls`, or fall back to manual input.
 */
async function pickServiceName(): Promise<string | undefined> {
  let databases: TeleportDb[];
  try {
    databases = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Fetching Teleport databases...' },
      () => listTeleportDatabases()
    );
  } catch {
    // Fallback: let user type the name manually
    return vscode.window.showInputBox({
      title: 'Teleport Database Service Name',
      prompt: 'Could not list databases. Enter the service name manually (e.g. weather-app)',
      placeHolder: 'weather-app',
      validateInput: v => v.trim() ? null : 'Service name is required',
    });
  }

  if (databases.length === 0) {
    vscode.window.showWarningMessage('No PostgreSQL databases found in Teleport.');
    return undefined;
  }

  const items = databases.map(db => ({
    label: db.name,
    description: db.description,
    detail: Object.entries(db.labels)
      .filter(([k]) => !k.startsWith('teleport.dev/'))
      .map(([k, v]) => `${k}: ${v}`)
      .join('  |  ') || undefined,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Select Teleport Database',
    placeHolder: 'Search databases...',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return picked?.label;
}

/**
 * Import a connection from Teleport.
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

  // Pick a database
  const serviceName = await pickServiceName();
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

  // Derive db-name: replace hyphens with underscores
  const dbName = serviceName.replace(/-/g, '_');

  // Login to the database (generates certificates)
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Logging in to ${serviceName} as ${selectedUser}...` },
      () => execFileAsync('tsh', ['db', 'login', '--db-user', selectedUser, '--db-name', dbName, serviceName])
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to login: ${msg}`);
    return undefined;
  }

  // Get connection config
  try {
    const { stdout } = await execFileAsync('tsh', ['db', 'config', '--format=cmd', serviceName]);
    const config = parseConnectionString(stdout, serviceName);
    config.user = selectedUser;
    const suffix = selectedUser.includes('readonly') ? '(ro)' : selectedUser.includes('admin') ? '(rw)' : `(${selectedUser})`;
    config.name = `${serviceName} ${suffix}`;
    return config;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to get config: ${msg}`);
    return undefined;
  }
}
