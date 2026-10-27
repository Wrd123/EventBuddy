import { act, renderHook, waitFor } from '@testing-library/react';
import { AppProvider } from '../context/AppContext';
import { installFakeApi, changeEvent, failNext } from '../testUtils/fakeApi';
import { useEvent } from './useEvent';

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

// Records every status the hook returns, to show it never went back to loading
const openEvent = async () => {
  const seen = [];
  const hook = renderHook(
    () => {
      const value = useEvent('1');
      seen.push(value.status);
      return value;
    },
    { wrapper: AppProvider }
  );
  await waitFor(() => expect(hook.result.current.event?.name).toBe('Summer Music Festival'));
  return { ...hook, seen };
};

describe('useEvent refresh', () => {
  it('brings in what a friend changed, without going back to loading', async () => {
    const { result, seen } = await openEvent();
    changeEvent('1', (event) => { event.name = 'Festival (renamed by Alex)'; });

    await act(() => result.current.refresh());

    expect(result.current.event.name).toBe('Festival (renamed by Alex)');
    expect(seen.slice(seen.indexOf('ready'))).not.toContain('loading');
  });

  it('rejects when the server can not be reached, and keeps the event on screen', async () => {
    const { result, seen } = await openEvent();
    failNext('GET', '/events/1');

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.event.name).toBe('Summer Music Festival');
    expect(seen.slice(seen.indexOf('ready'))).not.toContain('loading');
  });

  it('resolves when the event is gone, which the screen then shows', async () => {
    const { result } = await openEvent();
    failNext('GET', '/events/1', 404);

    await act(() => result.current.refresh());

    expect(result.current.status).toBe('not-found');
  });
});
