import {
  formatDateRangeShort,
  daysUntil,
  daysAwayLabel,
  toISODate,
  parseISODate,
  eachDay,
  formatDay,
  formatDateRange,
  getEventStatus,
  defaultScheduleDay
} from './dates';

describe('parseISODate / toISODate', () => {
  it('round-trips without shifting the day', () => {
    expect(toISODate(parseISODate('2026-11-27'))).toBe('2026-11-27');
  });

  it('parses as the local calendar day, not UTC', () => {
    const date = parseISODate('2026-01-01');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 0, 1]);
  });
});

describe('eachDay', () => {
  it('returns a single day when start equals end', () => {
    expect(eachDay('2026-11-27', '2026-11-27')).toEqual(['2026-11-27']);
  });

  it('crosses month and year boundaries', () => {
    expect(eachDay('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'
    ]);
  });

  it('includes leap day', () => {
    expect(eachDay('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });
});

describe('formatDay', () => {
  it('shows weekday, month and day', () => {
    expect(formatDay('2026-11-27')).toBe('Fri, Nov 27');
  });
});

describe('formatDateRange', () => {
  it('formats a single day with weekday and year', () => {
    expect(formatDateRange('2026-11-27', '2026-11-27')).toBe('Fri, Nov 27, 2026');
  });

  it('treats a missing end date as a single day', () => {
    expect(formatDateRange('2026-11-27')).toBe('Fri, Nov 27, 2026');
  });

  it('shortens a range within one month', () => {
    expect(formatDateRange('2026-11-27', '2026-11-29')).toBe('Nov 27 – 29, 2026');
  });

  it('shows both months for a range across months', () => {
    expect(formatDateRange('2026-11-30', '2026-12-02')).toBe('Nov 30 – Dec 2, 2026');
  });

  it('shows both years for a range across years', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
  });

  it('returns an empty string when there is no date', () => {
    expect(formatDateRange('')).toBe('');
  });
});

describe('formatDateRangeShort', () => {
  const TODAY = '2026-10-25';

  it("drops the year for this year's dates", () => {
    expect(formatDateRangeShort('2026-10-28', '2026-10-28', TODAY)).toBe('Wed, Oct 28');
    expect(formatDateRangeShort('2026-11-13', '2026-11-15', TODAY)).toBe('Nov 13 – 15');
    expect(formatDateRangeShort('2026-11-30', '2026-12-02', TODAY)).toBe('Nov 30 – Dec 2');
  });

  it('keeps the year for other years', () => {
    expect(formatDateRangeShort('2027-04-15', '2027-04-18', TODAY)).toBe('Apr 15 – 18, 2027');
  });
});

describe('daysUntil and daysAwayLabel', () => {
  const TODAY = '2026-10-25';

  it('counts whole days, even across a daylight-saving change', () => {
    expect(daysUntil('2026-10-25', TODAY)).toBe(0);
    expect(daysUntil('2026-11-13', TODAY)).toBe(19);
    // US clocks fall back on Nov 1, 2026
    expect(daysUntil('2026-11-02', TODAY)).toBe(8);
    expect(daysUntil('2027-04-15', TODAY)).toBe(172);
    expect(daysUntil('2026-10-24', TODAY)).toBe(-1);
  });

  it('labels the timeline in plain words', () => {
    expect(daysAwayLabel('2026-10-25', TODAY)).toBe('Today');
    expect(daysAwayLabel('2026-10-26', TODAY)).toBe('Tomorrow');
    expect(daysAwayLabel('2026-11-13', TODAY)).toBe('19 days');
  });
});

describe('getEventStatus', () => {
  const event = { startDate: '2026-11-27', endDate: '2026-11-29' };

  it('is upcoming before the start date', () => {
    expect(getEventStatus(event, '2026-11-26')).toBe('upcoming');
  });

  it('is ongoing on the first and last day', () => {
    expect(getEventStatus(event, '2026-11-27')).toBe('ongoing');
    expect(getEventStatus(event, '2026-11-29')).toBe('ongoing');
  });

  it('is past the day after it ends', () => {
    expect(getEventStatus(event, '2026-11-30')).toBe('past');
  });
});

describe('defaultScheduleDay', () => {
  const event = { startDate: '2026-11-27', endDate: '2026-11-29' };

  it('opens on today while the event is running', () => {
    expect(defaultScheduleDay(event, '2026-11-28')).toBe('2026-11-28');
  });

  it('opens on the first day before or after the event', () => {
    expect(defaultScheduleDay(event, '2026-11-01')).toBe('2026-11-27');
    expect(defaultScheduleDay(event, '2026-12-15')).toBe('2026-11-27');
  });
});
