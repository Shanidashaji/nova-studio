import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV, type Env } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Per-request plumbing:
 *  - assigns a request ID (echoed as `x-request-id`) used in logs and error envelopes;
 *  - CSRF defence for cookie-authenticated, state-changing requests: rejects requests whose
 *    `Origin` is not the web app, or that the browser marks as cross-site;
 *  - logs method, path, status and duration.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(@Inject(ENV) env: Env) {
    this.allowedOrigins = new Set(env.WEB_ORIGIN);
  }

  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (req.originalUrl.startsWith('/api/v1/events')) return;
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms [${req.id}]`,
      );
    });

    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.header('origin');
      const site = req.header('sec-fetch-site');
      if ((origin && !this.allowedOrigins.has(origin)) || site === 'cross-site') {
        res.status(403).json({
          error: { code: 'BAD_ORIGIN', message: 'Cross-site request rejected.', requestId: req.id },
        });
        return;
      }
    }
    next();
  }
}
