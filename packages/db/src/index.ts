import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

/**
 * Creates a Prisma client over the node-postgres driver adapter (required by Prisma 7).
 * The caller owns the client's lifecycle and must call `$disconnect()`.
 */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export { hashPassword, verifyPassword } from './password';
export { putObject, removeObject, resolveStorageDir, storagePath, type StoredObject } from './storage';
