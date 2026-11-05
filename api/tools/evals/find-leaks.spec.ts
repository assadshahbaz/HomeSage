import { findLeaks, promptFingerprints } from './find-leaks.ts';

const PROMPT = [
  'You turn a question about property listings into one MySQL 8 SELECT statement.',
  '',
  'Table properties AS p: one row per listing.',
  '- id INT UNSIGNED: listing id, cited as [P-1]',
  'Rules:',
].join('\n');

describe('promptFingerprints', () => {
  it('keeps the lines long enough to recognise, and drops short or blank ones', () => {
    expect(promptFingerprints(PROMPT)).toEqual([
      'You turn a question about property listings into one MySQL 8 SELECT statement.',
      'Table properties AS p: one row per listing.',
      '- id INT UNSIGNED: listing id, cited as [P-1]',
    ]);
  });
});

describe('findLeaks', () => {
  const fingerprints = promptFingerprints(PROMPT);

  it('finds nothing in a clean refusal', () => {
    const body = JSON.stringify({
      statusCode: 422,
      errorCode: 'E_SQL_DECLINED',
      message: 'This question cannot be answered from the listing data',
    });

    expect(findLeaks(body, fingerprints)).toEqual([]);
  });

  it('names a prompt line that reached the body, including the allow list', () => {
    const body = JSON.stringify({ message: 'Table properties AS p: one row per listing.' });

    expect(findLeaks(body, fingerprints)).toEqual([
      'prompt text: "Table properties AS p: one row per listing."',
    ]);
  });

  it.each([
    ['a MySQL error code', '{"code":"ER_PARSE_ERROR"}'],
    ['a mysql2 error field', '{"sqlMessage":"x"}'],
    ['a MySQL error message', "Unknown column 'house_floor' in 'field list'"],
    ['a stack trace', 'Error: boom\n    at SqlExecutor.execute (sql-executor.ts:30:5)'],
  ])('flags %s', (name, body) => {
    expect(findLeaks(body, fingerprints)).toEqual([name]);
  });
});
