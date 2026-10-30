// Where the phone is, as it moves. This is the one place that knows how
// positions are read:
// - In the iPhone/Android app, a native background plugin, which keeps
//   reporting with the screen locked or another app open. iOS shows its
//   blue location indicator while it runs; Android shows a notification.
// - In a browser, the standard geolocation API, which only reports while
//   EventBuddy is open on screen.
import { Capacitor, registerPlugin } from '@capacitor/core';

const LOCATION_OFF = 'Location is turned off for EventBuddy. Turn it on in Settings to share where you are.';
const NOT_FOUND = "Couldn't find your location. It'll keep trying.";

// From @capacitor-community/background-geolocation
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const startNativeTracking = ({ onPosition, onError }) => {
  let watcherId = null;
  let stopped = false;

  BackgroundGeolocation.addWatcher(
    {
      // Setting a message is what keeps updates coming in the background.
      // Android shows these in its notification while sharing.
      backgroundTitle: 'Sharing your location',
      backgroundMessage: 'Friends at your event can see where you are. Stop sharing in EventBuddy.',
      requestPermissions: true,
      // Only fresh positions: an old one would put you where you were
      stale: false,
      // Meters between updates. Small, so a walking friend's pin moves
      // every few steps; the app decides what's worth sending
      distanceFilter: 3
    },
    (location, error) => {
      if (stopped) return;
      if (error) {
        onError(error.code === 'NOT_AUTHORIZED' ? LOCATION_OFF : NOT_FOUND);
        return;
      }
      // measuredAt: when the phone took this fix, so the app can say how old
      // it is by the time it's sent. The plugin may leave the time out.
      onPosition({
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        measuredAt: location.time || Date.now()
      });
    }
  ).then((id) => {
    // Stopped before the watcher was ready: remove it right away
    if (stopped) BackgroundGeolocation.removeWatcher({ id });
    else watcherId = id;
  });

  return () => {
    stopped = true;
    if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId });
  };
};

const startBrowserTracking = ({ onPosition, onError }) => {
  if (!navigator.geolocation) {
    onError("This device can't share its location.");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) =>
      onPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, measuredAt: timestamp || Date.now() }),
    (err) => onError(err.code === 1 ? LOCATION_OFF : NOT_FOUND),
    // Precise this time: friends are finding you in a crowd, not a city.
    // A cached fix may be at most 2 s old, so a moving pin isn't fed old spots.
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 }
  );
  return () => navigator.geolocation.clearWatch(id);
};

// True in the iPhone/Android app, where sharing keeps going with the screen
// locked; false in a browser
export const tracksInBackground = Capacitor.isNativePlatform();

// Calls onPosition({ lat, lng, accuracy, measuredAt }) as the phone moves, and onError
// with a message if location isn't available. Returns a function that stops.
export const startTracking = (handlers) =>
  tracksInBackground ? startNativeTracking(handlers) : startBrowserTracking(handlers);
