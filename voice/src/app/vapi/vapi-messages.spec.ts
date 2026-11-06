import { endOfCallReportSchema, toolCallsMessageSchema } from './vapi-messages.js';

const call = { id: 'call-1', customer: { number: '+441632960123' }, orgId: 'org-1' };

describe('toolCallsMessageSchema', () => {
  it('reads arguments nested under function', () => {
    const message = toolCallsMessageSchema.parse({
      type: 'tool-calls',
      call,
      toolCallList: [
        {
          id: 'tc-1',
          type: 'function',
          function: { name: 'search_properties', arguments: { question: 'flats' } },
        },
      ],
    });
    expect(message.toolCallList).toEqual([
      { id: 'tc-1', name: 'search_properties', args: { question: 'flats' } },
    ]);
    expect(message.call.customer?.number).toBe('+441632960123');
  });

  it('reads the flat shape with parameters', () => {
    const message = toolCallsMessageSchema.parse({
      type: 'tool-calls',
      call,
      toolCallList: [{ id: 'tc-1', name: 'take_message', parameters: { message: 'hi' } }],
    });
    expect(message.toolCallList[0]).toEqual({
      id: 'tc-1',
      name: 'take_message',
      args: { message: 'hi' },
    });
  });

  it('parses arguments sent as a JSON string, and keeps a bad one as a string', () => {
    const message = toolCallsMessageSchema.parse({
      type: 'tool-calls',
      call,
      toolCallList: [
        { id: 'a', function: { name: 'x', arguments: '{"question":"flats"}' } },
        { id: 'b', function: { name: 'x', arguments: '{not json' } },
        { id: 'c', function: { name: 'x' } },
      ],
    });
    expect(message.toolCallList.map((toolCall) => toolCall.args)).toEqual([
      { question: 'flats' },
      '{not json',
      {},
    ]);
  });

  it('refuses a tool call with no name', () => {
    expect(
      toolCallsMessageSchema.safeParse({ type: 'tool-calls', call, toolCallList: [{ id: 'a' }] })
        .success,
    ).toBe(false);
  });
});

describe('endOfCallReportSchema', () => {
  it('reads the transcript and summary from wherever Vapi puts them', () => {
    const report = endOfCallReportSchema.parse({
      type: 'end-of-call-report',
      call: { id: 'call-1', customer: null },
      endedReason: 'customer-ended-call',
      analysis: { summary: 'Booked a viewing.' },
      artifact: { transcript: 'AI: Hello', messages: [] },
    });
    expect(report.analysis?.summary).toBe('Booked a viewing.');
    expect(report.artifact?.transcript).toBe('AI: Hello');
    expect(report.call.customer).toBeNull();
  });
});
