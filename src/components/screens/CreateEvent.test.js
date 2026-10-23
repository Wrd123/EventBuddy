import { validateEvent, MAX_NAME_LENGTH } from './CreateEvent';

describe('validateEvent', () => {
  const valid = { name: 'Friendsgiving', date: 'Nov 27, 2026', location: '' };

  it('accepts a name and date with no location', () => {
    expect(validateEvent(valid)).toBe('');
  });

  it('requires a name', () => {
    expect(validateEvent({ ...valid, name: '' })).toBe('Please enter an event name.');
  });

  it('accepts a name at exactly the maximum length', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH);
    expect(validateEvent({ ...valid, name })).toBe('');
  });

  it('rejects a name one character over the maximum', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateEvent({ ...valid, name })).toBe('Event name must be 60 characters or fewer.');
  });

  it('requires a date', () => {
    expect(validateEvent({ ...valid, date: '' })).toBe('Please enter a date.');
  });

  it('reports only the first problem when several fields are missing', () => {
    expect(validateEvent({ name: '', date: '' })).toBe('Please enter an event name.');
  });

  // validateEvent expects trimmed input; handleSubmit is responsible for
  // trimming. If this starts failing, the contract changed on purpose.
  it('does not trim on its own', () => {
    expect(validateEvent({ ...valid, name: '   ' })).toBe('');
  });
});
