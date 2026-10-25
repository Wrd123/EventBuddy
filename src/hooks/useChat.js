import { useState, useEffect, useCallback, useRef } from 'react';
import * as chatService from '../services/chatService';
import { mergeMessages } from '../utils/chat';
import { newClientId } from '../utils/clientId';
import { usePolling, isVisible } from './usePolling';

// How often an open chat checks for new messages. Polling keeps the server
// simple; a few seconds' delay is fine for planning with friends.
export const POLL_MS = 4000;

// An event's group chat: its messages (oldest first), live while open.
// status: 'loading' | 'ready' | 'error'. pending: messages you've sent that
// the server hasn't confirmed, each { tempId, text, failed }. The tempId is
// also the send's clientId, so a retry can't post the message twice.
export const useChat = (eventId) => {
  const [state, setState] = useState({ status: 'loading', messages: [], hasMore: false, error: '' });
  const [pending, setPending] = useState([]);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const messagesRef = useRef([]);
  messagesRef.current = state.messages;
  const polling = useRef(false);
  const markedRead = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', messages: [], hasMore: false, error: '' });
    chatService.getMessages(eventId)
      .then(({ messages, hasMore }) => !cancelled && setState({ status: 'ready', messages, hasMore, error: '' }))
      .catch(err => !cancelled && setState(prev => ({ ...prev, status: 'error', error: err.message })));
    return () => { cancelled = true; };
  }, [eventId]);

  // Most polls find nothing new. Checking before setState skips the update
  // entirely: React schedules a render for any setState(fn), even one that
  // ends up returning the same state.
  const addMessages = useCallback((incoming) => {
    // A message that's arrived (from polling, or the send that was thought
    // to have failed) is no longer pending, so it never shows twice
    const arrived = new Set(incoming.map(m => m.clientId).filter(Boolean));
    if (arrived.size > 0) {
      setPending(prev => (prev.some(p => arrived.has(p.tempId)) ? prev.filter(p => !arrived.has(p.tempId)) : prev));
    }
    if (mergeMessages(messagesRef.current, incoming) === messagesRef.current) return;
    setState(prev => {
      const messages = mergeMessages(prev.messages, incoming);
      return messages === prev.messages ? prev : { ...prev, messages };
    });
  }, []);

  // Fetch whatever arrived since the newest message we have. A failed check
  // is simply tried again next time.
  const poll = useCallback(async () => {
    const newest = messagesRef.current.at(-1);
    if (state.status !== 'ready' || polling.current) return;
    polling.current = true;
    try {
      const { messages } = await chatService.getMessages(eventId, { after: newest?._id });
      addMessages(messages);
    } catch {
      // Offline or the server is restarting; the next poll retries
    } finally {
      polling.current = false;
    }
  }, [eventId, state.status, addMessages]);

  usePolling(poll, POLL_MS);

  // Seeing the newest message marks the chat read, so it stops counting as
  // unread on the Groups tab
  const newestId = state.messages.at(-1)?._id;
  useEffect(() => {
    if (!newestId || markedRead.current === newestId || !isVisible()) return;
    markedRead.current = newestId;
    chatService.markChatRead(eventId, newestId).catch(() => {
      markedRead.current = null; // try again with the next message
    });
  }, [eventId, newestId]);

  const deliver = useCallback(async (tempId, text) => {
    try {
      const message = await chatService.sendMessage(eventId, text, tempId);
      addMessages([message]);
      setPending(prev => prev.filter(p => p.tempId !== tempId));
    } catch (err) {
      setPending(prev => prev.map(p => (p.tempId === tempId ? { ...p, failed: true, error: err.message } : p)));
    }
  }, [eventId, addMessages]);

  // Shows the message straight away; it settles once the server has it
  const send = useCallback((text) => {
    const tempId = newClientId();
    setPending(prev => [...prev, { tempId, text, failed: false }]);
    deliver(tempId, text);
  }, [deliver]);

  const retry = useCallback((tempId) => {
    const item = pending.find(p => p.tempId === tempId);
    if (!item) return;
    setPending(prev => prev.map(p => (p.tempId === tempId ? { ...p, failed: false } : p)));
    deliver(tempId, item.text);
  }, [pending, deliver]);

  const discard = useCallback((tempId) => {
    setPending(prev => prev.filter(p => p.tempId !== tempId));
  }, []);

  const loadEarlier = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const { messages, hasMore } = await chatService.getMessages(eventId, { before: oldest._id });
      setState(prev => ({ ...prev, messages: mergeMessages(messages, prev.messages), hasMore }));
    } catch {
      // The button stays, so it can be tapped again
    } finally {
      setLoadingEarlier(false);
    }
  }, [eventId, loadingEarlier]);

  return { ...state, pending, send, retry, discard, loadEarlier, loadingEarlier };
};
