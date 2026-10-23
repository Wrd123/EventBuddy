// Request validation. Mirrors the client's checks (CreateEvent's
// validateEvent, Register's form rules), because the client can be bypassed
// and the server is the real gatekeeper. Each returns the first problem as a
// user-facing message, or '' if valid.
const { ISO_DATE, TIME } = require('./models/Event');

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

const validateEventFields = ({ name, startDate, endDate }) => {
  if (!name) return 'Please enter an event name.';
  if (name.length > MAX_NAME_LENGTH) return `Event name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (!startDate) return 'Please choose a date.';
  if (!isRealDate(startDate)) return 'Please choose a valid date.';
  if (!endDate) return 'Please choose an end date.';
  if (!isRealDate(endDate)) return 'Please choose a valid end date.';
  if (endDate < startDate) return 'The end date must be on or after the start date.';
  return '';
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
  validateRegistration,
  text
};
