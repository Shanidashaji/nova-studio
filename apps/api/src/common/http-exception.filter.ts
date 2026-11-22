import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from './errors';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/** Prisma error codes we translate into HTTP semantics instead of 500s. */
const PRISMA_CODES: Record<string, [HttpStatus, string, string]> = {
  P2025: [HttpStatus.NOT_FOUND, 'NOT_FOUND', 'The requested record does not exist.'],
  P2002: [HttpStatus.CONFLICT, 'ALREADY_EXISTS', 'A record with these details already exists.'],
  P2003: [
    HttpStatus.UNPROCESSABLE_ENTITY,
    'INVALID_REFERENCE',
    'A referenced record does not exist.',
  ],
};

/** Renders every error as { error: { code, message, details?, requestId } }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const requestId = req.id;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Something went wrong. The error has been logged.';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? 'HTTP_ERROR';
      const body = exception.getResponse();
      message =
        typeof body === 'object' && body !== null && 'message' in body
          ? String(body.message)
          : exception.message;
    } else if (isPrismaKnownError(exception) && PRISMA_CODES[exception.code]) {
      [status, code, message] = PRISMA_CODES[exception.code]!;
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} failed [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({ error: { code, message, details, requestId } });
  }
}

function isPrismaKnownError(e: unknown): e is { code: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: string }).name === 'PrismaClientKnownRequestError' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}
