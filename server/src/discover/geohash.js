// Geohash encoding: a latitude/longitude as a short string, which
// Ticketmaster's geoPoint parameter expects. Each character narrows the
// area; 6 characters is about a 1.2 km square, finer than our rounding.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

const encodeGeohash = (lat, lng, precision = 6) => {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = '';
  let bits = 0;
  let value = 0;
  let evenBit = true; // alternate longitude, latitude

  while (hash.length < precision) {
    const range = evenBit ? lngRange : latRange;
    const coord = evenBit ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    value <<= 1;
    if (coord >= mid) {
      value |= 1;
      range[0] = mid;
    } else {
      range[1] = mid;
    }
    evenBit = !evenBit;
    bits += 1;
    if (bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
};

module.exports = { encodeGeohash };
