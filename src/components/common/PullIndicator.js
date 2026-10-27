import React from 'react';

const SIZE = 32;
const RADIUS = 12;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FAILED_MESSAGE = "Couldn't refresh. Check your connection.";

// The ring that fills as you pull down, spins while refreshing, and the short
// message if the refresh failed. While you drag, usePullToRefresh moves and
// fills the ring straight on the DOM through ringRef and arcRef: re-rendering
// the whole screen on every touchmove would be wasteful. React only decides
// whether it spins and which message shows.
const PullIndicator = ({ ringRef, arcRef, refreshing, failed, spin, messageTop = 0 }) => (
  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
    <div
      ref={ringRef}
      className="absolute top-0 flex items-center justify-center rounded-full border border-line bg-surface shadow-lg"
      style={{ width: SIZE, height: SIZE, opacity: 0, transform: `translateY(-${SIZE}px)` }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className={refreshing && spin ? 'animate-spin' : undefined}
      >
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth="3" stroke="currentColor" className="text-line" />
        <circle
          ref={arcRef}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          stroke="currentColor"
          className="text-accent"
          strokeDasharray={`0 ${RING_CIRCUMFERENCE}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
    </div>
    {/* Always there, so screen readers notice when its text changes. A live
        region that appears with its text already in it is often skipped. */}
    <span role="status" className="sr-only">
      {refreshing ? 'Refreshing' : failed ? FAILED_MESSAGE : ''}
    </span>
    {failed && (
      <p aria-hidden="true" style={{ marginTop: 8 + messageTop }} className="rounded-full border border-line bg-raised px-3 py-1.5 text-sm text-fg shadow-lg">
        {FAILED_MESSAGE}
      </p>
    )}
  </div>
);

export default PullIndicator;
