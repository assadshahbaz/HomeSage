import type mysql from 'mysql2/promise';
import { MysqlService } from './mysql.service.js';

const SELECT = 'SELECT `p`.`id` FROM `properties` AS `p` WHERE `p`.`id` = ? LIMIT 50';
const ROWS = [{ id: 1 }];

function poolWith(query: ReturnType<typeof vi.fn>): {
  service: MysqlService;
  release: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  const release = vi.fn();
  const destroy = vi.fn();
  const connection = { query, release, destroy };
  const pool = { getConnection: vi.fn().mockResolvedValue(connection) } as unknown as mysql.Pool;
  return { service: new MysqlService(pool), release, destroy };
}

describe('MysqlService.queryWithTimeout', () => {
  it('sets the limit, runs the query with its parameters, then puts the limit back', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ROWS])
      .mockResolvedValueOnce([]);
    const { service, release, destroy } = poolWith(query);

    await expect(service.queryWithTimeout(SELECT, [7], 1500)).resolves.toEqual(ROWS);

    expect(query.mock.calls).toEqual([
      ['SET SESSION max_execution_time = ?', [1500]],
      [SELECT, [7]],
      ['SET SESSION max_execution_time = DEFAULT'],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('puts the limit back and returns the connection when the query fails', async () => {
    const failure = Object.assign(new Error('Query execution was interrupted'), { errno: 3024 });
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce([]);
    const { service, release } = poolWith(query);

    await expect(service.queryWithTimeout(SELECT, [], 1500)).rejects.toBe(failure);

    expect(query).toHaveBeenLastCalledWith('SET SESSION max_execution_time = DEFAULT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('destroys a connection whose limit could not be put back', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ROWS])
      .mockRejectedValueOnce(new Error('connection lost'));
    const { service, release, destroy } = poolWith(query);

    await expect(service.queryWithTimeout(SELECT, [], 1500)).rejects.toThrow('connection lost');

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it('destroys a connection whose limit could not be set, without running the query', async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error('connection lost'));
    const { service, destroy } = poolWith(query);

    await expect(service.queryWithTimeout(SELECT, [], 1500)).rejects.toThrow('connection lost');

    expect(query).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
