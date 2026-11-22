/**
 * Private file storage for documents (ADR-0012), kept in MongoDB GridFS (bucket `documentFiles`).
 * Files sit next to the records that reference them, so a serverless deployment (whose disk is
 * temporary) needs no extra storage service. Keys are random; nothing here is served statically.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { GridFSBucket } from 'mongodb';
import type { Database } from './database';

const KEY = /^[a-f0-9]{32}$/;
const BUCKET = 'documentFiles';

export interface StoredObject {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

function bucket(db: Database): GridFSBucket {
  return new GridFSBucket(db.connection.db!, { bucketName: BUCKET });
}

function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error('Invalid storage key.');
}

/** Writes bytes under a new random key and returns the key and SHA-256 digest. */
export async function putObject(
  db: Database,
  bytes: Buffer,
  mimeType?: string,
): Promise<StoredObject> {
  const storageKey = randomBytes(16).toString('hex');
  await new Promise<void>((resolve, reject) => {
    const upload = bucket(db).openUploadStream(storageKey, { metadata: { mimeType } });
    upload.once('error', reject);
    upload.once('finish', () => resolve());
    upload.end(bytes);
  });
  return {
    storageKey,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
}

/** Removes every stored copy under `key` (no error when it is already gone). */
export async function removeObject(db: Database, key: string): Promise<void> {
  assertKey(key);
  const b = bucket(db);
  const files = await b.find({ filename: key }, { projection: { _id: 1 } }).toArray();
  for (const f of files) await b.delete(f._id);
}

/** Opens a stored file for reading, or returns null when no file has this key. */
export async function openObject(db: Database, key: string): Promise<Readable | null> {
  assertKey(key);
  const b = bucket(db);
  const file = await b.find({ filename: key }, { limit: 1 }).next();
  if (!file) return null;
  return b.openDownloadStream(file._id);
}
