import { agoText, isStale, metersBetween, hasMoved, nextSend, backoffMs, shareDurations, untilText, directionsUrl, stillSharing, nextShareEnd } from './live';

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

describe('hasMoved', () => {
  const lastSent = { lat: 33.785, lng: -84.37, accuracy: 5 };
  // 0.00001 degrees of latitude is about 1.1 m
  const north = (meters, accuracy) => ({ lat: 33.785 + meters / 111195, lng: -84.37, accuracy });

  it('counts a step of a few meters as moving', () => {
    expect(hasMoved(north(4, 3), lastSent)).toBe(true);
    expect(hasMoved(north(2, 3), lastSent)).toBe(false);
  });

  it("doesn't count drift inside the fix's own accuracy radius", () => {
    // A poor fix (30 m) that wanders 12 m is noise, not a walk
    expect(hasMoved(north(12, 30), lastSent)).toBe(false);
    expect(hasMoved(north(35, 30), lastSent)).toBe(true);
  });

  it('works without an accuracy', () => {
    expect(hasMoved(north(5), lastSent)).toBe(true);
    expect(hasMoved(north(1), lastSent)).toBe(false);
  });

  it('never needs more than 15 m of movement, however poor the fix', () => {
    expect(hasMoved(north(16, 60), lastSent)).toBe(true);
    expect(hasMoved(north(14, 60), lastSent)).toBe(false);
  });
});

describe('nextSend', () => {
  const lastSent = { lat: 33.785, lng: -84.37, accuracy: 5, at: NOW, measuredAt: NOW - 500 };
  const fixAt = (meters, measuredAt) => ({ lat: 33.785 + meters / 111195, lng: -84.37, accuracy: 5, measuredAt });
  const later = (ms) => NOW + ms;

  it('sends the first fix at once', () => {
    expect(nextSend({ fix: fixAt(0, NOW), lastSent: null, now: NOW, hidden: false })).toEqual({ send: true });
  });

  it('sends a moving fix once the interval since the last send is up', () => {
    const fix = fixAt(20, later(2000));
    expect(nextSend({ fix, lastSent, now: later(2000), hidden: false })).toEqual({ send: true });
    expect(nextSend({ fix, lastSent, now: later(5000), hidden: false })).toEqual({ send: true });
  });

  it('says when a moving fix is due if the interval has not passed', () => {
    const fix = fixAt(20, later(500));
    expect(nextSend({ fix, lastSent, now: later(500), hidden: false })).toEqual({ dueAt: later(2000) });
  });

  it('waits longer when the app is out of sight', () => {
    const fix = fixAt(20, later(3000));
    expect(nextSend({ fix, lastSent, now: later(3000), hidden: true })).toEqual({ dueAt: later(10000) });
    expect(nextSend({ fix, lastSent, now: later(10000), hidden: true })).toEqual({ send: true });
  });

  it("holds a still phone's new fix for the heartbeat, however often it reports", () => {
    const fix = fixAt(1, later(60000));
    expect(nextSend({ fix, lastSent, now: later(60000), hidden: false })).toEqual({ dueAt: later(120000) });
  });

  it('sends a new fix as a heartbeat after 2 minutes of standing still', () => {
    const fix = fixAt(1, later(120000));
    // Waiting on a timer: a still phone may report nothing more
    expect(nextSend({ fix, lastSent, now: later(119999), hidden: false })).toEqual({ dueAt: later(120000) });
    expect(nextSend({ fix, lastSent, now: later(120000), hidden: false })).toEqual({ send: true });
  });

  it('does not repeat an old fix as a heartbeat', () => {
    // Nothing newer than what was sent has arrived
    expect(nextSend({ fix: { ...lastSent }, lastSent, now: later(180000), hidden: false })).toEqual({ send: false });
  });

  it('heartbeats at the same pace in the background', () => {
    const fix = fixAt(1, later(120000));
    expect(nextSend({ fix, lastSent, now: later(120000), hidden: true })).toEqual({ send: true });
  });
});

describe('backoffMs', () => {
  it('waits longer after each failure in a row, up to 30 seconds', () => {
    expect([1, 2, 3, 4, 5, 20].map((n) => backoffMs(n))).toEqual([4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('obeys a longer Retry-After and ignores a shorter one', () => {
    expect(backoffMs(1, 45)).toBe(45000);
    expect(backoffMs(3, 2)).toBe(16000);
    expect(backoffMs(2, undefined)).toBe(8000);
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

describe('stillSharing and nextShareEnd', () => {
  const minutesAfter = (m) => new Date(NOW + m * 60 * 1000).toISOString();
  const people = [
    { name: 'Alex', until: minutesAfter(30) },
    { name: 'Taylor', until: minutesBefore(1) },
    { name: 'Jordan', until: minutesAfter(5) }
  ];

  it('leaves out shares that have run out', () => {
    expect(stillSharing(people, NOW).map((p) => p.name)).toEqual(['Alex', 'Jordan']);
  });

  it('finds the next share to run out', () => {
    expect(nextShareEnd(people, NOW)).toBe(new Date(minutesAfter(5)).getTime());
    expect(nextShareEnd([people[1]], NOW)).toBeNull();
  });
});
