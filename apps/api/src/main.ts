import './load-env';
import { createApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main() {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT);
  console.warn(`NOVA API listening on http://localhost:${env.API_PORT}/api/v1`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
