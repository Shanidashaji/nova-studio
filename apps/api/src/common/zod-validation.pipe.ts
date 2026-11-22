import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from './errors';

/**
 * Validates and transforms a request part with a shared Zod schema.
 * Usage: @Body(new ZodValidationPipe(CreateTask)) body: CreateTask
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Some fields are missing or invalid.',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}
