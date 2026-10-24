import React from 'react';

// Full-screen spinner for a screen that is still loading its data
const ScreenLoader = () => (
  <div className="flex h-full items-center justify-center bg-night">
    <div className="w-10 h-10 border-4 border-violet border-t-transparent rounded-full animate-spin" aria-label="Loading"></div>
  </div>
);

export default ScreenLoader;
