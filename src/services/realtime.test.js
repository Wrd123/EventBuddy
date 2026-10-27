import { act } from 'react';
import * as realtime from './realtime';
import { installFakeApi, allSockets, openSockets, dropSocket } from '../testUtils/fakeApi';

// Long enough for the fake socket to open and answer the login
const settle = () => act(() => { jest.advanceTimersByTime(10); });

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

// Watchers live in the module, so each test removes its own
let unwatches = [];
const watch = (...args) => {
  const unwatch = realtime.watch(...args);
  unwatches.push(unwatch);
  return unwatch;
};

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  installFakeApi({ realtime: true }).logIn();
});

afterEach(() => {
  unwatches.splice(0).forEach((unwatch) => unwatch());
  realtime.stop();
  setVisibility('visible');
  jest.useRealTimers();
});

describe('socketUrl', () => {
  it("is on the API's host, over a secure socket when the API is", () => {
    expect(realtime.socketUrl('https://api.example.com/api', 'https://app.example.com/'))
      .toBe('wss://api.example.com/api/socket');
    expect(realtime.socketUrl('http://localhost:4100/api/', 'http://localhost:3999/'))
      .toBe('ws://localhost:4100/api/socket');
  });

  it("is on the page's own host when the API address is relative", () => {
    expect(realtime.socketUrl('/api', 'http://localhost:3000/events/1')).toBe('ws://localhost:3000/api/socket');
    expect(realtime.socketUrl('/api', 'https://eventbuddy.example/')).toBe('wss://eventbuddy.example/api/socket');
  });
});

describe('the socket', () => {
  it('logs in first, then subscribes to what is being watched', async () => {
    const unwatch = watch('1', 'chat', () => {});
    realtime.start();
    await settle();

    const [ws] = openSockets();
    expect(ws.sent).toEqual([{ type: 'auth', token: 'fake-token' }, { type: 'subscribe', eventId: '1' }]);
    expect(realtime.isConnected()).toBe(true);

    unwatch();
    expect(ws.sent.at(-1)).toEqual({ type: 'unsubscribe', eventId: '1' });
  });

  it('counts an event as covered only once the server confirms it', async () => {
    installFakeApi({ realtime: true, deniedEvents: ['2'] }).logIn();
    watch('1', 'chat', () => {});
    watch('2', 'chat', () => {});
    realtime.start();
    expect(realtime.isCovered('1')).toBe(false);
    await settle();

    expect(realtime.isCovered('1')).toBe(true);
    expect(realtime.isCovered('2')).toBe(false);
    await dropSocket();
    expect(realtime.isCovered('1')).toBe(false);
  });

  it('subscribes once for an event however many screens watch it', async () => {
    realtime.start();
    await settle();
    const unwatchChat = watch('1', 'chat', () => {});
    const unwatchEvent = watch('1', 'event', () => {});
    unwatchChat();

    const [ws] = openSockets();
    expect(ws.sent.filter((m) => m.type !== 'auth')).toEqual([{ type: 'subscribe', eventId: '1' }]);
    unwatchEvent();
    expect(ws.sent.at(-1)).toEqual({ type: 'unsubscribe', eventId: '1' });
  });

  it('passes on only the pokes each watcher asked for', async () => {
    const chat = jest.fn();
    const list = jest.fn();
    watch('1', 'chat', chat);
    watch(null, 'events', list);
    realtime.start();
    await settle();

    const [ws] = openSockets();
    ws.receive({ type: 'changed', eventId: '1', what: 'live' });
    ws.receive({ type: 'changed', eventId: '2', what: 'chat' });
    expect(chat).not.toHaveBeenCalled();
    ws.receive({ type: 'changed', eventId: '1', what: 'chat' });
    ws.receive({ type: 'changed', what: 'events' });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('reconnects after a drop, and subscribes again', async () => {
    watch('1', 'chat', () => {});
    realtime.start();
    await settle();
    await dropSocket();
    expect(realtime.isConnected()).toBe(false);

    await act(() => { jest.advanceTimersByTime(1000); });
    await settle();
    const [ws] = openSockets();
    expect(ws).not.toBe(allSockets()[0]);
    expect(ws.sent).toEqual([{ type: 'auth', token: 'fake-token' }, { type: 'subscribe', eventId: '1' }]);
  });

  it('gives up when the server says the login ended, until it starts again', async () => {
    realtime.start();
    await settle();
    await dropSocket(4401);

    await act(() => { jest.advanceTimersByTime(60000); });
    expect(allSockets()).toHaveLength(1);

    // Changing the password restarts it with the new token
    realtime.start();
    await settle();
    expect(openSockets()).toHaveLength(1);
  });

  it('ignores a socket left over from an earlier login', async () => {
    const poked = jest.fn();
    watch(null, 'events', poked);
    realtime.start();
    await settle();
    const [old] = openSockets();

    realtime.start();
    await settle();
    old.receive({ type: 'changed', what: 'events' });
    old.serverClose(1006);
    expect(poked).not.toHaveBeenCalled();
    expect(realtime.isConnected()).toBe(true);
  });

  it('closes while the app is hidden, and comes back with it', async () => {
    realtime.start();
    await settle();
    setVisibility('hidden');
    expect(realtime.isConnected()).toBe(false);
    expect(openSockets()).toHaveLength(0);

    setVisibility('visible');
    await settle();
    expect(realtime.isConnected()).toBe(true);
  });

  it('closes on logout and stays closed', async () => {
    realtime.start();
    await settle();
    realtime.stop();
    setVisibility('visible');
    await act(() => { jest.advanceTimersByTime(60000); });
    expect(openSockets()).toHaveLength(0);
  });
});
