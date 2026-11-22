/**
 * Creates every collection and index NOVA needs (idempotent; replaces `prisma migrate deploy`).
 *
 *   pnpm db:setup            # uses DATABASE_URL from the root .env or the environment
 *
 * Run it once per database and after any schema change that adds an index. The API never
 * builds indexes on boot (autoIndex is off) so a production cold start stays fast.
 */
import path from 'node:path';
import { config } from 'dotenv';
import { connectDatabase } from './database';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function main() {
  const db = await connectDatabase(process.env.DATABASE_URL);
  try {
    await db.syncIndexes();
    console.warn(`Collections and indexes are in place on "${db.connection.name}".`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
