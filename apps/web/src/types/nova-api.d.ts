// Type surface of the compiled API entry (apps/api/src/serverless.ts). Declared here so the web
// type-check does not have to compile NestJS sources; keep in sync with that file.
declare module '@nova/api/serverless' {
  import type { IncomingMessage, ServerResponse } from 'node:http';

  export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;
  export function getApiHandler(): Promise<NodeHandler>;
}
