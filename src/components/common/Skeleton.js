import React from 'react';

// One block of a loading outline. The caller sets its size and shape with
// className (h-4 w-32 rounded-full, ...); the .skeleton class gives it the
// soft fill and the highlight that sweeps across.
export const Skeleton = ({ className = '' }) => <div className={`skeleton ${className}`} />;

// Wraps a screen's loading outline. Screen readers hear one sentence instead
// of dozens of empty blocks, so the blocks are hidden. The sentence is text
// inside the region, not an aria-label: live regions announce their
// contents, not their label. No aria-busy: on the region itself it tells
// screen readers to hold the announcement until loading ends, and by then
// the region is gone.
export const SkeletonScreen = ({ label, className = '', children }) => (
  <div role="status" aria-label={label} className={className}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>
);

export default Skeleton;
