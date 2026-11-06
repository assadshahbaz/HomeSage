import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';
import { Clock } from '../../platform/clock/clock.js';
import { CallMemory } from '../calls/call-memory.js';
import { isCalendarDate, spokenDate, ViewingCalendar } from '../viewings/viewing-calendar.js';
import type { ViewingSlot } from '../viewings/viewing-calendar.js';
import { ViewingRepository } from '../viewings/viewing.repository.js';
import { done, notDone } from './agent-tool.js';
import type { AgentTool, CallContext, ToolOutcome } from './agent-tool.js';
import { TOOL_NAME } from './tool-definitions.js';
import type { GetViewingSlotsArgs } from './tool-definitions.js';

/** Two a day, so the caller hears a choice of days rather than one morning. */
const MAX_SLOTS_PER_DAY = 2;

/** Offers free viewing times for a home that came up in this call. */
@Injectable()
export class GetViewingSlotsTool implements AgentTool<GetViewingSlotsArgs> {
  public readonly name = TOOL_NAME.GET_VIEWING_SLOTS;
  private readonly calendar: ViewingCalendar;

  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly memory: CallMemory,
    private readonly viewings: ViewingRepository,
    private readonly clock: Clock,
  ) {
    this.calendar = new ViewingCalendar(config.viewings, config.agency.timeZone);
  }

  public run(args: GetViewingSlotsArgs, call: CallContext): Promise<ToolOutcome> {
    return Promise.resolve(this.offer(args, call));
  }

  private offer(args: GetViewingSlotsArgs, call: CallContext): ToolOutcome {
    const home = this.memory.propertyFor(call.callId, args.propertyRef);
    if (home === null) {
      return notDone(
        `ref ${args.propertyRef} has not come up in this call. Use search_properties to find the home first.`,
      );
    }
    if (args.date !== undefined && !isCalendarDate(args.date)) {
      return notDone(`${args.date} is not a date. Pass the day as YYYY-MM-DD.`);
    }

    const now = this.clock.now();
    const booked = this.viewings.bookedSlots(args.propertyRef);
    const free = this.calendar.slots(now).filter((slot) => !booked.has(slot.id));
    const today = `Today is ${spokenDate(this.calendar.today(now))}.`;
    const limit = this.config.viewings.slotsOffered;

    if (free.length === 0) {
      return done(
        `${today} There are no free viewing times for ${home.address} in the next ${this.config.viewings.daysAhead} days. Offer to take a message so the team can arrange one.`,
      );
    }

    if (args.date !== undefined) {
      const onDay = free.filter((slot) => slot.date === args.date);
      if (onDay.length > 0) {
        return done(
          `${today} Free times for viewing ${home.address} on ${spokenDate(args.date)}: ${listSlots(onDay.slice(0, limit))}. ${BOOKING_HINT}`,
        );
      }
      return done(
        `${today} There are no free viewing times on ${spokenDate(args.date)}: it is outside our viewing days, outside the booking window, or fully booked. The next free times for ${home.address} are: ${listSlots(spread(free, limit))}. ${BOOKING_HINT}`,
      );
    }

    return done(
      `${today} Free times for viewing ${home.address}: ${listSlots(spread(free, limit))}. ${BOOKING_HINT}`,
    );
  }
}

const BOOKING_HINT =
  'Offer the caller two or three of these, and pass the chosen slot id exactly to book_viewing.';

function listSlots(slots: readonly ViewingSlot[]): string {
  return slots.map((slot) => `slot ${slot.id} (${slot.spoken})`).join('; ');
}

/** The earliest `limit` slots, taking no more than two from any one day. */
function spread(slots: readonly ViewingSlot[], limit: number): ViewingSlot[] {
  const perDay = new Map<string, number>();
  const chosen: ViewingSlot[] = [];
  for (const slot of slots) {
    const taken = perDay.get(slot.date) ?? 0;
    if (taken < MAX_SLOTS_PER_DAY) {
      chosen.push(slot);
      perDay.set(slot.date, taken + 1);
    }
    if (chosen.length === limit) {
      break;
    }
  }
  return chosen;
}
