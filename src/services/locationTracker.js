// Where the phone is, as it moves. This is the one place that knows how
// positions are read, so the native app can swap in background tracking
// (which keeps going with the screen locked) without changing anything that
// uses it. In a browser, positions only arrive while EventBuddy is open.

// Calls onPosition({ lat, lng, accuracy }) as the phone moves, and onError
// with a message if location isn't available. Returns a function that stops.
export const startTracking = ({ onPosition, onError }) => {
  if (!navigator.geolocation) {
    onError("This device can't share its location.");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    ({ coords }) => onPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
    (err) => onError(
      err.code === 1
        ? 'Location is turned off for EventBuddy. Turn it on in Settings to share where you are.'
        : "Couldn't find your location. It'll keep trying."
    ),
    // Precise this time: friends are finding you in a crowd, not a city
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
  );
  return () => navigator.geolocation.clearWatch(id);
};
