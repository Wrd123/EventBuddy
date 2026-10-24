// Request validation. Mirrors the client's checks (CreateEvent's
// validateEvent, Register's form rules), because the client can be bypassed
// and the server is the real gatekeeper. Each returns the first problem as a
// user-facing message, or '' if valid.
const { ISO_DATE, TIME } = require('./models/Event');
const { MAX_CENTS } = require('./models/Expense');

const MAX_NAME_LENGTH = 60;
const MAX_ACTIVITY_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 6;
// bcrypt only uses the first 72 bytes of a password; longer ones would
// silently match on just their prefix
const MAX_PASSWORD_BYTES = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_.]{3,30}$/i;

// "2026-02-30" matches the pattern but isn't a real day
const isRealDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// The server runs on UTC, but users pick dates in their own time zone. At
// 9pm in Atlanta it's already tomorrow in UTC, so "today" there would look
// like the past here. The earliest calendar date anywhere (UTC-12) is the
// safe cutoff for "not in the past".
const earliestTodayAnywhere = (now = new Date()) =>
  new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);

const validateEventFields = ({ name, startDate, endDate, ticketUrl = '' }) => {
  if (!name) return 'Please enter an event name.';
  if (name.length > MAX_NAME_LENGTH) return `Event name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (!startDate) return 'Please choose a date.';
  if (!isRealDate(startDate)) return 'Please choose a valid date.';
  if (!endDate) return 'Please choose an end date.';
  if (!isRealDate(endDate)) return 'Please choose a valid end date.';
  if (endDate < startDate) return 'The end date must be on or after the start date.';
  if (!isTicketUrl(ticketUrl)) return 'The ticket link must be an https:// address.';
  return '';
};

// '' or an https link (tickets come from Ticketmaster and similar sites)
const isTicketUrl = (value) => {
  if (value === '') return true;
  try {
    return new URL(value).protocol === 'https:' && value.length <= 500;
  } catch {
    return false;
  }
};

const validateNewEvent = (fields, now = new Date()) => {
  const error = validateEventFields(fields);
  if (error) return error;
  if (fields.startDate < earliestTodayAnywhere(now)) return "The event can't start in the past.";
  return '';
};

// event: the event the item belongs to, for its date range.
// Items can't run past midnight yet; the end must be after the start.
const validateScheduleItem = ({ date, startTime, endTime, activity, location }, event) => {
  if (!activity) return "Please enter what's happening.";
  if (activity.length > MAX_ACTIVITY_LENGTH) {
    return `Activity must be ${MAX_ACTIVITY_LENGTH} characters or fewer.`;
  }
  if (!isRealDate(date)) return 'Please choose a day.';
  if (date < event.startDate || date > event.endDate) return 'Please choose a day during the event.';
  if (!startTime) return 'Please choose a start time.';
  if (!TIME.test(startTime)) return 'Please choose a valid start time.';
  if (endTime && !TIME.test(endTime)) return 'Please choose a valid end time.';
  if (endTime && endTime <= startTime) return 'The end time must be after the start time.';
  if (location.length > MAX_ACTIVITY_LENGTH) {
    return `Location must be ${MAX_ACTIVITY_LENGTH} characters or fewer.`;
  }
  return '';
};

const OBJECT_ID = /^[0-9a-f]{24}$/;

// Whether a user id (as sent by the client) belongs to a member of the event
const isMember = (event, userId) =>
  typeof userId === 'string' && OBJECT_ID.test(userId) && event.members.some((m) => m.user.equals(userId));

const validateCents = (cents, what) => {
  if (!Number.isInteger(cents) || cents <= 0) return `Please enter ${what} over $0.`;
  if (cents > MAX_CENTS) return 'That amount is too large.';
  return '';
};

// shares: [{ user, amountCents }]. They must cover exactly the total, so the
// group's balances always add up to zero.
const validateExpense = ({ description, amountCents, date, paidBy, splitType, shares }, event) => {
  if (!description) return 'Please describe the expense.';
  if (description.length > MAX_ACTIVITY_LENGTH) return `Description must be ${MAX_ACTIVITY_LENGTH} characters or fewer.`;
  const amountError = validateCents(amountCents, 'an amount');
  if (amountError) return amountError;
  if (!isRealDate(date)) return 'Please choose a date.';
  if (!isMember(event, paidBy)) return 'The person who paid must be in the event.';
  if (!['equal', 'exact'].includes(splitType)) return 'Please choose how to split it.';
  if (!Array.isArray(shares) || shares.length === 0) return 'Please choose who to split it with.';

  const seen = new Set();
  let total = 0;
  for (const share of shares) {
    if (!share || !isMember(event, share.user)) return 'Everyone in the split must be in the event.';
    if (seen.has(share.user)) return 'Each person can only appear once in the split.';
    seen.add(share.user);
    if (!Number.isInteger(share.amountCents) || share.amountCents < 0) return 'Split amounts must be $0 or more.';
    total += share.amountCents;
  }
  if (total !== amountCents) return 'The split must add up to the total.';
  return '';
};

// me: the logged-in user, who must be one side of the payment
const validatePayment = ({ from, to, amountCents, date }, event, me) => {
  if (!isMember(event, from) || !isMember(event, to)) return 'Both people must be in the event.';
  if (from === to) return 'A payment needs two different people.';
  if (!me._id.equals(from) && !me._id.equals(to)) return 'You can only record payments you made or received.';
  const amountError = validateCents(amountCents, 'an amount');
  if (amountError) return amountError;
  if (!isRealDate(date)) return 'Please choose a date.';
  return '';
};

// Payment handles, cleaned up the way people paste them, then checked
// against each service's username rules. '' clears a handle.
const PAYMENT_HANDLES = {
  venmo: {
    clean: (v) => v.replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, ''),
    valid: /^[A-Za-z0-9_-]{5,30}$/,
    message: 'Venmo usernames are 5-30 letters, numbers, dashes or underscores.'
  },
  cashapp: {
    clean: (v) => v.replace(/^(https?:\/\/)?(www\.)?cash\.app\//i, '').replace(/^\$/, ''),
    // 1-20 characters with at least one letter
    valid: /^(?=.*[A-Za-z])[A-Za-z0-9_]{1,20}$/,
    message: 'Cash App $cashtags are up to 20 letters, numbers or underscores.'
  },
  paypal: {
    clean: (v) => v.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/\/$/, ''),
    valid: /^[A-Za-z0-9]{1,20}$/,
    message: 'PayPal.Me names are up to 20 letters or numbers.'
  },
  zelle: {
    clean: (v) => v,
    // An email, or a US phone number in any common format
    valid: /^([^\s@]+@[^\s@]+\.[^\s@]+|\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})$/,
    message: 'For Zelle, enter the email or US phone number your bank uses.'
  }
};

// input: { venmo?, cashapp?, paypal?, zelle? } -> { handles } or { error }.
// Only the keys sent are returned, so a request can update one handle.
const cleanPaymentHandles = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid payment info.' };
  const handles = {};
  for (const [service, rules] of Object.entries(PAYMENT_HANDLES)) {
    if (!(service in input)) continue;
    const value = rules.clean(text(input[service]));
    if (value && !rules.valid.test(value)) return { error: rules.message };
    handles[service] = value;
  }
  return { handles };
};

const validateRegistration = ({ email, username, password }) => {
  if (!email || !EMAIL.test(email)) return 'Please enter a valid email address.';
  if (!username || !USERNAME.test(username)) {
    return 'Username must be 3-30 letters, numbers, dots or underscores.';
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return 'Password is too long.';
  return '';
};

// Trimmed string, or '' for anything that isn't a string
const text = (value) => (typeof value === 'string' ? value.trim() : '');

module.exports = {
  MAX_NAME_LENGTH,
  isRealDate,
  earliestTodayAnywhere,
  validateEventFields,
  validateNewEvent,
  validateScheduleItem,
  validateExpense,
  validatePayment,
  isMember,
  cleanPaymentHandles,
  validateRegistration,
  text
};
