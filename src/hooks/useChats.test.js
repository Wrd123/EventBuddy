import { act, renderHook, waitFor } from '@testing-library/react';
import { installFakeApi, receiveMessage, failNext } from '../testUtils/fakeApi';
import { useChats } from './useChats';

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

const openChats = async () => {
  const seen = [];
  const hook = renderHook(() => {
    const value = useChats();
    seen.push(value.status);
    return value;
  });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return { ...hook, seen };
};

const unreadOf = (result) => result.current.chats.find((chat) => chat.eventId === '1').unread;

describe('useChats refresh', () => {
  it("shows a friend's new message without going back to loading", async () => {
    const { result, seen } = await openChats();
    expect(unreadOf(result)).toBe(2);
    receiveMessage('1', { text: 'Anyone there?' });

    await act(() => result.current.refresh());

    expect(unreadOf(result)).toBe(3);
    expect(seen.slice(seen.indexOf('ready'))).not.toContain('loading');
  });

  it('rejects when the server can not be reached, and keeps the chats on screen', async () => {
    const { result } = await openChats();
    failNext('GET', '/chats');

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow();
    });

    expect(result.current.status).toBe('ready');
    expect(unreadOf(result)).toBe(2);
  });

  it('stays quiet when a poll or reload fails', async () => {
    const { result } = await openChats();
    failNext('GET', '/chats');

    await act(() => result.current.reload());

    expect(result.current.status).toBe('ready');
  });
});
