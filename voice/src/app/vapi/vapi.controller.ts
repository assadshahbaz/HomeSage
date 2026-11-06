import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { Clock } from '../../platform/clock/clock.js';
import type { CallContext } from '../agent-tools/agent-tool.js';
import { ToolDispatcher } from '../agent-tools/tool-dispatcher.js';
import { CallLogRepository } from '../calls/call-log.repository.js';
import { CallMemory } from '../calls/call-memory.js';
import {
  endOfCallReportSchema,
  serverMessageEnvelopeSchema,
  toolCallsMessageSchema,
} from './vapi-messages.js';
import type { EndOfCallReport, ToolCallResult, ToolCallsMessage } from './vapi-messages.js';
import { VapiSecretGuard } from './vapi-secret.guard.js';

/** Vapi ignores the body for messages that expect no reply. */
type Acknowledgement = Record<string, never>;

/**
 * Vapi's server URL. Tool calls are answered with one result per call, and end
 * of call reports are stored. Every reply is a 200, because Vapi treats any
 * other status as no result at all and the caller would hear nothing useful.
 */
@Controller('vapi')
@UseGuards(VapiSecretGuard)
export class VapiController {
  private readonly logger = new Logger(VapiController.name);

  public constructor(
    private readonly tools: ToolDispatcher,
    private readonly memory: CallMemory,
    private readonly callLog: CallLogRepository,
    private readonly clock: Clock,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  public async webhook(
    @Body() body: unknown,
  ): Promise<{ results: ToolCallResult[] } | Acknowledgement> {
    const envelope = serverMessageEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      this.logger.warn('Ignored a webhook body that is not a Vapi server message');
      return {};
    }
    switch (envelope.data.message.type) {
      case 'tool-calls':
        return this.answerToolCalls(envelope.data.message);
      case 'end-of-call-report':
        this.storeReport(envelope.data.message);
        return {};
      default:
        return {};
    }
  }

  private async answerToolCalls(raw: unknown): Promise<{ results: ToolCallResult[] }> {
    const parsed = toolCallsMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(`Ignored an unreadable tool-calls message: ${parsed.error.message}`);
      return { results: [] };
    }
    const message: ToolCallsMessage = parsed.data;
    const call: CallContext = {
      callId: message.call.id,
      callerNumber: message.call.customer?.number ?? null,
    };
    // Vapi can ask for several tools at once; each runs on its own and answers by id.
    const results = await Promise.all(
      message.toolCallList.map(async (toolCall): Promise<ToolCallResult> => {
        const outcome = await this.tools.dispatch(toolCall.name, toolCall.args, call);
        return outcome.kind === 'result'
          ? { toolCallId: toolCall.id, name: toolCall.name, result: outcome.text }
          : { toolCallId: toolCall.id, name: toolCall.name, error: outcome.text };
      }),
    );
    return { results };
  }

  private storeReport(raw: unknown): void {
    const parsed = endOfCallReportSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(`Ignored an unreadable end-of-call-report: ${parsed.error.message}`);
      return;
    }
    const report: EndOfCallReport = parsed.data;
    this.callLog.record(
      {
        callId: report.call.id,
        callerPhone: report.call.customer?.number ?? null,
        startedAt: report.startedAt ?? report.call.startedAt ?? null,
        endedAt: report.endedAt ?? report.call.endedAt ?? null,
        endedReason: report.endedReason ?? null,
        summary: report.analysis?.summary ?? report.summary ?? null,
        transcript: report.artifact?.transcript ?? report.transcript ?? null,
      },
      this.clock.now(),
    );
    this.memory.forget(report.call.id);
    this.logger.log(`Stored the report for call ${report.call.id}`);
  }
}
