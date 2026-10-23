import { validateEvent, MAX_NAME_LENGTH } from './CreateEvent';

// A fixed "today" keeps these tests from depending on when they run
const TODAY = '2026-10-22';

const validate = (overrides) => validateEvent({ ...valid, ...overrides }, TODAY);

const valid = {
  name: 'Friendsgiving',
  startDate: '2026-11-27',
  endDate: '2026-11-27',
  location: ''
};

describe('validateEvent', () => {
  it('accepts a single-day event with no location', () => {
    expect(validate({})).toBe('');
  });

  it('accepts a multi-day event', () => {
    expect(validate({ endDate: '2026-11-29' })).toBe('');
  });

  it('requires a name', () => {
    expect(validate({ name: '' })).toBe('Please enter an event name.');
  });

  it('accepts a name at exactly the maximum length', () => {
    expect(validate({ name: 'a'.repeat(MAX_NAME_LENGTH) })).toBe('');
  });

  it('rejects a name one character over the maximum', () => {
    expect(validate({ name: 'a'.repeat(MAX_NAME_LENGTH + 1) }))
      .toBe('Event name must be 60 characters or fewer.');
  });

  it('requires a start date', () => {
    expect(validate({ startDate: '' })).toBe('Please choose a date.');
  });

  it('accepts an event starting today', () => {
    expect(validate({ startDate: TODAY, endDate: TODAY })).toBe('');
  });

  it('rejects an event starting in the past', () => {
    expect(validate({ startDate: '2026-10-21', endDate: '2026-10-21' }))
      .toBe("The event can't start in the past.");
  });

  it('requires an end date', () => {
    expect(validate({ endDate: '' })).toBe('Please choose an end date.');
  });

  it('rejects an end date before the start date', () => {
    expect(validate({ endDate: '2026-11-26' }))
      .toBe('The end date must be on or after the start date.');
  });

  it('reports only the first problem when several fields are missing', () => {
    expect(validate({ name: '', startDate: '', endDate: '' })).toBe('Please enter an event name.');
  });

  // validateEvent expects trimmed input; handleSubmit is responsible for
  // trimming. If this starts failing, the contract changed on purpose.
  it('does not trim on its own', () => {
    expect(validate({ name: '   ' })).toBe('');
  });
});
