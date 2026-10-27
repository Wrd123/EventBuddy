// Math for the pull-to-refresh gesture, kept apart from the touch handling so
// it can be tested without a DOM.

// How far the content has to be pulled down before letting go refreshes
export const PULL_THRESHOLD = 64;
// The content never travels further than this, however far the finger goes
export const PULL_MAX = 96;
// Bigger means the pull stays closer to the finger for longer. With 110 the
// threshold is crossed at about 120px of finger travel, a comfortable thumb
// stroke on a phone.
const STIFFNESS = 110;

// Turns how far the finger has moved down into how far the content moves.
// It starts nearly one-to-one and eases off toward PULL_MAX like a stretched
// rubber band, so the pull feels heavier the further you go.
export const pullDistance = (dy) => {
  if (!(dy > 0)) return 0;
  return PULL_MAX * (1 - Math.exp(-dy / STIFFNESS));
};

// 0 at rest, 1 once the pull is far enough to refresh. Drives the ring.
export const pullProgress = (distance) => {
  if (!(distance > 0)) return 0;
  return Math.min(1, distance / PULL_THRESHOLD);
};
