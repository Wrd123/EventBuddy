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
// Friends whose share hasn't run out. The server stops listing a share
// when it ends, but the map only reads now and then, so it checks too.
export const stillSharing = (people, now = Date.now()) =>
  people.filter((person) => new Date(person.until).getTime() > now);

// When the next of these shares runs out, or null when none will
export const nextShareEnd = (people, now = Date.now()) => {
  const ends = people.map((person) => new Date(person.until).getTime()).filter((end) => end > now);
  return ends.length > 0 ? Math.min(...ends) : null;
};

export const untilText = (until) =>
  `until ${new Date(until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

// A link that opens directions in the phone's maps app (Google Maps on the
// web and Android; iPhones offer to open it in Apple or Google Maps). to is
// a point { lat, lng }, or an address like "Piedmont Park, Atlanta, GA",
// which finds a venue better than its pin, a city-level guess at times.
export const directionsUrl = (to) =>
  `https://www.google.com/maps/dir/?api=1&destination=${
    typeof to === 'string' ? encodeURIComponent(to) : `${to.lat},${to.lng}`
  }`;
