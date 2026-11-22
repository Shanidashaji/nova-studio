import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine-readable code. The exception filter renders it into the
 * standard envelope: { error: { code, message, details, requestId } }.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (entity: string) =>
  new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} not found.`);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);

export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);

export const forbidden = (message = 'You do not have permission to do this.') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
