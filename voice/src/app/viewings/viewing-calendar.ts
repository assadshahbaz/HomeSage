import type { ViewingConfig } from '../../infra/config/app-config.js';

/** One viewing time. `id` is what the model passes back to book it. */
export interface ViewingSlot {
  /** Local date and time in the agency's zone, such as 2026-10-14T10:30. */
  readonly id: string;
  readonly date: string;
  /** How the agent should say it, such as "Wednesday 14 October at 10:30am". */
  readonly spoken: string;
}

const MINUTES_PER_HOUR = 60;
const NOON = 12;
const TWO_DIGITS = 2;
const DATE_ID = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_LENGTH = 'YYYY-MM-DD'.length;

const dayParts = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * The agency's viewing diary: every slot from tomorrow to the configured number
 * of days ahead, on viewing days, between the opening and closing times. Dates
 * and times are local to the agency, so no slot moves when the clocks change.
 */
export class ViewingCalendar {
  private readonly times: readonly string[];

  public constructor(
    private readonly config: ViewingConfig,
    private readonly timeZone: string,
  ) {
    this.times = slotTimes(config.start, config.end, config.slotMinutes);
  }

  /** Today's date in the agency's zone, as YYYY-MM-DD. */
  public today(now: Date): string {
    return localDate(now, this.timeZone);
  }

  /** Every slot in the bookable window, in time order. */
  public slots(now: Date): ViewingSlot[] {
    const today = this.today(now);
    const slots: ViewingSlot[] = [];
    for (let offset = 1; offset <= this.config.daysAhead; offset += 1) {
      const date = addDays(today, offset);
      if (!this.config.days.includes(weekday(date))) {
        continue;
      }
      for (const time of this.times) {
        slots.push({ id: `${date}T${time}`, date, spoken: spokenSlot(date, time) });
      }
    }
    return slots;
  }

  /** The slot with this id when it is inside the bookable window, otherwise null. */
  public find(slotId: string, now: Date): ViewingSlot | null {
    return this.slots(now).find((slot) => slot.id === slotId) ?? null;
  }
}

/** The calendar date at `now` in `timeZone`, as YYYY-MM-DD. */
export function localDate(now: Date, timeZone: string): string {
  // The en-CA format writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A YYYY-MM-DD date said in full, such as "Sunday 11 October 2026". */
export function spokenDate(date: string): string {
  const { weekday, day, month, year } = namedParts(date);
  return `${weekday} ${day} ${month} ${year}`;
}

// Built from parts, because ICU versions differ on putting a comma after the weekday.
function namedParts(date: string): Record<'weekday' | 'day' | 'month' | 'year', string> {
  const parts = dayParts.formatToParts(utcNoon(date));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return { weekday: part('weekday'), day: part('day'), month: part('month'), year: part('year') };
}

/** Whether `date` is a real calendar date written as YYYY-MM-DD. */
export function isCalendarDate(date: string): boolean {
  const match = DATE_ID.exec(date);
  if (match === null) {
    return false;
  }
  const [, year, month, day] = match;
  const parsed = utcNoon(date);
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

function addDays(date: string, days: number): string {
  const moved = utcNoon(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, DATE_LENGTH);
}

function weekday(date: string): number {
  return utcNoon(date).getUTCDay();
}

// Noon keeps date arithmetic clear of any midnight edge.
function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function slotTimes(start: string, end: string, slotMinutes: number): string[] {
  const times: string[] = [];
  for (let minute = toMinutes(start); minute < toMinutes(end); minute += slotMinutes) {
    const hours = Math.floor(minute / MINUTES_PER_HOUR);
    const minutes = minute % MINUTES_PER_HOUR;
    times.push(`${pad(hours)}:${pad(minutes)}`);
  }
  return times;
}

function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function pad(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}

function spokenSlot(date: string, time: string): string {
  const { weekday, day, month } = namedParts(date);
  return `${weekday} ${day} ${month} at ${spokenTime(time)}`;
}

/** 24 hour HH:MM as people say it: 10am, 2:30pm, 12pm. */
function spokenTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const suffix = hours < NOON ? 'am' : 'pm';
  const clockHour = hours % NOON === 0 ? NOON : hours % NOON;
  return minutes === 0 ? `${clockHour}${suffix}` : `${clockHour}:${pad(minutes)}${suffix}`;
}
