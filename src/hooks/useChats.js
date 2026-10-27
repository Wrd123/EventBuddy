import { useState, useCallback, useEffect } from 'react';
import * as chatService from '../services/chatService';
import { usePolling } from './usePolling';

// The Groups list refreshes less often than an open chat
export const CHATS_POLL_MS = 15000;

// Your event chats for the Groups tab, newest activity first.
// status: 'loading' | 'ready' | 'error'
export const useChats = () => {
  const [state, setState] = useState({ status: 'loading', chats: [], error: '' });

  // Polls stay quiet when a check fails. A pull to refresh (rethrow) needs
  // to know, so it can say so.
  const read = useCallback(async (rethrow) => {
    try {
      const chats = await chatService.getChats();
      setState({ status: 'ready', chats, error: '' });
    } catch (err) {
      // Keep showing what we had if a refresh fails
      setState(prev => (prev.status === 'ready' ? prev : { status: 'error', chats: [], error: err.message }));
      if (rethrow) throw err;
    }
  }, []);

  // No arguments, so it can be an onClick or a poll
  const load = useCallback(() => read(false), [read]);
  const refresh = useCallback(() => read(true), [read]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, CHATS_POLL_MS);

  return { ...state, reload: load, refresh };
};
