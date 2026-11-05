import type { ConfigService } from '@nestjs/config';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import type { EmbeddedTexts, EmbeddingService } from '../embeddings/embedding.service.js';
import type { DisclosureRow, PropertyRow } from './document/property-row.js';
import { INGESTION_MODE } from './ingestion-mode.js';
import type { IngestionMode, IngestionOptions } from './ingestion-mode.js';
import { IngestionService } from './ingestion.service.js';
import type { DeadLetter, IngestionRunState } from './run-state/ingestion-run-state.js';
import type {
  IndexedProperty,
  PropertyIndex,
  UpsertFailure,
} from './search-index/property-index.js';
import type { PropertyPage, PropertyReader } from './source/property-reader.js';

const PAGE_SIZE = 2;
const FIRST_ID = 1234;

function property(id: number): PropertyRow {
  return {
    id,
    full_address: `${String(id)} Thornbury Street, Aberdeen, AB11 6CK`,
    post_code: 'AB11 6CK',
    postcode_district: 'AB11',
    town: 'Aberdeen',
    price: 150000,
    area_m2: 70,
    council_tax_band: 'C',
    bedrooms: 2,
    bathrooms: 1,
    public_rooms: 1,
    property_kind: 'residential',
    has_garage: false,
    has_double_garage: false,
    has_garden: true,
    has_land: false,
    has_central_heating: false,
    is_parking_available: false,
    has_on_street_parking: false,
    has_off_street_parking: false,
    has_ground_floor_bedroom_bathroom: false,
    has_granny_flat: false,
    has_green_energy: false,
    has_electric_vehicle_charge_point: false,
    is_self_contained: false,
    is_new_build: false,
    is_development: false,
    is_development_opportunity: false,
    updated_at: new Date('2026-09-20T09:15:00.000Z'),
  };
}

function page(ids: number[], unreadable: PropertyPage['unreadable'] = []): PropertyPage {
  const all = [...ids, ...unreadable.map((row) => Number(row.id))];
  return {
    properties: ids.map((id) => ({
      property: property(id),
      disclosure: null as DisclosureRow | null,
    })),
    unreadable,
    lastId: all.length === 0 ? null : Math.max(...all),
  };
}

const END: PropertyPage = { properties: [], unreadable: [], lastId: null };
// The database clock as the reader reports it, the bound for the next sync.
const DB_NOW = new Date('2026-09-27T11:23:42.000Z');
const FULL: IngestionOptions = { mode: INGESTION_MODE.FULL, restart: false };

interface Harness {
  service: IngestionService;
  readPage: ReturnType<typeof vi.fn>;
  embedDocuments: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  state: {
    checkpoint: ReturnType<typeof vi.fn>;
    saveCheckpoint: ReturnType<typeof vi.fn>;
    clearCheckpoint: ReturnType<typeof vi.fn>;
    recordDeadLetters: ReturnType<typeof vi.fn>;
    deadLetters: ReturnType<typeof vi.fn>;
    clearDeadLetters: ReturnType<typeof vi.fn>;
    fullRunBound: ReturnType<typeof vi.fn>;
    saveFullRunBound: ReturnType<typeof vi.fn>;
  };
  ensure: ReturnType<typeof vi.fn>;
  now: ReturnType<typeof vi.fn>;
}

function embedding(texts: readonly string[]): Promise<EmbeddedTexts> {
  return Promise.resolve({
    vectors: texts.map(() => [0.1, 0.2]),
    usage: { calls: 1, inputTokens: texts.length * 100, costUsd: texts.length * 0.00002 },
  });
}

function build(options: {
  pages: PropertyPage[];
  checkpoint?: number | null;
  embed?: (texts: readonly string[]) => Promise<EmbeddedTexts>;
  upsert?: (documents: readonly IndexedProperty[]) => Promise<UpsertFailure[]>;
  deadLetters?: DeadLetter[];
  fullRunBound?: Date | null;
}): Harness {
  const readPage = vi.fn();
  for (const next of [...options.pages, END]) {
    readPage.mockResolvedValueOnce(next);
  }
  const embedDocuments = vi.fn(options.embed ?? embedding);
  const upsert = vi.fn(options.upsert ?? (() => Promise.resolve([])));
  const ensure = vi.fn().mockResolvedValue('matched');
  const recorded: DeadLetter[] = [];
  const state = {
    checkpoint: vi.fn().mockResolvedValue(options.checkpoint ?? null),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
    clearCheckpoint: vi.fn().mockResolvedValue(undefined),
    recordDeadLetters: vi.fn((_mode: IngestionMode, letters: DeadLetter[]) => {
      recorded.push(...letters);
      return Promise.resolve();
    }),
    deadLetters: vi.fn(() => Promise.resolve([...(options.deadLetters ?? []), ...recorded])),
    clearDeadLetters: vi.fn().mockResolvedValue(undefined),
    fullRunBound: vi.fn().mockResolvedValue(options.fullRunBound ?? null),
    saveFullRunBound: vi.fn().mockResolvedValue(undefined),
  };
  const now = vi.fn().mockResolvedValue(DB_NOW);
  const index = {
    ensure,
    upsert,
    refresh: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(3),
  } as unknown as PropertyIndex;
  const config = { getOrThrow: () => ({ batchSize: PAGE_SIZE }) } as unknown as ConfigService;
  const logger = { log: vi.fn() } as unknown as AppLogger;
  const service = new IngestionService(
    { readPage, now } as unknown as PropertyReader,
    { embedDocuments } as unknown as EmbeddingService,
    index,
    state as unknown as IngestionRunState,
    logger,
    config,
  );
  return { service, readPage, embedDocuments, upsert, state, ensure, now };
}

