// Money is whole cents everywhere (as the API stores it); dollars only
// appear when showing or typing amounts.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// 123456 -> "$1,234.56"
export const formatCents = (cents) => usd.format(cents / 100);

// What someone typed -> cents, or null if it isn't a valid amount.
// Accepts "12", "12.5", "12.50", "$1,234.56". Parsed as text rather than
// with parseFloat, so "0.29" is exactly 29 cents (0.29 * 100 is 28.999...).
export const parseDollars = (input) => {
  const match = String(input).trim().match(/^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const dollars = Number(match[1].replace(/,/g, ''));
  const cents = Number((match[2] || '').padEnd(2, '0'));
  return dollars * 100 + cents;
};

// 1250 -> "12.50", for prefilling an amount field
export const centsToInput = (cents) => (cents / 100).toFixed(2);

// Splits evenly among userIds; leftover cents go to the first people, so
// the shares always add up to exactly the total ($100 / 3 = 33.34 + 33.33 + 33.33)
export const splitEqually = (amountCents, userIds) => {
  if (userIds.length === 0) return [];
  const base = Math.floor(amountCents / userIds.length);
  const extra = amountCents % userIds.length;
  return userIds.map((user, i) => ({ user, amountCents: base + (i < extra ? 1 : 0) }));
};
