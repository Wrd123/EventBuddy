import { agoText, isStale, metersBetween, shouldSend, shareDurations, untilText, directionsUrl } from './live';

const NOW = new Date(2026, 9, 24, 15, 0).getTime();
const minutesBefore = (m) => new Date(NOW - m * 60 * 1000).toISOString();

describe('agoText', () => {
  it('reads like a person would say it', () => {
    expect(agoText(minutesBefore(0.5), NOW)).toBe('just now');
    expect(agoText(minutesBefore(4), NOW)).toBe('4 min ago');
    expect(agoText(minutesBefore(59), NOW)).toBe('59 min ago');
    expect(agoText(minutesBefore(125), NOW)).toBe('2 hr ago');
  });
});

describe('isStale', () => {
  it('fades pins after 10 minutes without an update', () => {
    expect(isStale(minutesBefore(9), NOW)).toBe(false);
    expect(isStale(minutesBefore(11), NOW)).toBe(true);
  });
});

describe('metersBetween', () => {
  it('measures short distances on the ground', () => {
    // 0.001 degrees of latitude is about 111 m everywhere
    expect(metersBetween({ lat: 33.785, lng: -84.37 }, { lat: 33.786, lng: -84.37 })).toBeCloseTo(111.2, 0);
    expect(metersBetween({ lat: 33.785, lng: -84.37 }, { lat: 33.785, lng: -84.37 })).toBe(0);
  });
});

describe('shouldSend', () => {
  const here = { lat: 33.785, lng: -84.37 };
  const sent = (minutesAgo, lat = here.lat) => ({ lat, lng: here.lng, at: NOW - minutesAgo * 60 * 1000 });

  it('sends the first position, then after moving or waiting', () => {
    expect(shouldSend(here, null, NOW)).toBe(true);
    expect(shouldSend(here, sent(0.5), NOW)).toBe(false);
    expect(shouldSend(here, sent(0.5, 33.7853), NOW)).toBe(true); // ~33 m away
    expect(shouldSend(here, sent(2), NOW)).toBe(true);
  });
});

describe('shareDurations', () => {
  it('offers an hour, three hours and the rest of the day', () => {
    const options = shareDurations(new Date(NOW));
    expect(options.map(o => o.label)).toEqual(['1 hour', '3 hours', 'Until midnight']);
    expect(options[2].until).toEqual(new Date(2026, 9, 25, 0, 0));
  });

  it('drops "until midnight" when it would be under an hour', () => {
    const late = new Date(2026, 9, 24, 23, 20);
    expect(shareDurations(late).map(o => o.label)).toEqual(['1 hour', '3 hours']);
  });
});

describe('untilText and directionsUrl', () => {
  it('formats for people and maps apps', () => {
    expect(untilText(new Date(2026, 9, 24, 21, 30))).toBe('until 9:30 PM');
    expect(directionsUrl({ lat: 33.7857, lng: -84.3741 })).toBe('https://www.google.com/maps/dir/?api=1&destination=33.7857,-84.3741');
  });
});
