import React from 'react';

// One block of a loading outline. The caller sets its size and shape with
// className (h-4 w-32 rounded-full, ...); the .skeleton class gives it the
// soft fill and the highlight that sweeps across.
export const Skeleton = ({ className = '' }) => <div className={`skeleton ${className}`} />;

// Wraps a screen's loading outline. Screen readers hear one sentence from
// the label instead of dozens of empty blocks, so the blocks are hidden.
export const SkeletonScreen = ({ label, className = '', children }) => (
  <div role="status" aria-busy="true" aria-label={label} className={className}>
    <div aria-hidden="true">{children}</div>
  </div>
);

export default Skeleton;
