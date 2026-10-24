// Small helpers for live locations

const MINUTE = 60 * 1000;

// After this long without an update, a friend's pin fades: they may have
// moved since
export const STALE_AFTER_MS = 10 * MINUTE;

// "just now", "4 min ago", "1 hr ago"
export const agoText = (when, now = Date.now()) => {
  const minutes = Math.floor((now - new Date(when).getTime()) / MINUTE);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
};

export const isStale = (when, now = Date.now()) => now - new Date(when).getTime() > STALE_AFTER_MS;

// Distance in meters between two { lat, lng } (haversine)
export const metersBetween = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

// Send a new position after moving this far, or after this long anyway,
// so friends see you move without draining the battery
export const SEND_AFTER_METERS = 25;
export const SEND_AT_LEAST_EVERY_MS = 2 * MINUTE;

export const shouldSend = (position, lastSent, now = Date.now()) =>
  !lastSent ||
  now - lastSent.at >= SEND_AT_LEAST_EVERY_MS ||
  metersBetween(position, lastSent) >= SEND_AFTER_METERS;

// The choices for how long to share, as end times from now. "Until
// midnight" only when that's at least an hour away.
export const shareDurations = (now = new Date()) => {
  const hours = (n) => new Date(now.getTime() + n * 60 * MINUTE);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const options = [
    { label: '1 hour', until: hours(1) },
    { label: '3 hours', until: hours(3) }
  ];
  if (midnight - now >= 60 * MINUTE) options.push({ label: 'Until midnight', until: midnight });
  return options;
};

// "until 9:30 PM"
export const untilText = (until) =>
  `until ${new Date(until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

// A link that opens directions in the phone's maps app (Google Maps on the
// web and Android; iPhones offer to open it in Apple or Google Maps)
export const directionsUrl = ({ lat, lng }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
