import React, { act } from 'react';
import { render } from '@testing-library/react';
import { SharingProvider, useSharing } from './SharingContext';

// A stand-in for the phone's location: the test feeds it fixes
let mockHandlers;
const mockStopTracking = jest.fn();
jest.mock('../services/locationTracker', () => ({
  startTracking: (handlers) => {
    mockHandlers = handlers;
    return mockStopTracking;
  }
}));

const EVENT = '5';
const HOUR = 60 * 60 * 1000;
const METERS_PER_DEGREE = 111195;

let sharing;
const Probe = () => {
  sharing = useSharing();
  return null;
};

const renderSharing = (share, isAuthenticated = true) => {
  localStorage.setItem('eventbuddy_share', JSON.stringify(share));
  const ui = (authed) => (
    <SharingProvider isAuthenticated={authed} isLoading={false}>
      <Probe />
    </SharingProvider>
  );
  const view = render(ui(isAuthenticated));
  return { logOut: () => view.rerender(ui(false)), unmount: () => view.unmount() };
};

const share = (overrides = {}) => ({ eventId: EVENT, until: new Date(Date.now() + HOUR).toISOString(), id: 'share-1', ...overrides });

// Lets promises settle, which fake timers don't do by themselves
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const advance = (ms) => act(async () => {
  jest.advanceTimersByTime(ms);
  await settle();
});

// A fix `meters` north of where the test starts, taken just now
const START = { lat: 33.785, lng: -84.37 };
const fixAt = (meters, extra = {}) => ({
  lat: START.lat + meters / METERS_PER_DEGREE,
  lng: START.lng,
  accuracy: 5,
  measuredAt: Date.now(),
  ...extra
});
const feed = (fix) => act(async () => {
  mockHandlers.onPosition(fix);
  await settle();
});

const answer = (status, retryAfter) => Promise.resolve({
  ok: status < 400,
  status,
  headers: { get: (name) => (name === 'Retry-After' && retryAfter ? String(retryAfter) : null) },
  json: () => Promise.resolve({ message: 'No.' })
});

const uploads = () => global.fetch.mock.calls.filter(([url, { method }]) => method === 'PUT' && url.endsWith('/live/position'));
const bodies = () => uploads().map(([, { body }]) => JSON.parse(body));

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 24, 15, 0));
  localStorage.clear();
  mockHandlers = undefined;
  mockStopTracking.mockClear();
  global.fetch = jest.fn(() => answer(204));
});

afterEach(() => {
  setVisibility('visible');
  jest.useRealTimers();
});

