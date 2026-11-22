#!/usr/bin/env node
/**
 * Runs a real PostgreSQL server for local development without Docker or a system install.
 * Uses the `embedded-postgres` package, which downloads official PostgreSQL binaries.
 *
 * Data lives OUTSIDE the repository by default (see ADR-0003), because synced folders such as
 * OneDrive can lock or corrupt database files. Override with NOVA_PG_DATA_DIR.
 *
 *   pnpm db:start        start (initialises on first run) and keep running; Ctrl+C to stop
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://nova:nova@localhost:54329/nova');
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username || 'nova');
const password = decodeURIComponent(url.password || 'nova');
const databases = [url.pathname.slice(1) || 'nova'];
if (process.env.TEST_DATABASE_URL) {
  databases.push(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1));
}

const defaultDataRoot =
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'nova')
    : path.join(os.homedir(), '.local', 'share', 'nova');
const databaseDir = path.resolve(
  process.env.NOVA_PG_DATA_DIR ?? path.join(defaultDataRoot, 'pgdata'),
);

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  // Force UTF-8 regardless of the OS locale (Windows would otherwise pick WIN1252, which cannot
  // store characters such as ₹ or typographic quotes).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (message) => console.error(`[postgres] ${String(message).trim()}`),
});

const initialised = fs.existsSync(path.join(databaseDir, 'PG_VERSION'));
if (!initialised) {
  console.log(`Initialising PostgreSQL data directory at ${databaseDir}`);
  fs.mkdirSync(path.dirname(databaseDir), { recursive: true });
  await pg.initialise();
}

await pg.start();
for (const name of databases) {
  try {
    await pg.createDatabase(name);
    console.log(`Created database "${name}"`);
  } catch {
    // Already exists.
  }
}

const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query('SHOW server_encoding');
await client.end();
if (rows[0]?.server_encoding !== 'UTF8') {
  console.error(
    `
This data directory uses ${rows[0]?.server_encoding} encoding; NOVA needs UTF8.
` +
      `Stop this script, delete ${databaseDir} (local development data only) and run it again.
`,
  );
}

console.log(`PostgreSQL ready on localhost:${port} (databases: ${databases.join(', ')})`);
console.log(`Data directory: ${databaseDir}`);
console.log('Press Ctrl+C to stop.');

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);

/** Minimal .env reader so this script has no dependency on dotenv. */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
