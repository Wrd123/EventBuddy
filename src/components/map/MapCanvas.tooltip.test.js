import React from 'react';
import { render } from '@testing-library/react';
import MapCanvas from './MapCanvas';

// The real Leaflet, unlike MapCanvas.test.js, because the point is what
// Leaflet puts on the page. Only the vector-tile plugin is left out: jsdom
// has no WebGL, so the map falls back to plain tiles anyway.
jest.mock('@maplibre/maplibre-gl-leaflet', () => ({}));

beforeAll(() => {
  // jsdom has no ResizeObserver; the map only uses it to keep its center
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterAll(() => {
  delete global.ResizeObserver;
});

// A name someone could type as their display name
const NAME = '<img src=x onerror="window.__tooltipRan = true">';

const friend = (caption) => ({
  id: 'friend:1', kind: 'friend', lat: 40.7, lng: -74, label: NAME, color: '#3b82f6', initial: '<', caption
});

const tooltip = (container) => container.querySelector('.eb-tip');

beforeEach(() => {
  // No WebGL, as in jsdom, but without jsdom's "not implemented" warning
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.__tooltipRan;
});

describe("a friend's pin", () => {
  // Set through the DOM, since the page's policy refuses inline style
  // attributes; that the policy is met is checked in a real browser
  it("takes the friend's color", () => {
    const { container } = render(<MapCanvas pins={[friend('Alex • just now')]} onSelect={() => {}} />);

    expect(container.querySelector('.eb-pin-friend').style.background).toBe('rgb(59, 130, 246)'); // #3b82f6
  });

  it('falls back to grey for a color that is not a plain hex value', () => {
    const odd = { ...friend('Alex • just now'), color: 'red;background-image:url(x)' };
    const { container } = render(<MapCanvas pins={[odd]} onSelect={() => {}} />);

    expect(container.querySelector('.eb-pin-friend').style.background).toBe('rgb(100, 116, 139)'); // #64748b
  });
});

describe("a friend's caption on the map", () => {
  it('shows a name as text, not HTML, when the pin first appears', () => {
    const { container } = render(<MapCanvas pins={[friend(`${NAME} • just now`)]} onSelect={() => {}} />);

    expect(tooltip(container).textContent).toBe(`${NAME} • just now`);
    expect(tooltip(container).querySelector('img')).toBeNull();
    expect(window.__tooltipRan).toBeUndefined();
  });

  it('shows a name as text when the caption changes', () => {
    const { container, rerender } = render(<MapCanvas pins={[friend('Alex • just now')]} onSelect={() => {}} />);
    rerender(<MapCanvas pins={[friend(`${NAME} • 2 min ago`)]} onSelect={() => {}} />);

    expect(tooltip(container).textContent).toBe(`${NAME} • 2 min ago`);
    expect(tooltip(container).querySelector('img')).toBeNull();
    expect(window.__tooltipRan).toBeUndefined();
  });

  it('keeps updating as the time since the last position changes', () => {
    const { container, rerender } = render(<MapCanvas pins={[friend('Alex • just now')]} onSelect={() => {}} />);
    rerender(<MapCanvas pins={[friend('Alex • 5 min ago')]} onSelect={() => {}} />);

    expect(tooltip(container).textContent).toBe('Alex • 5 min ago');
  });
});
