import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Parses a request value with a contract schema. The handler receives the
 * parsed, typed value and writes no checks of its own; anything that does not
 * parse becomes one 400 listing every field at fault.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  public constructor(private readonly schema: z.ZodType<T>) {}

  public transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Request validation failed',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
