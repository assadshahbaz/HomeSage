import { Injectable } from '@nestjs/common';
import { Clock } from '../../platform/clock/clock.js';
import { ValuationRequestRepository } from '../leads/valuation-request.repository.js';
import { Notifier } from '../notify/notifier.js';
import { done, notDone } from './agent-tool.js';
import type { AgentTool, CallContext, ToolOutcome } from './agent-tool.js';
import { callerPhone, NO_PHONE_REASON } from './caller-phone.js';
import { TOOL_NAME } from './tool-definitions.js';
import type { RequestValuationArgs } from './tool-definitions.js';

/** Logs a would be seller's request for a valuation and tells the office at once. */
@Injectable()
export class RequestValuationTool implements AgentTool<RequestValuationArgs> {
  public readonly name = TOOL_NAME.REQUEST_VALUATION;

  public constructor(
    private readonly requests: ValuationRequestRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  public run(args: RequestValuationArgs, call: CallContext): Promise<ToolOutcome> {
    return Promise.resolve(this.request(args, call));
  }

  private request(args: RequestValuationArgs, call: CallContext): ToolOutcome {
    const phone = callerPhone(args.callerPhone, call);
    if (phone === null) {
      return notDone(NO_PHONE_REASON);
    }
    const address =
      args.postcode === undefined
        ? args.propertyAddress
        : `${args.propertyAddress}, ${args.postcode}`;

    this.requests.add(
      {
        callId: call.callId,
        callerName: args.callerName,
        callerPhone: phone,
        propertyAddress: args.propertyAddress,
        postcode: args.postcode ?? null,
        timeframe: args.timeframe,
        isAlsoBuying: args.isAlsoBuying ?? null,
        notes: args.notes ?? null,
      },
      this.clock.now(),
    );

    void this.notifier.send({
      kind: 'valuation_requested',
      text: `Valuation request: ${args.callerName} (${phone}) at ${address}, selling ${args.timeframe.replace(/_/g, ' ')}.`,
      details: {
        callerName: args.callerName,
        callerPhone: phone,
        propertyAddress: args.propertyAddress,
        postcode: args.postcode ?? null,
        timeframe: args.timeframe,
        isAlsoBuying: args.isAlsoBuying ?? null,
        notes: args.notes ?? null,
      },
    });

    return done(
      `Logged: a valuation request for ${address} from ${args.callerName}, contact number ${phone}. Thank the caller and say a valuer will call them back to arrange a time. Do not suggest what the home is worth.`,
    );
  }
}
