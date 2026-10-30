import React from 'react';
import { render } from '@testing-library/react';
import L from 'leaflet';
import MapCanvas from './MapCanvas';

// The real Leaflet, as in MapCanvas.tooltip.test.js, so what's checked is
// where the markers are really drawn. Frames are driven by hand: a fake
// clock and a queue of requestAnimationFrame callbacks.
jest.mock('@maplibre/maplibre-gl-leaflet', () => ({}));

let clock;
let frames;
let nextFrameId;

// Moves the clock on and runs the frame that was waiting
const advance = (ms) => {
  clock += ms;
  const due = [...frames.entries()];
  frames.clear();
  due.forEach(([, callback]) => callback(clock));
};

const allowMotion = (allowed = true) => {
  window.matchMedia = jest.fn(() => ({ matches: !allowed }));
};

let hadSvg;

beforeAll(() => {
  // jsdom can't tell Leaflet it can draw SVG (it lacks createSVGRect), so
  // circles would have nothing to be drawn with
  hadSvg = L.Browser.svg;
  L.Browser.svg = true;
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterAll(() => {
  L.Browser.svg = hadSvg;
  delete global.ResizeObserver;
});

beforeEach(() => {
  clock = 1000;
  frames = new Map();
  nextFrameId = 1;
  // No WebGL, as in jsdom, but without jsdom's "not implemented" warning
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
  allowMotion();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.matchMedia;
});

const friend = (lat, lng, extra = {}) => ({
  id: 'friend:1', kind: 'friend', lat, lng, label: 'Alex', color: '#3b82f6', initial: 'A', caption: 'Alex • just now', ...extra
});

const draw = (pins) => <MapCanvas pins={pins} onSelect={() => {}} />;

// Leaflet keeps no handle on its maps, so each one is noted as it is made
let maps = [];
L.Map.addInitHook(function () {
  maps.push(this);
});

// Where Leaflet has drawn the marker with this title
const drawn = (title) => {
  let found = null;
  const map = mapOf();
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker && layer.options.title === title) found = layer.getLatLng();
  });
  return found;
};

const mapOf = () => maps[maps.length - 1];
const circles = () => {
  const found = [];
  mapOf().eachLayer((layer) => layer instanceof L.Circle && found.push(layer));
  return found;
};

describe('a moving friend', () => {
  it('glides steadily to the new point and ends exactly on it', () => {
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -73, { fixAt: 12000 })]));

    // Nothing has moved yet
    expect(drawn('Alex')).toMatchObject({ lat: 40, lng: -74 });
    advance(1000);
    expect(drawn('Alex').lat).toBeCloseTo(40.5, 6);
    expect(drawn('Alex').lng).toBeCloseTo(-73.5, 6);

    advance(1000);
    expect(drawn('Alex')).toMatchObject({ lat: 41, lng: -73 });
    // Done, so no more frames are asked for
    expect(frames.size).toBe(0);
  });

  it('starts a new glide from where the pin is drawn, not from the old target', () => {
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, { fixAt: 12000 })]));
    advance(1000); // halfway: 40.5
    rerender(draw([friend(40.5 + 1, -74, { fixAt: 13000 })]));

    expect(drawn('Alex').lat).toBeCloseTo(40.5, 6);
    advance(500); // half of the 1000 ms to the new point
    expect(drawn('Alex').lat).toBeCloseTo(41, 6);
    advance(500);
    expect(drawn('Alex').lat).toBeCloseTo(41.5, 6);
  });

  it('keeps gliding, and arrives on time, when only the caption or the selection changes', () => {
    const at = { fixAt: 12000 };
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, at)]));
    advance(500);
    expect(drawn('Alex').lat).toBeCloseTo(40.25, 6);

    // The caption counts up every second, and the same fix comes back each time
    rerender(draw([friend(41, -74, { ...at, caption: 'Alex • 1 s ago' })]));
    expect(drawn('Alex').lat).toBeCloseTo(40.25, 6);
    advance(500);
    expect(drawn('Alex').lat).toBeCloseTo(40.5, 6);

    // Tapping the pin selects it
    rerender(<MapCanvas pins={[friend(41, -74, { ...at, caption: 'Alex • 2 s ago' })]} selectedId="friend:1" onSelect={() => {}} />);
    expect(drawn('Alex').lat).toBeCloseTo(40.5, 6);

    advance(1000);
    expect(drawn('Alex')).toMatchObject({ lat: 41, lng: -74 });
    expect(frames.size).toBe(0);
  });

  it('jumps after a gap of more than 15 seconds', () => {
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, { fixAt: 26000 })]));

    expect(drawn('Alex')).toMatchObject({ lat: 41, lng: -74 });
    expect(frames.size).toBe(0);
  });

  it('jumps to a first point and to one with no time to measure by', () => {
    const { rerender } = render(draw([friend(40, -74)]));
    rerender(draw([friend(41, -74)]));

    expect(drawn('Alex').lat).toBe(41);
    expect(frames.size).toBe(0);
  });

  it('jumps when the person asked for less motion', () => {
    allowMotion(false);
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, { fixAt: 12000 })]));

    expect(drawn('Alex').lat).toBe(41);
    expect(frames.size).toBe(0);
  });

  it('puts the pin on its target when the page comes back after being hidden', () => {
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, { fixAt: 12000 })]));
    advance(500);
    expect(drawn('Alex').lat).toBeLessThan(41);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(drawn('Alex').lat).toBe(41);
    expect(frames.size).toBe(0);
  });

  it('stops asking for frames when its pin goes away', () => {
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, { fixAt: 12000 })]));
    expect(frames.size).toBe(1);

    rerender(draw([]));

    expect(frames.size).toBe(0);
    expect(drawn('Alex')).toBeNull();
  });

  it('stops asking for frames when the map goes away', () => {
    const { rerender, unmount } = render(draw([friend(40, -74, { fixAt: 10000 })]));
    rerender(draw([friend(41, -74, { fixAt: 12000 })]));
    expect(frames.size).toBe(1);

    unmount();

    expect(frames.size).toBe(0);
  });
});

