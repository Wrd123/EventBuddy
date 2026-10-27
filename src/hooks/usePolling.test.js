import { act, renderHook } from '@testing-library/react';
import * as realtime from '../services/realtime';
import { installFakeApi, poke, dropSocket } from '../testUtils/fakeApi';
import { usePolling, CONNECTED_POLL_MS } from './usePolling';

const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  realtime.stop();
  jest.useRealTimers();
});

const connect = async (options = {}) => {
  installFakeApi({ realtime: true, ...options }).logIn();
  realtime.start();
  await advance(10);
};

describe('usePolling', () => {
  it('polls at its own pace without a socket', async () => {
    installFakeApi().logIn();
    realtime.start();
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));

    await advance(12000);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('reads at once when poked, and only for its own topic', async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));
    await advance(300);
    read.mockClear();

    await poke('1', 'live');
    await poke('2', 'chat');
    await advance(10);
    expect(read).not.toHaveBeenCalled();

    await poke('1', 'chat');
    await advance(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('makes one read of a burst of pokes, and one more after it', async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));

    await poke('1', 'chat');
    await advance(0);
    await poke('1', 'chat');
    await poke('1', 'chat');
    await poke('1', 'chat');
    await advance(100);
    expect(read).toHaveBeenCalledTimes(1);
    await advance(200);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('listens for several kinds of poke', async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 15000, { eventId: '1', what: ['event', 'chat'] }));

    await poke('1', 'event');
    await advance(300);
    await poke('1', 'chat');
    await advance(300);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('slows to a safety net while connected, and catches up when the socket drops', async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));
    // Once the server confirms the subscription, one read catches anything
    // that changed before it
    await advance(10);
    expect(read).toHaveBeenCalledTimes(1);

    // The slower pace runs from then
    await advance(CONNECTED_POLL_MS - 10);
    expect(read).toHaveBeenCalledTimes(1);
    await advance(10);
    expect(read).toHaveBeenCalledTimes(2);

    // Closed for good (replaced by a newer socket), so no reconnect here
    await dropSocket(4409);
    await advance(0);
    expect(read).toHaveBeenCalledTimes(3);
    await advance(4000);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('reads again when the socket comes back, for pokes sent while it was down', async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));
    await advance(10);
    await dropSocket();
    await advance(300);
    read.mockClear();

    // Back within a second, before the 4 second poll would have run
    await advance(1010);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps its own pace when the server refuses the subscription', async () => {
    await connect({ deniedEvents: ['1'] });
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));

    await advance(12000);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('keeps the events list at its pace, since pokes only cover who is in which event', async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 30000, { what: 'events' }));

    await advance(30000);
    expect(read).toHaveBeenCalledTimes(1);
    await poke(null, 'events');
    await advance(0);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("doesn't read for a poke while the app is hidden", async () => {
    await connect();
    const read = jest.fn();
    renderHook(() => usePolling(read, 4000, { eventId: '1', what: 'chat' }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    await poke('1', 'chat');
    await advance(10);
    expect(read).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
