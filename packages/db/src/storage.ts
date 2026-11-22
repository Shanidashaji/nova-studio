/**
 * Private file storage for documents (ADR-0012). Files live outside the repository and the web
 * root, under random keys; nothing here is ever served statically.
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEY = /^[a-f0-9]{32}$/;

export function resolveStorageDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NOVA_STORAGE_DIR) return path.resolve(env.NOVA_STORAGE_DIR);
  const root =
    process.platform === 'win32'
      ? path.join(env.LOCALAPPDATA ?? os.homedir(), 'nova')
      : path.join(os.homedir(), '.local', 'share', 'nova');
  return path.join(root, env.NODE_ENV === 'test' ? 'storage-test' : 'storage');
}

/** Absolute path for a storage key. Throws for anything that is not a generated key. */
export function storagePath(dir: string, key: string): string {
  if (!KEY.test(key)) throw new Error('Invalid storage key.');
  return path.join(dir, key.slice(0, 2), key);
}

export interface StoredObject {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

/** Writes bytes under a new random key and returns the key and SHA-256 digest. */
export async function putObject(dir: string, bytes: Buffer): Promise<StoredObject> {
  const storageKey = randomBytes(16).toString('hex');
  const file = storagePath(dir, storageKey);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  // `wx` refuses to overwrite: a key collision fails loudly instead of replacing a file.
  await fs.promises.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  return {
    storageKey,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
}

export async function removeObject(dir: string, key: string): Promise<void> {
  await fs.promises.rm(storagePath(dir, key), { force: true });
}
