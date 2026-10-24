import React, { useState } from 'react';
import EventArt from './EventArt';

// An event's cover: its Ticketmaster artwork when there is some, otherwise
// (or if the picture fails to load) EventBuddy's illustrated cover. The
// picture is cropped to fill whatever box className gives it. Decorative,
// since the event's name is always shown beside it.
const EventCover = ({ imageUrl, type, seed, className = '' }) => {
  // Remembers which URL failed, so a new imageUrl gets its own chance
  const [failedUrl, setFailedUrl] = useState(null);

  if (!imageUrl || failedUrl === imageUrl) {
    return <EventArt type={type} seed={seed} className={className} />;
  }
  return (
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(imageUrl)}
      className={`${className} object-cover bg-raised`}
    />
  );
};

export default EventCover;
