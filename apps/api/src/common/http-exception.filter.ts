import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isDuplicateKeyError, isValidationFailure } from '@nova/db';
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

/** Database errors we translate into HTTP semantics instead of 500s. */
function databaseError(e: unknown): [HttpStatus, string, string] | null {
  if (isDuplicateKeyError(e)) {
    return [HttpStatus.CONFLICT, 'ALREADY_EXISTS', 'A record with these details already exists.'];
  }
  const name = (e as { name?: unknown } | null)?.name;
  if (name === 'RecordNotFoundError') {
    return [HttpStatus.NOT_FOUND, 'NOT_FOUND', 'The requested record does not exist.'];
  }
  if (name === 'ReferenceConflictError') {
    return [
      HttpStatus.CONFLICT,
      'IN_USE',
      'Other records still refer to this one, so it cannot be deleted.',
    ];
  }
  if (name === 'ValidationError' || name === 'CastError' || isValidationFailure(e)) {
    return [HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_INPUT', 'The submitted data is not valid.'];
  }
  return null;
}

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
    } else {
      const mapped = databaseError(exception);
      if (mapped) [status, code, message] = mapped;
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