describe('sharing your location', () => {
  it('uploads about every 2 seconds while moving, however often the phone reports', async () => {
    renderSharing(share());
    // A fix every half second, each 3 m further on, for 10 seconds
    for (let i = 0; i <= 20; i++) {
      await feed(fixAt(i * 3));
      await advance(500);
    }
    expect(uploads().length).toBeGreaterThanOrEqual(5);
    expect(uploads().length).toBeLessThanOrEqual(6);
  });

  it('sends nothing while you stand still, apart from a heartbeat every 2 minutes', async () => {
    renderSharing(share());
    await feed(fixAt(0));
    expect(uploads()).toHaveLength(1);

    // Drifting inside the accuracy circle for a minute and a half
    for (let i = 0; i < 90; i++) {
      await advance(1000);
      await feed(fixAt(i % 2, { accuracy: 20 }));
    }
    expect(uploads()).toHaveLength(1);

    // The newest drift waits for the heartbeat on its own: a still phone
    // may report nothing more
    await advance(30000);
    expect(uploads()).toHaveLength(2);
  });

  it('has one upload out at a time, and sends only the newest fix after it', async () => {
    let finish;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(answer(204)); }));
    renderSharing(share());
    await feed(fixAt(0));
    await feed(fixAt(10));
    await feed(fixAt(20));
    await feed(fixAt(30));
    expect(uploads()).toHaveLength(1);

    finish();
    await advance(2000);
    expect(uploads()).toHaveLength(2);
    expect(bodies()[1].lat).toBeCloseTo(fixAt(30).lat, 6);
    await advance(10000);
    expect(uploads()).toHaveLength(2);
  });

  it('numbers each upload within its share and says how old the fix is', async () => {
    renderSharing(share());
    await feed(fixAt(0, { measuredAt: Date.now() - 700 }));
    await advance(2000);
    await feed(fixAt(20));
    await advance(2000);
    await feed(fixAt(40));

    expect(bodies()).toEqual([
      expect.objectContaining({ shareId: 'share-1', seq: 1, ageMs: 700 }),
      expect.objectContaining({ shareId: 'share-1', seq: 2, ageMs: 0 }),
      expect.objectContaining({ shareId: 'share-1', seq: 3, ageMs: 0 })
    ]);
  });

  it('starts counting again for a new share, and keeps counting when a share is extended', async () => {
    renderSharing(share());
    await feed(fixAt(0));
    // Extended: same id, later end
    act(() => sharing.setShare(share({ until: new Date(Date.now() + 2 * HOUR).toISOString() })));
    await advance(2000);
    await feed(fixAt(20));
    expect(bodies().map((b) => b.seq)).toEqual([1, 2]);

    // Stopped and started again: a new id
    act(() => sharing.setShare(share({ id: 'share-2' })));
    await advance(2000);
    await feed(fixAt(40));
    expect(bodies()[2]).toMatchObject({ shareId: 'share-2', seq: 1 });
  });

  it('sends the plain body for a share that has no id yet', async () => {
    renderSharing(share({ id: undefined }));
    await feed(fixAt(0));
    expect(Object.keys(bodies()[0]).sort()).toEqual(['accuracy', 'lat', 'lng']);
  });

  it('sends the moment a fix arrives once its turn has come, with no timers running', async () => {
    renderSharing(share());
    await feed(fixAt(0));
    // The clock moves on (a locked phone's timers were asleep), but no timer fires
    jest.setSystemTime(Date.now() + 5000);
    await feed(fixAt(30));
    expect(uploads()).toHaveLength(2);
  });

  it('catches up when the app comes back on screen', async () => {
    renderSharing(share());
    await feed(fixAt(0));
    setVisibility('hidden');
    await feed(fixAt(30));
    // The out-of-sight pace is slower
    jest.setSystemTime(Date.now() + 5000);
    await feed(fixAt(60));
    expect(uploads()).toHaveLength(1);

    jest.setSystemTime(Date.now() + 1000);
    await act(async () => {
      setVisibility('visible');
      await settle();
    });
    expect(uploads()).toHaveLength(2);
    expect(bodies()[1].lat).toBeCloseTo(fixAt(60).lat, 6);
  });

  it('sends at the slower pace while out of sight', async () => {
    renderSharing(share());
    await feed(fixAt(0));
    setVisibility('hidden');
    await feed(fixAt(30));
    await advance(9000);
    expect(uploads()).toHaveLength(1);
    await advance(1000);
    expect(uploads()).toHaveLength(2);
  });

  it('sends nothing more after you stop, even with a fix waiting', async () => {
    renderSharing(share());
    await feed(fixAt(0));
    await feed(fixAt(30));
    act(() => sharing.setShare(null));
    await advance(30000);
    expect(uploads()).toHaveLength(1);
    expect(mockStopTracking).toHaveBeenCalled();
  });

  it('sends nothing more after you log out, even with a fix waiting', async () => {
    const { logOut } = renderSharing(share());
    await feed(fixAt(0));
    await feed(fixAt(30));
    await act(async () => logOut());
    await advance(30000);
    expect(uploads()).toHaveLength(1);
  });

  it("doesn't let a late answer for an old share end the new one", async () => {
    let finish;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(answer(409)); }));
    renderSharing(share());
    await feed(fixAt(0));
    // Sharing again meanwhile, as a new share
    act(() => sharing.setShare(share({ id: 'share-2', until: new Date(Date.now() + 2 * HOUR).toISOString() })));
    await act(async () => {
      finish();
      await settle();
    });
    expect(sharing.share).toMatchObject({ id: 'share-2' });
  });

  it('keeps counting after the app is relaunched, so the server keeps its fixes', async () => {
    const first = renderSharing(share());
    await feed(fixAt(0));
    await advance(2000);
    await feed(fixAt(10));
    expect(bodies().map((b) => b.seq)).toEqual([1, 2]);
    first.unmount();

    renderSharing(share());
    await feed(fixAt(20));
    expect(bodies()[2].seq).toBe(3);
  });

  it("counts on from the server's last number when this device lost count", async () => {
    renderSharing(share({ seq: 41 }));
    await feed(fixAt(0));
    expect(bodies()[0].seq).toBe(42);
  });

  it('waits after any refusal, rather than sending on every fix', async () => {
    global.fetch.mockImplementation(() => answer(400));
    renderSharing(share());
    for (let i = 0; i < 10; i++) {
      await feed(fixAt(i * 10));
      await advance(1000);
    }
    // The first try, then one after the 4 s wait, then the 8 s one is still to come
    expect(uploads()).toHaveLength(2);
  });

  it('backs off after failures instead of retrying in a tight loop', async () => {
    global.fetch.mockImplementation(() => answer(500));
    renderSharing(share());
    await feed(fixAt(0));
    expect(uploads()).toHaveLength(1);

    // New fixes arriving meanwhile don't skip the wait
    await advance(2000);
    await feed(fixAt(30));
    await advance(1999);
    expect(uploads()).toHaveLength(1);
    await advance(1);
    expect(uploads()).toHaveLength(2);

    await advance(7999);
    expect(uploads()).toHaveLength(2);
    await advance(1);
    expect(uploads()).toHaveLength(3);

    await advance(15999);
    expect(uploads()).toHaveLength(3);
    await advance(1);
    expect(uploads()).toHaveLength(4);

    // Then no faster than every 30 seconds
    await advance(29999);
    expect(uploads()).toHaveLength(4);
    await advance(1);
    expect(uploads()).toHaveLength(5);
  });

  it('starts again at a short wait once an upload works', async () => {
    global.fetch.mockImplementationOnce(() => answer(500)).mockImplementationOnce(() => answer(500));
    renderSharing(share());
    await feed(fixAt(0));
    await advance(4000);
    await advance(8000);
    expect(uploads()).toHaveLength(3);

    global.fetch.mockImplementationOnce(() => answer(500));
    await advance(2000);
    await feed(fixAt(30));
    expect(uploads()).toHaveLength(4);
    // The failure after a success waits the short time again
    await advance(4000);
    expect(uploads()).toHaveLength(5);
  });

  it('waits at least as long as a 429 asks', async () => {
    global.fetch.mockImplementationOnce(() => answer(429, 45));
    renderSharing(share());
    await feed(fixAt(0));
    await advance(44999);
    expect(uploads()).toHaveLength(1);
    await advance(1);
    expect(uploads()).toHaveLength(2);
  });

  it('stops sharing when the server says it has ended', async () => {
    global.fetch.mockImplementationOnce(() => answer(409));
    renderSharing(share());
    await feed(fixAt(0));
    expect(sharing.share).toBeNull();
    expect(localStorage.getItem('eventbuddy_share')).toBeNull();
  });

  it("stops sharing when you're no longer in the event", async () => {
    global.fetch.mockImplementationOnce(() => answer(404));
    renderSharing(share());
    await feed(fixAt(0));
    expect(sharing.share).toBeNull();
  });
});
