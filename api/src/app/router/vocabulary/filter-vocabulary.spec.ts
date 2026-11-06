import type { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { FilterVocabulary } from './filter-vocabulary.js';

const TOWNS = [{ value: 'Aberdeen' }, { value: 'Ellon' }];
const DISTRICTS = [{ value: 'AB10' }, { value: 'AB41' }];

type Query = (sql: string) => Promise<unknown[]>;

function vocabularyOver(query: ReturnType<typeof vi.fn<Query>>): FilterVocabulary {
  return new FilterVocabulary({ query } as unknown as MysqlService);
}

function answering(): ReturnType<typeof vi.fn<Query>> {
  return vi.fn<Query>((sql) => Promise.resolve(sql.includes('town AS') ? TOWNS : DISTRICTS));
}

describe('FilterVocabulary', () => {
  it('reads the distinct towns and districts, leaving out nulls', async () => {
    const query = answering();

    await expect(vocabularyOver(query).values()).resolves.toEqual({
      towns: ['Aberdeen', 'Ellon'],
      postcodeDistricts: ['AB10', 'AB41'],
    });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringMatching(
        /^SELECT DISTINCT town AS value FROM properties WHERE town IS NOT NULL/,
      ),
      expect.stringMatching(
        /^SELECT DISTINCT postcode_district AS value FROM properties WHERE postcode_district IS NOT NULL/,
      ),
    ]);
  });

  it('reads MySQL once however often it is asked', async () => {
    const query = answering();
    const vocabulary = vocabularyOver(query);

    await Promise.all([vocabulary.values(), vocabulary.values()]);
    await vocabulary.values();

    expect(query).toHaveBeenCalledTimes(2);
  });

  it('tries again after a failed read instead of keeping the failure', async () => {
    const query = answering();
    query.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const vocabulary = vocabularyOver(query);

    await expect(vocabulary.values()).rejects.toThrow('ECONNREFUSED');
    await expect(vocabulary.values()).resolves.toMatchObject({ towns: ['Aberdeen', 'Ellon'] });
  });
});
