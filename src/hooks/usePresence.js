import { useEffect, useMemo, useState } from 'react';
import * as realtime from '../services/realtime';
import { useAppContext } from '../context/AppContext';

// The other members of an event who have the app open right now, as a Set
// of user ids. Empty while the real-time socket isn't connected: a missing
// dot is better than one that may be out of date. eventId may be null.
export const usePresence = (eventId) => {
  const { currentUser } = useAppContext();
  const [ids, setIds] = useState(() => (eventId ? realtime.presenceOf(eventId) : []));

  useEffect(() => {
    if (!eventId) {
      setIds([]);
      return undefined;
    }
    // Its own watch keeps the event subscribed while a screen shows who's
    // here; presence arrives with the subscription, not as a poke
    const unwatch = realtime.watch(eventId, 'presence', () => {});
    const read = () => setIds(realtime.presenceOf(eventId));
    const unlisten = realtime.onStatus(read);
    read();
    return () => {
      unwatch();
      unlisten();
    };
  }, [eventId]);

  const me = currentUser?._id;
  const key = ids.filter((id) => id !== me).sort().join(',');
  return useMemo(() => new Set(key ? key.split(',') : []), [key]);
};
