const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { isRealDate, earliestTodayAnywhere, validateNewEvent } = require('../src/validation');

describe('isRealDate', () => {
  for (const date of ['2026-11-27', '2028-02-29']) {
    it(`accepts ${date}`, () => assert.equal(isRealDate(date), true));
  }

  for (const date of ['2026-02-30', '2027-02-29', '2026-13-01', '11/27/2026', '', undefined]) {
    it(`rejects ${JSON.stringify(date)}`, () => assert.equal(isRealDate(date), false));
  }
});

describe('earliestTodayAnywhere', () => {
  it('is the previous day early in the UTC day', () => {
    assert.equal(earliestTodayAnywhere(new Date('2026-10-23T02:00:00Z')), '2026-10-22');
  });

  it('is the same day from noon UTC on', () => {
    assert.equal(earliestTodayAnywhere(new Date('2026-10-23T12:00:00Z')), '2026-10-23');
  });
});

describe('validateNewEvent "today" across time zones', () => {
  // 9:30pm on Oct 22 in Atlanta is 01:30 on Oct 23 in UTC, where the server runs
  const nineThirtyPmInAtlanta = new Date('2026-10-23T01:30:00Z');
  const event = { name: 'Late plan', startDate: '2026-10-22', endDate: '2026-10-22' };

  it("accepts an event for the user's local today even when UTC has moved on", () => {
    assert.equal(validateNewEvent(event, nineThirtyPmInAtlanta), '');
  });

  it('still rejects a date that is past everywhere', () => {
    assert.equal(
      validateNewEvent({ ...event, startDate: '2026-10-20', endDate: '2026-10-20' }, nineThirtyPmInAtlanta),
      "The event can't start in the past."
    );
  });
});
