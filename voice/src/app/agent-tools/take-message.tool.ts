import { Injectable } from '@nestjs/common';
import { Clock } from '../../platform/clock/clock.js';
import { MessageRepository } from '../leads/message.repository.js';
import { Notifier } from '../notify/notifier.js';
import { done, notDone } from './agent-tool.js';
import type { AgentTool, CallContext, ToolOutcome } from './agent-tool.js';
import { callerPhone, NO_PHONE_REASON } from './caller-phone.js';
import { TOOL_NAME } from './tool-definitions.js';
import type { TakeMessageArgs } from './tool-definitions.js';

/** Takes a message for the team about anything the agent cannot handle itself. */
@Injectable()
export class TakeMessageTool implements AgentTool<TakeMessageArgs> {
  public readonly name = TOOL_NAME.TAKE_MESSAGE;

  public constructor(
    private readonly messages: MessageRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  public run(args: TakeMessageArgs, call: CallContext): Promise<ToolOutcome> {
    return Promise.resolve(this.take(args, call));
  }

  private take(args: TakeMessageArgs, call: CallContext): ToolOutcome {
    const phone = callerPhone(args.callerPhone, call);
    if (phone === null) {
      return notDone(NO_PHONE_REASON);
    }

    this.messages.add(
      {
        callId: call.callId,
        callerName: args.callerName,
        callerPhone: phone,
        about: args.about,
        message: args.message,
      },
      this.clock.now(),
    );

    void this.notifier.send({
      kind: 'message_taken',
      text: `Message (${args.about}) from ${args.callerName} (${phone}): ${args.message}`,
      details: {
        callerName: args.callerName,
        callerPhone: phone,
        about: args.about,
        message: args.message,
      },
    });

    return done(
      `Message taken from ${args.callerName}, contact number ${phone}. Tell the caller the team will get back to them.`,
    );
  }
}
