import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// One .env at the repository root serves every package.
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/index.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
