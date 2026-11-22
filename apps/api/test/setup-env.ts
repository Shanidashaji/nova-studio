import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.WEB_ORIGIN = 'http://localhost:3100';
