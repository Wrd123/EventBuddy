// Schedule item helpers. Times are "HH:MM" (24-hour) strings, as stored by
// the API and produced by <input type="time">.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TEXT_LENGTH = 80;

// "14:00" -> "2:00 PM". Built by hand rather than with Intl, which puts a
// narrow no-break space before AM/PM in some browsers and Node versions.
export const formatTime = (time) => {
  if (!TIME.test(time || '')) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
};

// "2:00 PM – 3:30 PM", or just "2:00 PM" with no end time
export const formatTimeRange = (startTime, endTime) =>
  endTime ? `${formatTime(startTime)} – ${formatTime(endTime)}` : formatTime(startTime);

// By day, then start time. "HH:MM" and "YYYY-MM-DD" compare correctly as text.
export const sortSchedule = (items) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

export const isGoing = (item, userId) =>
  item.attendees.some((attendee) => attendee.user === userId);

// Mirrors the server's validateScheduleItem so the form can explain problems
// before sending. Returns the first problem, or '' if valid.
export const validateScheduleItem = ({ date, startTime, endTime, activity, location }, event) => {
  if (!activity) return "Please enter what's happening.";
  if (activity.length > MAX_TEXT_LENGTH) return `Activity must be ${MAX_TEXT_LENGTH} characters or fewer.`;
  if (!date) return 'Please choose a day.';
  if (date < event.startDate || date > event.endDate) return 'Please choose a day during the event.';
  if (!startTime) return 'Please choose a start time.';
  if (!TIME.test(startTime)) return 'Please choose a valid start time.';
  if (endTime && !TIME.test(endTime)) return 'Please choose a valid end time.';
  if (endTime && endTime <= startTime) return 'The end time must be after the start time.';
  if (location.length > MAX_TEXT_LENGTH) return `Location must be ${MAX_TEXT_LENGTH} characters or fewer.`;
  return '';
};
