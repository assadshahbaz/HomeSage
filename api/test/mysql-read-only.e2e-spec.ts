import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { RowDataPacket } from 'mysql2/promise';
import { AppModule } from '../src/app.module.ts';
import { MysqlService } from '../src/infra/mysql/mysql.service.ts';

/**
 * Proves the account the API connects with cannot change anything. These run
 * against the MySQL container from docker-compose.yml, so the data must be
 * seeded first (`npm run db:seed`).
 */
describe('MySQL read only account', () => {
  let app: TestingModule;
  let mysql: MysqlService;

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    mysql = app.get(MysqlService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reads property data', async () => {
    const rows = await mysql.query<RowDataPacket>(
      'SELECT id, full_address FROM properties WHERE id = ?',
      [1],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['full_address']).toEqual(expect.any(String));
  });

  it('connects as the read only user, never as root', async () => {
    const rows = await mysql.query<RowDataPacket>('SELECT CURRENT_USER() AS who');

    expect(rows[0]?.['who']).toMatch(/^rag_ro@/);
  });

  it.each([
    [
      'INSERT',
      'INSERT INTO properties (id, full_address, price, property_kind) VALUES (999999, ?, 1, ?)',
      ['x', 'residential'],
    ],
    ['UPDATE', 'UPDATE properties SET price = price + 1 WHERE id = ?', [1]],
    ['DELETE', 'DELETE FROM properties WHERE id = ?', [1]],
  ])('refuses %s', async (_label, sql, params) => {
    await expect(mysql.query(sql, params as unknown[])).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    });
  });

  it.each([
    ['DROP TABLE', 'DROP TABLE properties'],
    ['CREATE TABLE', 'CREATE TABLE scratch (id INT)'],
    ['TRUNCATE', 'TRUNCATE TABLE properties'],
    ['GRANT', "GRANT ALL ON homesage.* TO 'rag_ro'@'%'"],
  ])('refuses %s', async (_label, sql) => {
    await expect(mysql.query(sql)).rejects.toMatchObject({
      code: expect.stringMatching(/DENIED/),
    });
  });

  it('cannot reach other databases on the server', async () => {
    await expect(mysql.query('SELECT COUNT(*) AS count FROM mysql.user')).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    });
  });
});