describe('a pin that is not a person', () => {
  it('jumps, even when it comes with times', () => {
    const meetup = (lat) => ({ id: 'meetup', kind: 'meetup', lat, lng: -74, label: 'Lake', fixAt: lat * 1000 });
    const { rerender } = render(draw([meetup(40)]));
    rerender(draw([meetup(41)]));

    expect(drawn('Lake').lat).toBe(41);
  });

  it('glides when it is you', () => {
    const me = (lat, fixAt) => ({ id: 'me', kind: 'me', lat, lng: -74, label: 'You', fixAt });
    const { rerender } = render(draw([me(40, 10000)]));
    rerender(draw([me(41, 12000)]));
    advance(1000);

    expect(drawn('You').lat).toBeCloseTo(40.5, 6);
  });
});

describe("a friend's accuracy circle", () => {
  it('appears for a loose fix, as wide as its accuracy', () => {
    render(draw([friend(40, -74, { accuracy: 35 })]));

    const [circle] = circles();
    expect(circle.getRadius()).toBe(35);
    expect(circle.options.className).toBe('eb-accuracy');
    expect(circle.options.interactive).toBe(false);
  });

  it('is left out for a fix too loose to mean anything, such as a laptop\'s IP location', () => {
    const { rerender } = render(draw([friend(40, -74, { accuracy: 1000 })]));
    expect(circles()).toHaveLength(1);

    rerender(draw([friend(40, -74, { accuracy: 1001 })]));
    expect(circles()).toHaveLength(0);

    rerender(draw([friend(40, -74, { accuracy: 5000 })]));
    expect(circles()).toHaveLength(0);
  });

  it('is left out for a good fix, and goes when the fix improves', () => {
    const { rerender } = render(draw([friend(40, -74, { accuracy: 20 })]));
    expect(circles()).toHaveLength(0);

    rerender(draw([friend(40, -74, { accuracy: 50 })]));
    expect(circles()).toHaveLength(1);

    rerender(draw([friend(40, -74, { accuracy: 8 })]));
    expect(circles()).toHaveLength(0);
  });

  it('follows its pin while it glides', () => {
    const { rerender } = render(draw([friend(40, -74, { fixAt: 10000, accuracy: 35 })]));
    rerender(draw([friend(41, -74, { fixAt: 12000, accuracy: 35 })]));
    advance(1000);

    expect(circles()[0].getLatLng().lat).toBeCloseTo(40.5, 6);
    advance(1000);
    expect(circles()[0].getLatLng().lat).toBe(41);
  });

  it('goes with its pin', () => {
    const { rerender } = render(draw([friend(40, -74, { accuracy: 35 })]));
    rerender(draw([]));

    expect(circles()).toHaveLength(0);
  });
});
