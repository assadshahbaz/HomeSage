import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/platform/clock/clock.js';
import { fakeHomesage, fakeWebhook } from './fake-servers.js';
import type { Received, RunningServer } from './fake-servers.js';

const SECRET = 'test-webhook-secret-abcdefghij';
const ADMIN = 'test-admin-token-0123456789abc';
const CALL = { id: '5f0c3c5e-7a65-4c38-9a1e-2f7e1b0c9d11', customer: { number: '+441632960000' } };
// Sunday 11 October 2026, 10am in London.
const NOW = new Date('2026-10-11T09:00:00Z');

let app: INestApplication;
let homesage: RunningServer;
let notifyHook: RunningServer;
const homesageRequests: Received[] = [];
const notices: Received[] = [];

beforeAll(async () => {
  homesage = await fakeHomesage(homesageRequests);
  notifyHook = await fakeWebhook(notices);
  Object.assign(process.env, {
    HOMESAGE_URL: homesage.url,
    VOICE_WEBHOOK_SECRET: SECRET,
    ADMIN_TOKEN: ADMIN,
    DB_PATH: ':memory:',
    NOTIFY_WEBHOOK_URL: `${notifyHook.url}/hook`,
    VIEWING_START: '10:00',
    VIEWING_END: '12:00',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue({ now: () => NOW })
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
  await homesage.close();
  await notifyHook.close();
});

interface ToolResult {
  toolCallId: string;
  name: string;
  result?: string;
  error?: string;
}

async function callTool(
  name: string,
  args: unknown,
  call: { id: string; customer: { number: string } | null } = CALL,
): Promise<ToolResult> {
  const response = await request(app.getHttpServer())
    .post('/vapi/webhook')
    .set('X-Vapi-Secret', SECRET)
    .send({
      message: {
        type: 'tool-calls',
        call,
        toolCallList: [{ id: `tc-${name}`, type: 'function', function: { name, arguments: args } }],
      },
    })
    .expect(200);
  const { results } = response.body as { results: ToolResult[] };
  expect(results).toHaveLength(1);
  return results[0];
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !check(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('the Vapi webhook', () => {
  it('refuses a request without the secret, and accepts it as a bearer token', async () => {
    const body = { message: { type: 'status-update', call: CALL } };
    await request(app.getHttpServer()).post('/vapi/webhook').send(body).expect(403);
    await request(app.getHttpServer())
      .post('/vapi/webhook')
      .set('X-Vapi-Secret', 'wrong-secret-0123456789012345')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/vapi/webhook')
      .set('Authorization', `Bearer ${SECRET}`)
      .send(body)
      .expect(200, {});
  });

  it('answers a property question from HomeSage, without citation markers', async () => {
    const outcome = await callTool('search_properties', {
      question: '3 bed homes in Aberdeen with a garden under £300k',
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toContain(
      '20 Larkfield Rise Eastholm is a 3 bedroom home at £245,000 with a garden.',
    );
    expect(outcome.result).not.toMatch(/\[P-\d+\]/);
    expect(outcome.result).toContain(
      'ref 1207: 20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK, £245,000, 3 bedrooms; ref 88: 4 Tolland Street, Inverurie, AB51 3CK, £199,950, 1 bedroom',
    );
    // Retrieved but never cited, so the agent was never told about it.
    expect(outcome.result).not.toContain('ref 5');
    expect(outcome.result).not.toContain('\n');

    const sent = homesageRequests.at(-1)!;
    expect(sent.path).toBe('/chat');
    expect(sent.body).toEqual({
      question: '3 bed homes in Aberdeen with a garden under £300k',
      sessionId: CALL.id,
    });
    expect(sent.headers['x-request-id']).toBe('vapi-5f0c3c5e7a654c389a1e2f7e');
  });

  it('tells the agent to change the search when nothing matches', async () => {
    const outcome = await callTool('search_properties', { question: 'castles in AB10' });
    expect(outcome.result).toContain('No listing in the data matches that.');
    expect(outcome.result).toContain('change the area, budget or size');
  });

  it('turns every HomeSage failure into a line the agent can say', async () => {
    for (const question of ['busy now', 'broken one', 'cut short']) {
      const outcome = await callTool('search_properties', { question });
      expect(outcome.error).toBeUndefined();
      expect(outcome.result).toContain('not available right now');
    }
  });

  it('offers viewing times, two a day, starting tomorrow', async () => {
    const outcome = await callTool('get_viewing_slots', { propertyRef: '1207' });
    expect(outcome.result).toContain('Today is Sunday 11 October 2026.');
    expect(outcome.result).toContain(
      'slot 2026-10-12T10:00 (Monday 12 October at 10am); slot 2026-10-12T10:30 (Monday 12 October at 10:30am); slot 2026-10-13T10:00 (Tuesday 13 October at 10am); slot 2026-10-13T10:30',
    );
  });

  it('offers times on the day asked for, or the next ones when that day is closed', async () => {
    const tuesday = await callTool('get_viewing_slots', {
      propertyRef: '1207',
      date: '2026-10-13',
    });
    expect(tuesday.result).toContain('on Tuesday 13 October 2026: slot 2026-10-13T10:00');
    const sunday = await callTool('get_viewing_slots', { propertyRef: '1207', date: '2026-10-18' });
    expect(sunday.result).toContain('no free viewing times on Sunday 18 October 2026');
    expect(sunday.result).toContain('slot 2026-10-12T10:00');
  });

  it('will not offer or book a home that never came up in the call', async () => {
    const slots = await callTool('get_viewing_slots', { propertyRef: '5' });
    expect(slots.result).toMatch(/^Not done: ref 5 has not come up in this call/);
    const otherCall = { id: 'another-call', customer: { number: '+441632960111' } };
    const booking = await callTool(
      'book_viewing',
      { propertyRef: '1207', slot: '2026-10-12T10:00', callerName: 'Sam Reid' },
      otherCall,
    );
    expect(booking.result).toMatch(/^Not done: ref 1207 has not come up/);
  });

  it('books a viewing, tells the office, and will not double book the slot', async () => {
    const booked = await callTool('book_viewing', {
      propertyRef: '1207',
      slot: '2026-10-12T10:30',
      callerName: 'Aileen Duncan',
      notes: 'Has a mortgage in principle',
    });
    expect(booked.result).toBe(
      'Booked: a viewing of 20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK on Monday 12 October at 10:30am for Aileen Duncan, contact number +441632960000. Confirm the day, time and address back to the caller, and say a member of the team will be in touch beforehand to confirm.',
    );

    await until(() => notices.length > 0);
    expect(notices[0]?.body).toMatchObject({
      kind: 'viewing_booked',
      text: 'New viewing: Aileen Duncan (+441632960000) for 20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK on Monday 12 October at 10:30am.',
      details: { propertyRef: '1207', slot: '2026-10-12T10:30' },
    });

    const again = await callTool('book_viewing', {
      propertyRef: '1207',
      slot: '2026-10-12T10:30',
      callerName: 'Someone Else',
    });
    expect(again.result).toMatch(/^Not done: that time has just been taken/);

    const slots = await callTool('get_viewing_slots', { propertyRef: '1207' });
    expect(slots.result).not.toContain('2026-10-12T10:30');
  });

  it('refuses a slot the diary does not offer', async () => {
    const outcome = await callTool('book_viewing', {
      propertyRef: '88',
      slot: '2026-10-11T10:00',
      callerName: 'Aileen Duncan',
    });
    expect(outcome.result).toMatch(/^Not done: 2026-10-11T10:00 is not a time we can book/);
  });

  it('asks for a number when there is no caller ID, then logs the valuation request', async () => {
    const webCall = { id: 'web-test-call', customer: null };
    const args = {
      callerName: 'Graham Reid',
      propertyAddress: '12 Rubislaw Den South, Aberdeen',
      postcode: 'AB15 4CK',
      timeframe: 'within_3_months',
      isAlsoBuying: true,
    };
    const missing = await callTool('request_valuation', args, webCall);
    expect(missing.result).toMatch(/^Not done: there is no phone number for this caller/);

    const logged = await callTool(
      'request_valuation',
      { ...args, callerPhone: '07700 900 123' },
      webCall,
    );
    expect(logged.result).toContain(
      'Logged: a valuation request for 12 Rubislaw Den South, Aberdeen, AB15 4CK from Graham Reid, contact number 07700900123.',
    );
  });

  it('takes a message', async () => {
    const outcome = await callTool('take_message', {
      callerName: 'Morag Smith',
      about: 'buying',
      message: 'Wants to make an offer on 4 Tolland Street',
    });
    expect(outcome.result).toBe(
      'Message taken from Morag Smith, contact number +441632960000. Tell the caller the team will get back to them.',
    );
  });

  it('sends bad arguments back for the model to correct, and unknown tools too', async () => {
    const bad = await callTool('book_viewing', { propertyRef: 'twelve', slot: 'Monday 10am' });
    expect(bad.result).toMatch(
      /^Not done: the arguments were not valid \(propertyRef: .*slot: .*callerName: /,
    );
    const unknown = await callTool('order_pizza', {});
    expect(unknown.result).toBe('Not done: there is no tool called order_pizza.');
  });

  it('answers several tool calls in one message by id', async () => {
    const response = await request(app.getHttpServer())
      .post('/vapi/webhook')
      .set('X-Vapi-Secret', SECRET)
      .send({
        message: {
          type: 'tool-calls',
          call: CALL,
          toolCallList: [
            { id: 'a', name: 'get_viewing_slots', parameters: { propertyRef: '88' } },
            {
              id: 'b',
              function: { name: 'get_viewing_slots', arguments: '{"propertyRef":"1207"}' },
            },
          ],
        },
      })
      .expect(200);
    const { results } = response.body as { results: ToolResult[] };
    expect(results.map((result) => result.toolCallId)).toEqual(['a', 'b']);
    expect(results[0]?.result).toContain('4 Tolland Street');
    expect(results[1]?.result).toContain('20 Larkfield Rise');
  });

  it('stores the end of call report and forgets the call', async () => {
    await request(app.getHttpServer())
      .post('/vapi/webhook')
      .set('X-Vapi-Secret', SECRET)
      .send({
        message: {
          type: 'end-of-call-report',
          call: CALL,
          endedReason: 'customer-ended-call',
          startedAt: '2026-10-11T09:00:00Z',
          endedAt: '2026-10-11T09:04:00Z',
          analysis: { summary: 'Caller booked a viewing.' },
          artifact: { transcript: 'AI: Hello. User: Hi.', messages: [] },
        },
      })
      .expect(200, {});
    const after = await callTool('get_viewing_slots', { propertyRef: '1207' });
    expect(after.result).toMatch(/^Not done: ref 1207 has not come up/);
  });

  it('ignores bodies that are not Vapi messages', async () => {
    await request(app.getHttpServer())
      .post('/vapi/webhook')
      .set('X-Vapi-Secret', SECRET)
      .send({ hello: 'world' })
      .expect(200, {});
  });
});

describe('the admin endpoints', () => {
  it('need the admin token', async () => {
    await request(app.getHttpServer()).get('/admin/viewings').expect(401);
    await request(app.getHttpServer())
      .get('/admin/viewings')
      .set('Authorization', `Bearer ${SECRET}`)
      .expect(401);
  });

  it('list what the agent did, newest first', async () => {
    const get = async (path: string): Promise<Record<string, unknown>[]> =>
      (
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${ADMIN}`)
          .expect(200)
      ).body as Record<string, unknown>[];

    expect(await get('/admin/viewings')).toEqual([
      expect.objectContaining({
        property_ref: '1207',
        slot: '2026-10-12T10:30',
        caller_name: 'Aileen Duncan',
        caller_phone: '+441632960000',
        notes: 'Has a mortgage in principle',
      }),
    ]);
    expect(await get('/admin/valuations')).toEqual([
      expect.objectContaining({
        postcode: 'AB15 4CK',
        is_also_buying: true,
        timeframe: 'within_3_months',
      }),
    ]);
    expect(await get('/admin/messages')).toEqual([
      expect.objectContaining({ caller_name: 'Morag Smith', about: 'buying' }),
    ]);
    expect(await get('/admin/calls?limit=5')).toEqual([
      expect.objectContaining({
        call_id: CALL.id,
        summary: 'Caller booked a viewing.',
        transcript: 'AI: Hello. User: Hi.',
        ended_reason: 'customer-ended-call',
      }),
    ]);
  });
});

describe('health', () => {
  it('reports the database and HomeSage', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'up', services: { database: 'up', homesage: 'up' } });
  });
});
