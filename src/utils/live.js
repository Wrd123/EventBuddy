// Small helpers for live locations

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// After this long without an update, a friend's pin fades: they may have
// moved since. Positions now arrive every couple of seconds while someone
// moves, so two quiet minutes already means something.
export const STALE_AFTER_MS = 2 * MINUTE;

// Under this, a position is as fresh as it gets, and counting seconds would
// only flicker
const JUST_NOW_MS = 5 * SECOND;

// "just now", "8 s ago", "4 min ago", "1 hr ago"
export const agoText = (when, now = Date.now()) => {
  const elapsed = now - new Date(when).getTime();
  if (elapsed < JUST_NOW_MS) return 'just now';
  if (elapsed < MINUTE) return `${Math.floor(elapsed / SECOND)} s ago`;
  const minutes = Math.floor(elapsed / MINUTE);
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

// How often a position goes to friends while you move. A walking friend
// needs a fresh point every couple of seconds for the map to follow them;
// it's a target, since a slow connection or a locked phone can delay it.
export const SEND_EVERY_MS = 2000;
// With the app out of sight, a longer target saves battery and data: nobody
// is watching the pin move that closely from a locked phone
export const SEND_EVERY_HIDDEN_MS = 10000;
// Moving less than this isn't movement; it's the GPS wobbling
export const MIN_MOVE_METERS = 3;
// A fix's accuracy raises that bar, but only this far: indoors or in a
// browser a fix can be 40 m out, and waiting for 40 m of walking would
// leave a friend's pin behind for half a minute
const MAX_MOVE_METERS = 15;
// Standing still, a new fix still goes out this often, so friends can see
// you're there and the share hasn't gone quiet
export const SEND_AT_LEAST_EVERY_MS = 2 * MINUTE;

// Waits after a failed upload, in turn, never longer than the last
const BACKOFF_MS = [4000, 8000, 16000, 30000];

// Whether this fix is far enough from the last one sent to count as moving.
// A fix is only a guess within its accuracy radius, so a still phone whose
// readings drift inside that circle would otherwise look like it was walking
// and send every couple of seconds for nothing.
export const hasMoved = (fix, lastSent) =>
  metersBetween(fix, lastSent) >= Math.max(MIN_MOVE_METERS, Math.min(fix.accuracy || 0, MAX_MOVE_METERS));

// What to do with the newest fix: { send: true } now, { dueAt } (a time in
// ms) when it should go once the interval is up, or { send: false }.
// lastSent: { lat, lng, accuracy, at, measuredAt } of the last upload that
// worked. fix.measuredAt is when the phone took the fix, versus lastSent.at,
// when it was sent.
export const nextSend = ({ fix, lastSent, now, hidden }) => {
  if (!lastSent) return { send: true };
  if (hasMoved(fix, lastSent)) {
    // Moving: keep to the pace, so a burst of fixes doesn't become a burst
    // of requests (the newest one waits for its turn)
    const dueAt = lastSent.at + (hidden ? SEND_EVERY_HIDDEN_MS : SEND_EVERY_MS);
    return now >= dueAt ? { send: true } : { dueAt };
  }
  // Still: only a fix the server hasn't seen, so a heartbeat never repeats
  // an old spot as if it were new. With no new fix, friends' "updated … ago"
  // keeps growing, which is the truth.
  // A still phone may get no more location callbacks, so a new fix waits
  // for its heartbeat on a timer rather than for one.
  if ((fix.measuredAt ?? 0) <= (lastSent.measuredAt ?? 0)) return { send: false };
  const dueAt = lastSent.at + SEND_AT_LEAST_EVERY_MS;
  return now >= dueAt ? { send: true } : { dueAt };
};

// How long to wait after the nth failure in a row (1 for the first). A
// server that asked us to wait (429 Retry-After) is obeyed when that's
// longer, so we never hammer something that's already struggling.
export const backoffMs = (failures, retryAfterSeconds) => {
  const wait = BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1];
  return Math.max(wait, (retryAfterSeconds || 0) * 1000);
};

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

// The server's list of who's sharing, with one guard: a read that was
// answered a moment ago can land after a newer one, and showing an older
// fix would pull a pin backwards. The server's list is the truth for who is
// there and for everything but the spot; the spot stays the newer one, but
// only for the same share. A restarted share (a new id) starts fresh.
export const mergePositions = (prevPeople, nextPeople) => {
  const before = new Map(prevPeople.map((person) => [person.user, person]));
  return nextPeople.map((person) => {
    const old = before.get(person.user);
    const newer = old && old.share && old.share === person.share
      && new Date(old.positionAt).getTime() > new Date(person.positionAt).getTime();
    if (!newer) return person;
    return { ...person, lat: old.lat, lng: old.lng, accuracy: old.accuracy, positionAt: old.positionAt };
  });
};

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
