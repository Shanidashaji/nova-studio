import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiHandler } from '@nova/api/serverless';

/**
 * Every /api/* request is served by the NestJS API running inside this Next.js app, so the
 * whole product deploys as one Vercel project and the session cookie stays first-party (ADR-0014).
 * Nest parses bodies itself (JSON and multipart uploads) and streams the SSE endpoint.
 */
export const config = {
  api: { bodyParser: false, externalResolver: true, responseLimit: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const api = await getApiHandler();
    api(req, res);
  } catch (error) {
    console.error('NOVA API failed to start:', error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: 'API_UNAVAILABLE',
          message: 'The service is starting or its database is unreachable. Try again shortly.',
        },
      });
    }
  }
}
