import * as discoverService from './discoverService';

// Plain-language reasons the phone couldn't share its location
const LOCATION_ERRORS = {
  1: 'Location is turned off for EventBuddy. Enter a city or ZIP code instead.',
  2: "Couldn't find your location. Enter a city or ZIP code instead.",
  3: 'Finding your location took too long. Enter a city or ZIP code instead.'
};

export const NO_LOCATION_SUPPORT = "This device can't share its location. Enter a city or ZIP code instead.";

// Some browsers (and embedded web views) have no location at all
export const deviceHasLocation = () => Boolean(navigator.geolocation);

const currentPosition = () =>
  new Promise((resolve, reject) => {
    if (!deviceHasLocation()) {
      reject(new Error(NO_LOCATION_SUPPORT));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, // city-level is all we need, and it's faster
      timeout: 10000,
      maximumAge: 10 * 60 * 1000
    });
  });

// Where the phone is, as a place to look for events around. The first time,
// asking is what brings up the phone's "Allow EventBuddy to use your
// location?" prompt. Fails with a message that can be shown as is.
export const findDevicePlace = async () => {
  let coords;
  try {
    ({ coords } = await currentPosition());
  } catch (err) {
    throw new Error(LOCATION_ERRORS[err.code] || err.message);
  }
  const found = await discoverService.getPlaceAt(coords.latitude, coords.longitude);
  return { ...found, source: 'device' };
};
