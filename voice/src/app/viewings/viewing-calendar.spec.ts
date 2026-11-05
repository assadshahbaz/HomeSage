import type { ViewingConfig } from '../../infra/config/app-config.js';
import { isCalendarDate, localDate, spokenDate, ViewingCalendar } from './viewing-calendar.js';

const CONFIG: ViewingConfig = {
  days: [1, 2, 3, 4, 5, 6],
  start: '10:00',
  end: '12:00',
  slotMinutes: 30,
  daysAhead: 7,
  slotsOffered: 4,
};

// Sunday 11 October 2026, 10am in London (British Summer Time).
const SUNDAY_MORNING = new Date('2026-10-11T09:00:00Z');

describe('ViewingCalendar', () => {
  const calendar = new ViewingCalendar(CONFIG, 'Europe/London');

  it('starts tomorrow and skips days without viewings', () => {
    const slots = calendar.slots(SUNDAY_MORNING);
    expect(slots[0]).toEqual({
      id: '2026-10-12T10:00',
      date: '2026-10-12',
      spoken: 'Monday 12 October at 10am',
    });
    // Seven days ahead reaches Sunday 18th, which has no viewings: six days of four slots.
    expect(slots).toHaveLength(24);
    expect(slots.some((slot) => slot.date === '2026-10-18')).toBe(false);
    expect(slots.map((slot) => slot.id).slice(0, 4)).toEqual([
      '2026-10-12T10:00',
      '2026-10-12T10:30',
      '2026-10-12T11:00',
      '2026-10-12T11:30',
    ]);
  });

  it('says afternoon and half hour times the way people do', () => {
    const afternoon = new ViewingCalendar(
      { ...CONFIG, start: '12:00', end: '14:00', slotMinutes: 90 },
      'Europe/London',
    );
    expect(
      afternoon
        .slots(SUNDAY_MORNING)
        .slice(0, 2)
        .map((slot) => slot.spoken),
    ).toEqual(['Monday 12 October at 12pm', 'Monday 12 October at 1:30pm']);
  });

  it('uses the agency’s date, not UTC, late in the evening', () => {
    // 23:30 UTC on 11 October is already 00:30 on 12 October in London.
    const lateEvening = new Date('2026-10-11T23:30:00Z');
    expect(calendar.today(lateEvening)).toBe('2026-10-12');
    expect(calendar.slots(lateEvening)[0]?.date).toBe('2026-10-13');
  });

  it('finds only slots inside the window', () => {
    expect(calendar.find('2026-10-12T10:30', SUNDAY_MORNING)?.spoken).toBe(
      'Monday 12 October at 10:30am',
    );
    expect(calendar.find('2026-10-11T10:30', SUNDAY_MORNING)).toBeNull();
    expect(calendar.find('2026-10-12T10:15', SUNDAY_MORNING)).toBeNull();
    expect(calendar.find('2026-10-30T10:00', SUNDAY_MORNING)).toBeNull();
  });
});

describe('dates', () => {
  it('formats the local date and says it in full', () => {
    expect(localDate(SUNDAY_MORNING, 'Europe/London')).toBe('2026-10-11');
    expect(spokenDate('2026-10-11')).toBe('Sunday 11 October 2026');
  });

  it('tells real dates from impossible ones', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('tomorrow')).toBe(false);
  });
});
