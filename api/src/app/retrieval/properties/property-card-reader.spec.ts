import { ZodError } from 'zod';
import type { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { PropertyCardReader } from './property-card-reader.js';

const LARKFIELD_RISE = 1207;
const ELLON_FLAT = 1342;

function row(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    property_kind: 'residential',
    full_address: `${String(id)} Larkfield Rise Eastholm, Aberdeen, AB21 9CK`,
    price: 229_000,
    bedrooms: 3,
    bathrooms: 2,
    public_rooms: 1,
    area_m2: 97,
    town: 'Aberdeen',
    postcode_district: 'AB21',
    council_tax_band: 'E',
    heating_type: 'gas',
    has_garden: 1,
    has_garage: 1,
    has_double_garage: 0,
    has_off_street_parking: 1,
    has_land: 0,
    has_ground_floor_bedroom_bathroom: 0,
    has_granny_flat: 0,
    has_green_energy: 0,
    has_electric_vehicle_charge_point: 0,
    is_new_build: 0,
    ...overrides,
  };
}

function build(rows: Record<string, unknown>[]): {
  reader: PropertyCardReader;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue(rows);
  return { reader: new PropertyCardReader({ query } as unknown as MysqlService), query };
}

describe('PropertyCardReader', () => {
  it('binds the ids as one parameter rather than writing them into the SQL', async () => {
    const { reader, query } = build([row(LARKFIELD_RISE)]);

    await reader.read([String(LARKFIELD_RISE)]);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE p.id IN (?)');
    expect(sql).not.toContain(String(LARKFIELD_RISE));
    expect(params).toEqual([[LARKFIELD_RISE]]);
  });

  it('reads a row as the card contract, flags as booleans, with its kind beside it', async () => {
    const { reader } = build([row(LARKFIELD_RISE)]);

    await expect(reader.read([String(LARKFIELD_RISE)])).resolves.toEqual([
      {
        kind: 'residential',
        card: {
          id: String(LARKFIELD_RISE),
          address: '1207 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
          price: 229_000,
          bedrooms: 3,
          bathrooms: 2,
          publicRooms: 1,
          areaM2: 97,
          town: 'Aberdeen',
          postcodeDistrict: 'AB21',
          councilTaxBand: 'E',
          heatingType: 'gas',
          hasGarden: true,
          hasGarage: true,
          hasDoubleGarage: false,
          hasOffStreetParking: true,
          hasLand: false,
          hasGroundFloorBedroomBathroom: false,
          hasGrannyFlat: false,
          hasGreenEnergy: false,
          hasElectricVehicleChargePoint: false,
          isNewBuild: false,
        },
      },
    ]);
  });

  it('returns the cards in the order asked for, whatever order MySQL used', async () => {
    const { reader } = build([row(LARKFIELD_RISE), row(ELLON_FLAT)]);

    const cards = await reader.read([String(ELLON_FLAT), String(LARKFIELD_RISE)]);

    expect(cards.map(({ card }) => card.id)).toEqual([String(ELLON_FLAT), String(LARKFIELD_RISE)]);
  });

  it('leaves out an id with no row', async () => {
    const { reader } = build([row(LARKFIELD_RISE)]);

    const cards = await reader.read([String(ELLON_FLAT), String(LARKFIELD_RISE)]);

    expect(cards.map(({ card }) => card.id)).toEqual([String(LARKFIELD_RISE)]);
  });

  it('reads a property with no questionnaire, whose heating type is null', async () => {
    const { reader } = build([row(LARKFIELD_RISE, { heating_type: null })]);

    const [read] = await reader.read([String(LARKFIELD_RISE)]);

    expect(read.card.heatingType).toBeNull();
  });

  it('reads a plot as its kind', async () => {
    const { reader } = build([row(LARKFIELD_RISE, { property_kind: 'plot' })]);

    const [read] = await reader.read([String(LARKFIELD_RISE)]);

    expect(read.kind).toBe('plot');
  });

  it('rejects a row of the wrong shape', async () => {
    const { reader } = build([row(LARKFIELD_RISE, { council_tax_band: 'Z' })]);

    await expect(reader.read([String(LARKFIELD_RISE)])).rejects.toBeInstanceOf(ZodError);
  });

  it('asks MySQL nothing for no ids', async () => {
    const { reader, query } = build([]);

    await expect(reader.read([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
