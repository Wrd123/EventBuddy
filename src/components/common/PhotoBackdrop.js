import React, { useState } from 'react';
import { eventPhotoUrl } from '../../utils/coverPhotos';

// The Afterglow light: an event's photo, blown up and blurred behind the
// whole screen, so each screen takes its colors from what it's about. Cards
// on top are plain tinted glass and get their frosted look from this one
// blurred layer. A tiny version of the photo is enough, since blur hides the
// detail, and it fades in once loaded. Without an event (or until the photo
// arrives) the night background's ambient glow shows through. With Reduce
// Transparency on, the photo is hidden in index.css and only the glow shows.
const PhotoBackdrop = ({ event }) => {
  const src = event ? eventPhotoUrl(event, 48) : null;
  const [loadedSrc, setLoadedSrc] = useState(null);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {src && (
        <img
          src={src}
          alt=""
          onLoad={() => setLoadedSrc(src)}
          className={`photo-backdrop absolute -inset-24 w-[calc(100%+12rem)] h-[calc(100%+12rem)] max-w-none object-cover blur-[56px] saturate-[1.6] transition-opacity duration-700 [transform:translateZ(0)] ${
            loadedSrc === src ? 'opacity-70' : 'opacity-0'
          }`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-night/20 via-night/65 to-night" />
    </div>
  );
};

// Behind every screen: a faint sunset glow in one corner and plum in the
// other, so screens without a photo still feel lit
export const AmbientGlow = () => (
  <div
    className="absolute inset-0 pointer-events-none"
    aria-hidden="true"
    style={{
      background:
        'radial-gradient(70% 45% at 100% 0%, rgba(255, 143, 94, 0.16), transparent 70%),' +
        'radial-gradient(60% 40% at 0% 8%, rgba(124, 58, 237, 0.22), transparent 70%)'
    }}
  />
);

export default PhotoBackdrop;
