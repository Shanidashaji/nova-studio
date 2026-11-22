/**
 * Entry point used when the API runs inside the Next.js app (one Vercel project, ADR-0014).
 * The Nest application is created once per server instance and reused across requests; the
 * returned function is a plain Node request handler (Express).
 */
import './load-env';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './bootstrap';

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

const cache = globalThis as typeof globalThis & { __novaApi?: Promise<NodeHandler> };

async function boot(): Promise<NodeHandler> {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as NodeHandler;
}

/** The shared request handler; boots the API on first use. */
export function getApiHandler(): Promise<NodeHandler> {
  if (!cache.__novaApi) {
    cache.__novaApi = boot().catch((error: unknown) => {
      cache.__novaApi = undefined; // let the next request retry (e.g. the database was unreachable)
      throw error;
    });
  }
  return cache.__novaApi;
}
