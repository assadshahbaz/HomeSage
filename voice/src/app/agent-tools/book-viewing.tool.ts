import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';
import { Clock } from '../../platform/clock/clock.js';
import { CallMemory } from '../calls/call-memory.js';
import { Notifier } from '../notify/notifier.js';
import { ViewingCalendar } from '../viewings/viewing-calendar.js';
import { ViewingRepository } from '../viewings/viewing.repository.js';
import { done, notDone } from './agent-tool.js';
import type { AgentTool, CallContext, ToolOutcome } from './agent-tool.js';
import { callerPhone, NO_PHONE_REASON } from './caller-phone.js';
import { TOOL_NAME } from './tool-definitions.js';
import type { BookViewingArgs } from './tool-definitions.js';

/**
 * Books a viewing in a free slot for a home from this call, then tells the
 * office. The slot must be one the diary offers and still free; the unique
 * index on home and slot settles two callers choosing the same time at once.
 */
@Injectable()
export class BookViewingTool implements AgentTool<BookViewingArgs> {
  public readonly name = TOOL_NAME.BOOK_VIEWING;
  private readonly calendar: ViewingCalendar;

  public constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly memory: CallMemory,
    private readonly viewings: ViewingRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {
    this.calendar = new ViewingCalendar(config.viewings, config.agency.timeZone);
  }

  public run(args: BookViewingArgs, call: CallContext): Promise<ToolOutcome> {
    return Promise.resolve(this.book(args, call));
  }

  private book(args: BookViewingArgs, call: CallContext): ToolOutcome {
    const home = this.memory.propertyFor(call.callId, args.propertyRef);
    if (home === null) {
      return notDone(
        `ref ${args.propertyRef} has not come up in this call. Use search_properties to find the home first.`,
      );
    }
    const now = this.clock.now();
    const slot = this.calendar.find(args.slot, now);
    if (slot === null) {
      return notDone(
        `${args.slot} is not a time we can book. Call get_viewing_slots and offer the caller one of its times.`,
      );
    }
    const phone = callerPhone(args.callerPhone, call);
    if (phone === null) {
      return notDone(NO_PHONE_REASON);
    }

    const outcome = this.viewings.book(
      {
        callId: call.callId,
        propertyRef: home.id,
        propertyAddress: home.address,
        slot: slot.id,
        callerName: args.callerName,
        callerPhone: phone,
        notes: args.notes ?? null,
      },
      now,
    );
    if (outcome === 'taken') {
      return notDone(
        'that time has just been taken. Call get_viewing_slots again and offer the caller other times.',
      );
    }

    // The booking is saved; the caller need not wait for the office to be told.
    void this.notifier.send({
      kind: 'viewing_booked',
      text: `New viewing: ${args.callerName} (${phone}) for ${home.address} on ${slot.spoken}.`,
      details: {
        callerName: args.callerName,
        callerPhone: phone,
        propertyRef: home.id,
        propertyAddress: home.address,
        slot: slot.id,
        notes: args.notes ?? null,
      },
    });

    return done(
      `Booked: a viewing of ${home.address} on ${slot.spoken} for ${args.callerName}, contact number ${phone}. Confirm the day, time and address back to the caller, and say a member of the team will be in touch beforehand to confirm.`,
    );
  }
}
