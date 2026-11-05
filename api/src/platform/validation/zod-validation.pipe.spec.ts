import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(
  z.object({
    question: z.string().trim().min(1),
    filters: z.object({ town: z.string() }).optional(),
  }),
);

function issuesFor(value: unknown): unknown {
  try {
    pipe.transform(value);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  }
  throw new Error('expected the pipe to throw');
}

describe('ZodValidationPipe', () => {
  it('returns the parsed value, with the schema applied', () => {
    expect(pipe.transform({ question: '  flats  ', extra: 1 })).toEqual({ question: 'flats' });
  });

  it('refuses a body that does not parse with one 400 naming each field', () => {
    expect(issuesFor({ question: '', filters: { town: 7 } })).toEqual({
      message: 'Request validation failed',
      issues: [
        { path: 'question', message: expect.any(String) as string },
        { path: 'filters.town', message: expect.any(String) as string },
      ],
    });
  });

  it.each([
    ['a missing body', undefined],
    ['a string body', 'flats'],
    ['an array body', []],
  ])('refuses %s', (_, value) => {
    expect(issuesFor(value)).toMatchObject({ message: 'Request validation failed' });
  });
});
