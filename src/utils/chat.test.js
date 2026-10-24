import { dayLabel, shortTime, layoutChat, mergeMessages } from './chat';

// Saturday, Oct 24 2026, 3:00 PM local time
const NOW = new Date(2026, 9, 24, 15, 0);
const at = (month, day, hour, minute = 0, year = 2026) => new Date(year, month - 1, day, hour, minute);

const message = (id, user, date, text = id) => ({
  _id: id,
  sender: { user, name: user === 'me' ? 'Me' : 'Alex' },
  text,
  createdAt: date.toISOString()
});

describe('dayLabel', () => {
  it('names recent days, then gives dates', () => {
    expect(dayLabel(at(10, 24, 9), NOW)).toBe('Today');
    expect(dayLabel(at(10, 23, 23, 59), NOW)).toBe('Yesterday');
    expect(dayLabel(at(10, 19, 12), NOW)).toBe('Monday');
    expect(dayLabel(at(10, 17, 12), NOW)).toBe('Sat, Oct 17');
    expect(dayLabel(at(12, 31, 12, 0, 2025), NOW)).toBe('Wed, Dec 31, 2025');
  });
});

describe('shortTime', () => {
  it('is a time today, then a day, then a date', () => {
    expect(shortTime(at(10, 24, 14, 34).toISOString(), NOW)).toBe('2:34 PM');
    expect(shortTime(at(10, 23, 8).toISOString(), NOW)).toBe('Yesterday');
    expect(shortTime(at(10, 19, 8).toISOString(), NOW)).toBe('Mon');
    expect(shortTime(at(10, 3, 8).toISOString(), NOW)).toBe('Oct 3');
    expect(shortTime(at(10, 3, 8, 0, 2025).toISOString(), NOW)).toBe('Oct 3, 2025');
  });
});

describe('layoutChat', () => {
  it('adds a divider before each new day', () => {
    const items = layoutChat([
      message('a', 'alex', at(10, 23, 20)),
      message('b', 'alex', at(10, 24, 9))
    ], 'me', NOW);

    expect(items.map(i => (i.kind === 'day' ? i.label : i.message._id))).toEqual(['Yesterday', 'a', 'Today', 'b']);
  });

  it('groups quick messages from one person into a run', () => {
    const items = layoutChat([
      message('a', 'alex', at(10, 24, 9, 0)),
      message('b', 'alex', at(10, 24, 9, 2)),
      message('c', 'alex', at(10, 24, 9, 4)),
      message('d', 'me', at(10, 24, 9, 5)),
      // Over 5 minutes after Alex's last one: a new run
      message('e', 'alex', at(10, 24, 9, 12))
    ], 'me', NOW).filter(i => i.kind === 'message');

    expect(items.map(i => [i.message._id, i.first, i.last])).toEqual([
      ['a', true, false],
      ['b', false, false],
      ['c', false, true],
      ['d', true, true],
      ['e', true, true]
    ]);
    expect(items.map(i => i.mine)).toEqual([false, false, false, true, false]);
    expect(items[0].time).toBe('9:00 AM');
  });

  it('never runs across midnight', () => {
    const items = layoutChat([
      message('a', 'alex', at(10, 23, 23, 59)),
      message('b', 'alex', at(10, 24, 0, 1))
    ], 'me', NOW).filter(i => i.kind === 'message');

    expect(items.map(i => [i.first, i.last])).toEqual([[true, true], [true, true]]);
  });
});

describe('mergeMessages', () => {
  const a = message('c001', 'alex', at(10, 24, 9));
  const b = message('c002', 'me', at(10, 24, 9, 1));
  const c = message('c003', 'alex', at(10, 24, 9, 2));

  it('adds new messages in order and skips ones it has', () => {
    expect(mergeMessages([a, b], [b, c]).map(m => m._id)).toEqual(['c001', 'c002', 'c003']);
    expect(mergeMessages([b, c], [a]).map(m => m._id)).toEqual(['c001', 'c002', 'c003']);
  });

  it('returns the same list when nothing is new, so nothing re-renders', () => {
    const list = [a, b];
    expect(mergeMessages(list, [a])).toBe(list);
  });
});
