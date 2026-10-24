import { payOptions, isMobileDevice } from './payLinks';

const all = { venmo: 'alex-smith', cashapp: 'alex', paypal: 'alexs', zelle: 'alex@example.com' };
const note = 'EventBuddy · Summer Music Festival';
const memo = encodeURIComponent(note);

describe('payOptions', () => {
  it('opens the Venmo app on phones with recipient, amount and note', () => {
    const [venmo] = payOptions({ venmo: 'alex-smith' }, 1360, note, { mobile: true });

    expect(venmo).toEqual({
      method: 'venmo',
      label: 'Venmo',
      handle: '@alex-smith',
      url: `venmo://paycharge?txn=pay&recipients=alex-smith&amount=13.60&note=${memo}`
    });
  });

  it('falls back to the Venmo website on computers', () => {
    const [venmo] = payOptions({ venmo: 'alex-smith' }, 1360, note, { mobile: false });

    expect(venmo.url).toBe(`https://venmo.com/alex-smith?txn=pay&amount=13.60&note=${memo}`);
  });

  it('builds Cash App and PayPal links with the amount', () => {
    const options = payOptions(all, 4000, note, { mobile: true });

    expect(options.find(o => o.method === 'cashapp')).toMatchObject({ handle: '$alex', url: 'https://cash.app/$alex/40.00' });
    expect(options.find(o => o.method === 'paypal')).toMatchObject({ handle: 'paypal.me/alexs', url: 'https://paypal.me/alexs/40.00USD' });
  });

  it('offers Zelle as something to copy, since it has no link', () => {
    const zelle = payOptions(all, 4000, note).find(o => o.method === 'zelle');

    expect(zelle).toEqual({ method: 'zelle', label: 'Zelle', handle: 'alex@example.com', copy: true });
  });

  it('lists only the methods the person has, in a fixed order', () => {
    expect(payOptions(all, 100, note).map(o => o.method)).toEqual(['venmo', 'cashapp', 'paypal', 'zelle']);
    expect(payOptions({ venmo: '', cashapp: '', paypal: 'alexs', zelle: '' }, 100, note).map(o => o.method)).toEqual(['paypal']);
  });

  it('returns nothing for someone without handles', () => {
    expect(payOptions(undefined, 100, note)).toEqual([]);
    expect(payOptions({ venmo: '', cashapp: '', paypal: '', zelle: '' }, 100, note)).toEqual([]);
  });

  it('always shows cents, so $5 is 5.00', () => {
    const [cash] = payOptions({ cashapp: 'alex' }, 500, note);
    expect(cash.url).toBe('https://cash.app/$alex/5.00');
  });
});

describe('isMobileDevice', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', false]
  ])('%s -> %s', (userAgent, expected) => {
    expect(isMobileDevice(userAgent)).toBe(expected);
  });
});
