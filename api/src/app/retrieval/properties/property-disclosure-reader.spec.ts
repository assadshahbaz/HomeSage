import { ZodError } from 'zod';
import type { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { DISCLOSURE_PHRASES } from '../../ingestion/document/disclosure-phrases.js';
import { PropertyDisclosureReader } from './property-disclosure-reader.js';

const LARKFIELD_RISE = 1207;
const ELLON_FLAT = 1342;

// Every answer unknown and every text empty, as for a questionnaire that said nothing.
function row(propertyId: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      DISCLOSURE_PHRASES.flatMap(({ column }) => [
        [column, 'unknown'],
        [`${column}_detail`, null],
      ]),
    ),
    property_id: propertyId,
    heating_type: null,
    parking_arrangements: null,
    central_heating: 'unknown',
    central_heating_detail: null,
    ...overrides,
  };
}

function build(rows: Record<string, unknown>[]): {
  reader: PropertyDisclosureReader;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue(rows);
  return { reader: new PropertyDisclosureReader({ query } as unknown as MysqlService), query };
}

describe('PropertyDisclosureReader', () => {
  it('binds the ids as one parameter and reads only the document columns', async () => {
    const { reader, query } = build([]);

    await reader.read([String(LARKFIELD_RISE), String(ELLON_FLAT)]);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE property_id IN \(\?\)$/);
    expect(sql).not.toContain(String(LARKFIELD_RISE));
    expect(sql).not.toMatch(/supplier|telephone|length_of_ownership/);
    expect(params).toEqual([[LARKFIELD_RISE, ELLON_FLAT]]);
  });

  it('keys each row by its property id, and has no entry for a property without one', async () => {
    const { reader } = build([
      row(LARKFIELD_RISE, { asbestos: 'yes', asbestos_detail: 'Garage roof' }),
    ]);

    const read = await reader.read([String(LARKFIELD_RISE), String(ELLON_FLAT)]);

    expect(read.get(String(LARKFIELD_RISE))).toMatchObject({
      asbestos: 'yes',
      asbestos_detail: 'Garage roof',
    });
    expect(read.has(String(ELLON_FLAT))).toBe(false);
  });

  it('rejects a row of the wrong shape', async () => {
    const { reader } = build([row(LARKFIELD_RISE, { asbestos: 'maybe' })]);

    await expect(reader.read([String(LARKFIELD_RISE)])).rejects.toBeInstanceOf(ZodError);
  });

  it('asks MySQL nothing for no ids', async () => {
    const { reader, query } = build([]);

    await expect(reader.read([])).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});
