import path from 'node:path';
import { config } from 'dotenv';

// Loads the repository-root .env. Imported first by main.ts so it runs before other modules.
config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
