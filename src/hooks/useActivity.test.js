import { act, renderHook, waitFor } from '@testing-library/react';
import { installFakeApi, addActivity, removeEvent, holdNext, failNext, settle } from '../testUtils/fakeApi';
import { useActivity } from './useActivity';

// n lines in event 1, oldest first, with ids that sort like real ones
const history = (n) => Array.from({ length: n }, (_, i) => ({
  _id: `a${String(i + 1).padStart(4, '0')}`,
  actor: { user: 'u2', name: 'Alex' },
  kind: 'joined',
  data: {},
  createdAt: new Date().toISOString()
}));

const ids = (result) => result.current.items.map((line) => line._id);

const open = async (lines = 25) => {
  installFakeApi({ activity: { '1': history(lines) } }).logIn();
  const hook = renderHook(() => useActivity('1'));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
};

beforeEach(() => {
  localStorage.clear();
});

describe('useActivity', () => {
  it('starts with the newest page, and pages back to the start', async () => {
    const { result } = await open(25);
    expect(ids(result)).toHaveLength(20);
    expect(ids(result)[0]).toBe('a0025');
    expect(result.current.hasMore).toBe(true);

    await act(() => result.current.loadOlder());
    expect(ids(result)).toHaveLength(25);
    expect(ids(result).at(-1)).toBe('a0001');
    expect(result.current.hasMore).toBe(false);

    // A new line doesn't bring back "there's more"
    addActivity('1', { kind: 'meetup_set' });
    await act(() => result.current.refresh());
    expect(ids(result)).toHaveLength(26);
    expect(result.current.hasMore).toBe(false);
  });

  it('starts over from the newest when more than a page arrived while away, leaving no gap', async () => {
    const { result } = await open(25);
    for (let i = 0; i < 21; i += 1) addActivity('1', { kind: 'joined' });

    await act(() => result.current.refresh());
    expect(ids(result)).toHaveLength(20);
    expect(ids(result)).not.toContain('a0025');
    expect(result.current.hasMore).toBe(true);
  });

  it("doesn't add an older page asked for before the list started over", async () => {
    const { result } = await open(25);
    const release = holdNext('GET', '/events/1/activity');
    act(() => { result.current.loadOlder(); });
    for (let i = 0; i < 21; i += 1) addActivity('1', { kind: 'joined' });
    await act(() => result.current.refresh());

    await release();
    await settle();
    expect(ids(result)).toHaveLength(20);
    expect(ids(result)).not.toContain('a0001');
    expect(result.current.hasMore).toBe(true);
  });

  it('keeps nothing once the event is gone, even an older page that was on its way', async () => {
    const { result } = await open(25);
    const release = holdNext('GET', '/events/1/activity');
    act(() => { result.current.loadOlder(); });
    removeEvent('1');
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('gone');
    expect(result.current.items).toEqual([]);

    await release();
    await settle();
    expect(result.current.status).toBe('gone');
    expect(result.current.items).toEqual([]);
  });

  it("doesn't let a slow read from before you lost access bring the lines back", async () => {
    const { result } = await open(25);
    // A refresh the server answered with the lines, still on its way...
    const release = holdNext('GET', '/events/1/activity');
    act(() => { result.current.refresh(); });
    // ...when an older page finds the event gone
    removeEvent('1');
    await act(() => result.current.loadOlder());
    expect(result.current.status).toBe('gone');

    await release();
    await settle();
    expect(result.current.status).toBe('gone');
    expect(result.current.items).toEqual([]);
  });

  it('keeps what it has when a read fails, and says when an older page does', async () => {
    const { result } = await open(25);
    failNext('GET', '/events/1/activity');
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('ready');
    expect(ids(result)).toHaveLength(20);

    failNext('GET', '/events/1/activity');
    await act(() => result.current.loadOlder());
    expect(result.current.olderError).toBe("Couldn't load earlier activity. Try again.");
    expect(ids(result)).toHaveLength(20);
  });
});
