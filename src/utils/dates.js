// Date helpers for event dates stored as "YYYY-MM-DD" strings.
//
// Events are calendar days, not moments in time, so they carry no time zone.
// ISO date strings also sort and compare correctly as plain strings
// ("2026-11-27" < "2026-12-01"), so most checks below never build a Date.

const pad = (n) => String(n).padStart(2, '0');

// Local calendar date of a Date object as "YYYY-MM-DD"
export const toISODate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayISO = () => toISODate(new Date());

// Parse as local midnight. new Date("2026-11-27") would be UTC midnight,
// which is the previous evening in US time zones.
export const parseISODate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (iso, days) => {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

// Every day from start to end inclusive: ["2026-11-27", "2026-11-28", ...]
export const eachDay = (startDate, endDate) => {
  const days = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
};

const format = (iso, options) =>
  new Intl.DateTimeFormat('en-US', options).format(parseISODate(iso));

// "Fri, Nov 27"
export const formatDay = (iso) =>
  format(iso, { weekday: 'short', month: 'short', day: 'numeric' });

// One day:          "Fri, Nov 27, 2026"
// Same month:       "Nov 27 – 29, 2026"
// Same year:        "Nov 30 – Dec 2, 2026"
// Different years:  "Dec 30, 2026 – Jan 2, 2027"
export const formatDateRange = (startDate, endDate = startDate) => {
  if (!startDate) return '';
  if (startDate === endDate) {
    return format(startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  const [startYear, startMonth] = startDate.split('-');
  const [endYear, endMonth] = endDate.split('-');
  const endDay = Number(endDate.split('-')[2]);

  if (startYear !== endYear) {
    const full = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${format(startDate, full)} – ${format(endDate, full)}`;
  }
  const start = format(startDate, { month: 'short', day: 'numeric' });
  const end = startMonth === endMonth ? endDay : format(endDate, { month: 'short', day: 'numeric' });
  return `${start} – ${end}, ${startYear}`;
};

// The same without the year when it's this year, for tight rows:
// "Wed, Oct 28", "Nov 13 – 15", "Nov 30 – Dec 2"
export const formatDateRangeShort = (startDate, endDate = startDate, today = todayISO()) => {
  const thisYear = today.slice(0, 4);
  if (!startDate || startDate.slice(0, 4) !== thisYear || endDate.slice(0, 4) !== thisYear) {
    return formatDateRange(startDate, endDate);
  }
  if (startDate === endDate) return formatDay(startDate);
  const start = format(startDate, { month: 'short', day: 'numeric' });
  const sameMonth = startDate.slice(5, 7) === endDate.slice(5, 7);
  return `${start} – ${sameMonth ? Number(endDate.slice(8)) : format(endDate, { month: 'short', day: 'numeric' })}`;
};

// 'upcoming' | 'ongoing' | 'past' relative to today
export const getEventStatus = ({ startDate, endDate }, today = todayISO()) => {
  if (endDate < today) return 'past';
  if (startDate > today) return 'upcoming';
  return 'ongoing';
};

// Whole days from today to a date: 0 today, 1 tomorrow, negative if past.
// Rounded, since a daylight-saving change makes one day 23 or 25 hours.
export const daysUntil = (iso, today = todayISO()) =>
  Math.round((parseISODate(iso) - parseISODate(today)) / (24 * 60 * 60 * 1000));

// How far off a start date is, for the Home timeline: "Today",
// "Tomorrow", "19 days"
export const daysAwayLabel = (iso, today = todayISO()) => {
  const days = daysUntil(iso, today);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
};

// The day a schedule should open on: today while the event is running,
// otherwise its first day
export const defaultScheduleDay = (event, today = todayISO()) =>
  getEventStatus(event, today) === 'ongoing' ? today : event.startDate;
