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

// 'upcoming' | 'ongoing' | 'past' relative to today
export const getEventStatus = ({ startDate, endDate }, today = todayISO()) => {
  if (endDate < today) return 'past';
  if (startDate > today) return 'upcoming';
  return 'ongoing';
};

// The day a schedule should open on: today while the event is running,
// otherwise its first day
export const defaultScheduleDay = (event, today = todayISO()) =>
  getEventStatus(event, today) === 'ongoing' ? today : event.startDate;