describe('IngestionService run', () => {
  it('reads page by page from the start, embeds each page once and writes it under its ids', async () => {
    const { service, readPage, embedDocuments, upsert, ensure } = build({
      pages: [page([FIRST_ID, 1235]), page([1236])],
    });

    const summary = await service.run(FULL);

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(readPage.mock.calls).toEqual([
      [0, PAGE_SIZE, null],
      [1235, PAGE_SIZE, null],
      [1236, PAGE_SIZE, null],
    ]);
    expect(embedDocuments).toHaveBeenCalledTimes(2);
    const written = upsert.mock.calls[0]?.[0] as IndexedProperty[];
    expect(written.map((document) => document.id)).toEqual(['1234', '1235']);
    expect(written[0]?.embedding).toEqual([0.1, 0.2]);
    expect(written[0]?.text).toMatch(/^2 bedroom, 1 bathroom property/);
    expect(summary).toMatchObject({
      resumedAfterId: null,
      read: 3,
      written: 3,
      failed: 0,
      indexed: 3,
      embedding: { calls: 2, inputTokens: 300, costUsd: 0.00006 },
      deadLetters: [],
    });
  });

  it('checkpoints each page after it is written, and clears the checkpoint when finished', async () => {
    const { service, state } = build({ pages: [page([FIRST_ID, 1235]), page([1236])] });

    await service.run(FULL);

    expect(state.saveCheckpoint.mock.calls).toEqual([[1235], [1236]]);
    expect(state.clearCheckpoint).toHaveBeenCalledTimes(1);
    expect(state.saveCheckpoint.mock.invocationCallOrder[1]).toBeLessThan(
      state.clearCheckpoint.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('continues after the checkpoint of a stopped run, keeping its dead letters', async () => {
    const earlier: DeadLetter = { id: '1200', stage: 'embed', reason: 'rate limited' };
    const { service, readPage, state } = build({
      pages: [page([1236])],
      checkpoint: 1235,
      deadLetters: [earlier],
    });

    const summary = await service.run(FULL);

    expect(readPage.mock.calls[0]).toEqual([1235, PAGE_SIZE, null]);
    expect(state.clearDeadLetters).not.toHaveBeenCalled();
    expect(summary.resumedAfterId).toBe(1235);
    expect(summary.deadLetters).toEqual([earlier]);
  });

  it('starts from the first property with --restart, whatever the checkpoint said', async () => {
    const { service, readPage, state } = build({ pages: [page([FIRST_ID])] });
    // The checkpoint read after clearing it finds nothing.
    state.checkpoint.mockResolvedValue(null);

    await service.run({ mode: INGESTION_MODE.FULL, restart: true });

    expect(state.clearCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      state.checkpoint.mock.invocationCallOrder[0] ?? 0,
    );
    expect(state.clearDeadLetters).toHaveBeenCalledTimes(1);
    expect(readPage.mock.calls[0]).toEqual([0, PAGE_SIZE, null]);
  });
});

describe('IngestionService dead letters', () => {
  it('records a row that could not be read and indexes the rest of its page', async () => {
    const { service, upsert } = build({
      pages: [page([FIRST_ID], [{ id: '1235', reason: 'price: expected number' }])],
    });

    const summary = await service.run(FULL);

    expect((upsert.mock.calls[0]?.[0] as IndexedProperty[]).map((document) => document.id)).toEqual(
      ['1234'],
    );
    expect(summary).toMatchObject({ read: 2, written: 1, failed: 1 });
    expect(summary.deadLetters).toEqual([
      { id: '1235', stage: 'read', reason: 'price: expected number' },
    ]);
  });

  it('records a page whose embedding failed and carries on with the next page', async () => {
    const embed = vi
      .fn<(texts: readonly string[]) => Promise<EmbeddedTexts>>()
      .mockRejectedValueOnce(new Error('429 Resource exhausted'))
      .mockImplementation(embedding);
    const { service, upsert, state } = build({
      pages: [page([FIRST_ID, 1235]), page([1236])],
      embed,
    });

    const summary = await service.run(FULL);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(state.saveCheckpoint.mock.calls).toEqual([[1235], [1236]]);
    expect(summary).toMatchObject({ read: 3, written: 1, failed: 2 });
    expect(summary.deadLetters).toEqual([
      { id: '1234', stage: 'embed', reason: '429 Resource exhausted' },
      { id: '1235', stage: 'embed', reason: '429 Resource exhausted' },
    ]);
    expect(summary.embedding.calls).toBe(1);
  });

  it('records the documents Elasticsearch refused one by one', async () => {
    const { service } = build({
      pages: [page([FIRST_ID, 1235])],
      upsert: () => Promise.resolve([{ id: '1235', reason: 'mapper_parsing_exception: bad date' }]),
    });

    const summary = await service.run(FULL);

    expect(summary).toMatchObject({ written: 1, failed: 1 });
    expect(summary.deadLetters).toEqual([
      { id: '1235', stage: 'index', reason: 'mapper_parsing_exception: bad date' },
    ]);
  });

  it('stops when the index cannot be written at all, keeping the checkpoint of the last good page', async () => {
    const upsert = vi
      .fn<(documents: readonly IndexedProperty[]) => Promise<UpsertFailure[]>>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9200'));
    const { service, state } = build({ pages: [page([FIRST_ID, 1235]), page([1236])], upsert });

    await expect(service.run(FULL)).rejects.toThrow('ECONNREFUSED');
    expect(state.saveCheckpoint.mock.calls).toEqual([[1235]]);
    expect(state.clearCheckpoint).not.toHaveBeenCalled();
  });

  it('stops before reading anything when the index does not match the mapping', async () => {
    const { service, readPage, ensure } = build({ pages: [page([FIRST_ID])] });
    ensure.mockRejectedValue(new Error('does not match the property mapping'));

    await expect(service.run(FULL)).rejects.toThrow('does not match');
    expect(readPage).not.toHaveBeenCalled();
  });
});

describe('IngestionService bound for the next sync', () => {
  it('takes the database time before the first read, keeps it, and reports it', async () => {
    const { service, now, readPage, state } = build({ pages: [page([FIRST_ID])] });

    const summary = await service.run(FULL);

    expect(now.mock.invocationCallOrder[0]).toBeLessThan(readPage.mock.invocationCallOrder[0] ?? 0);
    expect(state.saveFullRunBound).toHaveBeenCalledWith(DB_NOW);
    expect(summary.nextSince).toEqual(DB_NOW);
  });

  it('reports the bound the stopped run recorded when resuming, not the time it resumed', async () => {
    const recorded = new Date('2026-09-27T09:00:00.000Z');
    const { service, now, state } = build({
      pages: [page([1236])],
      checkpoint: 1235,
      fullRunBound: recorded,
    });

    const summary = await service.run(FULL);

    expect(now).not.toHaveBeenCalled();
    expect(state.saveFullRunBound).not.toHaveBeenCalled();
    expect(summary.nextSince).toEqual(recorded);
  });

  it('reports no bound when the resumed run recorded none, rather than a wrong one', async () => {
    const { service } = build({ pages: [page([1236])], checkpoint: 1235, fullRunBound: null });

    await expect(service.run(FULL)).resolves.toMatchObject({ nextSince: null });
  });
});

describe('IngestionService since', () => {
  const SINCE = new Date('2026-09-27T10:00:00.000Z');
  const SYNC: IngestionOptions = { mode: INGESTION_MODE.SINCE, since: SINCE };

  it('reads only changed properties, passing the bound to every page', async () => {
    const { service, readPage, upsert } = build({ pages: [page([FIRST_ID, 1235]), page([1236])] });

    const summary = await service.run(SYNC);

    expect(readPage.mock.calls).toEqual([
      [0, PAGE_SIZE, SINCE],
      [1235, PAGE_SIZE, SINCE],
      [1236, PAGE_SIZE, SINCE],
    ]);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      mode: INGESTION_MODE.SINCE,
      since: SINCE,
      resumedAfterId: null,
      nextSince: DB_NOW,
      read: 3,
      written: 3,
    });
  });

  it("leaves a full run's checkpoint alone, so a stopped full run can still resume", async () => {
    const { service, state } = build({ pages: [page([FIRST_ID])], checkpoint: 1235 });

    await service.run(SYNC);

    expect(state.checkpoint).not.toHaveBeenCalled();
    expect(state.saveCheckpoint).not.toHaveBeenCalled();
    expect(state.clearCheckpoint).not.toHaveBeenCalled();
    expect(state.saveFullRunBound).not.toHaveBeenCalled();
  });

  it('keeps its own dead letters, cleared when it starts', async () => {
    const { service, state } = build({
      pages: [page([FIRST_ID], [{ id: '1235', reason: 'price: expected number' }])],
    });

    await service.run(SYNC);

    expect(state.clearDeadLetters.mock.calls).toEqual([[INGESTION_MODE.SINCE]]);
    expect(state.recordDeadLetters.mock.calls[0]?.[0]).toBe(INGESTION_MODE.SINCE);
    expect(state.deadLetters.mock.calls).toEqual([[INGESTION_MODE.SINCE]]);
  });

  it('embeds and writes nothing when nothing changed', async () => {
    const { service, embedDocuments, upsert } = build({ pages: [] });

    const summary = await service.run(SYNC);

    expect(embedDocuments).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      read: 0,
      written: 0,
      failed: 0,
      embedding: { calls: 0, inputTokens: 0, costUsd: 0 },
    });
  });
});
