import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A listening server and the address it listens on. */
export interface RunningServer {
  readonly url: string;
  close(): Promise<void>;
}

/** A request one of the fakes received. */
export interface Received {
  readonly path: string;
  readonly headers: IncomingMessage['headers'];
  readonly body: unknown;
}

const HOME_1207 = {
  id: '1207',
  address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
  price: 245000,
  bedrooms: 3,
};
const HOME_88 = {
  id: '88',
  address: '4 Tolland Street, Inverurie, AB51 3CK',
  price: 199950,
  bedrooms: 1,
};
const HOME_5 = { id: '5', address: '9 Uncited Road, Ellon, AB41 1CK', price: 150000, bedrooms: 2 };

/**
 * Behaves like HomeSage's `POST /chat` for a few fixed questions. A question
 * with "garden" gets two cited homes out of three retrieved, "busy" a 429,
 * "broken" an error event, "cut" a stream that stops without done, and
 * anything else a no match answer.
 */
export function fakeHomesage(received: Received[]): Promise<RunningServer> {
  return listen(async (request, response) => {
    const body = await readJson(request);
    received.push({ path: request.url ?? '', headers: request.headers, body });

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200).end('{"status":"up"}');
      return;
    }
    const question = (body as { question?: string }).question ?? '';
    if (question.includes('busy')) {
      response.writeHead(429).end('{"statusCode":429}');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (event: Record<string, unknown> & { type: string }): void => {
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    response.write(': heartbeat\n\n');
    send({
      type: 'route',
      intent: 'hybrid',
      filters: {},
      standaloneQuestion: question,
      fallback: null,
    });

    if (question.includes('broken')) {
      send({ type: 'error', message: 'Something went wrong while answering. Please try again.' });
      response.end();
      return;
    }
    if (question.includes('cut')) {
      send({ type: 'token', text: 'Half an answer' });
      response.end();
      return;
    }
    if (question.includes('garden')) {
      send({
        type: 'retrieval',
        kind: 'properties',
        properties: [HOME_1207, HOME_5, HOME_88],
        ranking: 'fused',
      });
      for (const text of [
        'Two homes match. 20 Larkfield Rise Eastholm is a 3 bedroom home at £245,000 with a garden [P-1207]',
        '. 4 Tolland Street in Inverurie is £199,950 and the seller reports a new roof in 2019 [P-88].',
      ]) {
        send({ type: 'token', text });
      }
      send({ type: 'citations', kind: 'properties', ids: ['1207', '88'] });
      send({ type: 'done' });
      response.end();
      return;
    }
    send({ type: 'retrieval', kind: 'none', reason: 'no_match' });
    send({ type: 'token', text: 'No listing in the data matches that.' });
    send({ type: 'citations', kind: 'properties', ids: [] });
    send({ type: 'done' });
    response.end();
  });
}

/** Accepts any JSON POST and records it, like a Slack or n8n webhook. */
export function fakeWebhook(received: Received[]): Promise<RunningServer> {
  return listen(async (request, response) => {
    received.push({
      path: request.url ?? '',
      headers: request.headers,
      body: await readJson(request),
    });
    response.writeHead(200).end('ok');
  });
}

function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): Promise<RunningServer> {
  const server: Server = createServer((request, response) => {
    void handler(request, response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let text = '';
  for await (const chunk of request) {
    text += String(chunk);
  }
  try {
    return text === '' ? null : JSON.parse(text);
  } catch {
    return text;
  }
}
