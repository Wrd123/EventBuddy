import { formatTime, formatTimeRange, sortSchedule, isGoing, validateScheduleItem } from './schedule';

describe('formatTime', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'],
    ['14:30', '2:30 PM'],
    ['23:59', '11:59 PM']
  ])('formats %s as %s', (time, expected) => {
    expect(formatTime(time)).toBe(expected);
  });

  it('returns an empty string for a missing or invalid time', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime('25:00')).toBe('');
  });
});

describe('formatTimeRange', () => {
  it('shows start and end', () => {
    expect(formatTimeRange('14:00', '15:30')).toBe('2:00 PM – 3:30 PM');
  });

  it('shows only the start when there is no end', () => {
    expect(formatTimeRange('14:00', '')).toBe('2:00 PM');
  });
});

describe('sortSchedule', () => {
  it('sorts by day, then start time, without changing the input', () => {
    const items = [
      { date: '2026-11-15', startTime: '09:00' },
      { date: '2026-11-14', startTime: '13:00' },
      { date: '2026-11-14', startTime: '09:00' }
    ];
    const sorted = sortSchedule(items);

    expect(sorted.map((i) => `${i.date} ${i.startTime}`)).toEqual([
      '2026-11-14 09:00', '2026-11-14 13:00', '2026-11-15 09:00'
    ]);
    expect(items[0].date).toBe('2026-11-15');
  });
});

describe('isGoing', () => {
  it('matches attendees by user id, ignoring name-only attendees', () => {
    const item = { attendees: [{ user: null, name: 'Alex' }, { user: 'u1', name: 'John Doe' }] };

    expect(isGoing(item, 'u1')).toBe(true);
    expect(isGoing(item, 'u2')).toBe(false);
  });
});

describe('validateScheduleItem', () => {
  const event = { startDate: '2026-11-13', endDate: '2026-11-15' };
  const valid = { date: '2026-11-14', startTime: '09:00', endTime: '12:00', activity: 'Hike', location: '' };
  const validate = (overrides) => validateScheduleItem({ ...valid, ...overrides }, event);

  it('accepts a valid item, with or without an end time', () => {
    expect(validate({})).toBe('');
    expect(validate({ endTime: '' })).toBe('');
  });

  it.each([
    ['a missing activity', { activity: '' }, "Please enter what's happening."],
    ['a day outside the event', { date: '2026-11-16' }, 'Please choose a day during the event.'],
    ['a missing start time', { startTime: '' }, 'Please choose a start time.'],
    ['an end before the start', { endTime: '08:00' }, 'The end time must be after the start time.']
  ])('rejects %s', (_, overrides, message) => {
    expect(validate(overrides)).toBe(message);
  });
});
