import { act, renderHook, waitFor } from '@testing-library/react';
import { installFakeApi, holdNext, failNext, localEvents } from '../testUtils/fakeApi';
import { useNearbyEvents } from './useNearbyEvents';

const ATLANTA = { lat: 33.75, lng: -84.39 };

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

// The fake server's list is shared, so what a test adds is taken back out
afterEach(() => {
  localEvents.splice(3);
});

const search = async (options) => {
  const seen = [];
  const hook = renderHook(
    (props) => {
      const value = useNearbyEvents(ATLANTA, props);
      seen.push(value.status);
      return value;
    },
    { initialProps: options }
  );
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return { ...hook, seen };
};

describe('useNearbyEvents refresh', () => {
  it('shows new events without going back to loading', async () => {
    const { result, seen } = await search();
    expect(result.current.events).toHaveLength(3);
    localEvents.push({ ...localEvents[0], _id: 'tm_new', name: 'Added Show' });

    await act(() => result.current.refresh());

    expect(result.current.events).toHaveLength(4);
    expect(seen.slice(seen.indexOf('ready'))).not.toContain('loading');
  });

  it('rejects when the server can not be reached, and keeps the events on screen', async () => {
    const { result, seen } = await search();
    failNext('GET', '/discover/events');

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.events).toHaveLength(3);
    expect(seen.slice(seen.indexOf('ready'))).not.toContain('loading');
  });

  it('drops an answer for a search that has since changed', async () => {
    const { result, rerender } = await search({ category: 'all' });
    const release = holdNext('GET', '/discover/events');
    let refreshing;
    act(() => { refreshing = result.current.refresh(); });

    rerender({ category: 'music' });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    await release();
    await act(() => refreshing);

    expect(result.current.events).toHaveLength(1);
  });

  it('does nothing without a place', async () => {
    const { result } = renderHook(() => useNearbyEvents(null));
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('idle');
  });
});
