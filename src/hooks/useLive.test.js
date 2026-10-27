import { act, renderHook, waitFor } from '@testing-library/react';
import { AppProvider } from '../context/AppContext';
import { installFakeApi, moveFriend } from '../testUtils/fakeApi';
import { useLive } from './useLive';

const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});

afterEach(() => jest.useRealTimers());

describe('useLive', () => {
  it("drops a friend when their share ends, even if the map read again just before", async () => {
    installFakeApi({ liveEvent: true, friendShareEndsInMs: 20000 }).logIn();
    const { result } = renderHook(() => useLive('5'), { wrapper: AppProvider });
    await waitFor(() => expect(result.current.people).toHaveLength(1));

    // 15 seconds in, a read brings a new position with the same end
    await advance(15000);
    moveFriend('5', 'u2', { lat: 33.787, lng: -84.373 });
    await act(() => result.current.reload());
    expect(result.current.people[0].lat).toBe(33.787);

    await advance(5100);
    expect(result.current.people).toHaveLength(0);
  });
});
