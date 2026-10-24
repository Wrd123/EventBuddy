import { useState, useCallback, useEffect } from 'react';
import * as chatService from '../services/chatService';
import { usePolling } from './useChat';

// The Groups list refreshes less often than an open chat
export const CHATS_POLL_MS = 15000;

// Your event chats for the Groups tab, newest activity first.
// status: 'loading' | 'ready' | 'error'
export const useChats = () => {
  const [state, setState] = useState({ status: 'loading', chats: [], error: '' });

  const load = useCallback(async () => {
    try {
      const chats = await chatService.getChats();
      setState({ status: 'ready', chats, error: '' });
    } catch (err) {
      // Keep showing what we had if a refresh fails
      setState(prev => (prev.status === 'ready' ? prev : { status: 'error', chats: [], error: err.message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, CHATS_POLL_MS);

  return { ...state, reload: load };
};
