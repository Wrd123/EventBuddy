// Moving a pin smoothly between the real points a friend's phone sent

// The longest a pin takes to cross to its next point. Points come about
// every 2 s, so this keeps it moving at walking pace and ready for the next.
export const GLIDE_MAX_MS = 3000;
// After a longer silence than this, the friend may have gone anywhere, and
// a pin sliding across the map would show a trip that didn't happen. It sits
// above the 10 s fallback poll (LIVE_POLL_MS), so with the socket down,
// updates that arrive by polling still glide instead of alternating with jumps.
export const SNAP_AFTER_MS = 15000;

// How long to glide from one fix to the next, by the time between when the
// two were measured. 0 means jump: there's no earlier fix, or the gap is too
// long, negative (fixes out of order) or not a time at all.
export const glideDuration = (prevFixAt, nextFixAt) => {
  if (!Number.isFinite(prevFixAt) || !Number.isFinite(nextFixAt)) return 0;
  const gap = nextFixAt - prevFixAt;
  if (!(gap > 0) || gap > SNAP_AFTER_MS) return 0;
  return Math.min(gap, GLIDE_MAX_MS);
};

// Where a glide has got to: { lat, lng } between from and to. Linear, so the
// pin keeps a steady speed rather than slowing to a stop before every next
// point. Never goes past `to`.
export const pointAt = (from, to, startedAt, duration, now) => {
  if (!(duration > 0)) return { lat: to.lat, lng: to.lng };
  const t = Math.min(1, Math.max(0, (now - startedAt) / duration));
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
};
