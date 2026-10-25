import React, { useState } from 'react';
import EventArt from './EventArt';
import { coverPhotoFor, coverPhotoUrl } from '../../utils/coverPhotos';

// An event's cover photo: its Ticketmaster artwork when it has some,
// otherwise its turn in its type's photos (see coverPhotos.js). If the
// photo can't load, say offline, EventBuddy's illustrated cover stands in.
// width is the photo's rendered width in CSS pixels, so small thumbnails
// don't download big photos. The picture is cropped to fill whatever box
// className gives it, and is decorative since the name is always beside it.
const EventCover = ({ event, width = 400, className = '' }) => {
  const src = event.imageUrl || coverPhotoUrl(coverPhotoFor(event), width);
  // Remembers which URL failed, so a new one gets its own chance
  const [failedSrc, setFailedSrc] = useState(null);

  if (failedSrc === src) {
    return <EventArt type={event.type} seed={event._id} className={className} />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`${className} object-cover bg-raised`}
    />
  );
};

export default EventCover;
