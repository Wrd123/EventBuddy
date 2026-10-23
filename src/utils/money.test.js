import { formatCents, parseDollars, centsToInput, splitEqually } from './money';

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [12050, '$120.50'],
    [123456, '$1,234.56'],
    [-4000, '-$40.00']
  ])('formats %d as %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});

describe('parseDollars', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.29', 29],
    ['$1,234.56', 123456],
    [' 40 ', 4000],
    ['1000000', 100000000]
  ])('parses %j as %d cents', (input, cents) => {
    expect(parseDollars(input)).toBe(cents);
  });

  it.each(['', 'abc', '12.345', '-5', '1,23', '12.', '.5', '1e3'])('rejects %j', (input) => {
    expect(parseDollars(input)).toBeNull();
  });
});

describe('centsToInput', () => {
  it('formats cents for an input field', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(29)).toBe('0.29');
  });
});

describe('splitEqually', () => {
  it('splits evenly when it divides', () => {
    expect(splitEqually(10000, ['a', 'b'])).toEqual([
      { user: 'a', amountCents: 5000 },
      { user: 'b', amountCents: 5000 }
    ]);
  });

  it('gives leftover cents to the first people, adding up exactly', () => {
    const shares = splitEqually(10000, ['a', 'b', 'c']);

    expect(shares.map(s => s.amountCents)).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(10000);
  });

  it('returns no shares for no people', () => {
    expect(splitEqually(1000, [])).toEqual([]);
  });
});
