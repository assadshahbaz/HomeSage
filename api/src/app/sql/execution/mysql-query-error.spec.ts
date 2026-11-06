import { mysqlQueryErrorMessage } from './mysql-query-error.js';

describe('mysqlQueryErrorMessage', () => {
  it('reads the message MySQL gave for a statement', () => {
    const error = Object.assign(new Error('x'), {
      errno: 1055,
      sqlMessage: 'Expression #2 of SELECT list is not in GROUP BY clause',
      sqlState: '42000',
    });

    expect(mysqlQueryErrorMessage(error)).toBe(
      'Expression #2 of SELECT list is not in GROUP BY clause',
    );
  });

  it.each([
    [
      'a refused connection',
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    ],
    ['a plain error', new Error('boom')],
    ['a string', 'boom'],
    ['undefined', undefined],
  ])('has nothing to say about %s', (_, error) => {
    expect(mysqlQueryErrorMessage(error)).toBeUndefined();
  });
});
