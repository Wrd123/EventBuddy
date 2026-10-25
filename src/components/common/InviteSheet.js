import React, { useState, useEffect } from 'react';
import { Copy, Share2, X } from 'lucide-react';
import Button from './Button';
import { useAppContext } from '../../context/AppContext';
import { inviteUrl } from '../../utils/invites';
import * as eventService from '../../services/eventService';

// Bottom sheet for sharing an event's invite link. The parent must be
// position: relative, since the sheet covers it.
const InviteSheet = ({ event, isOrganizer, onClose }) => {
  const { resetInviteLink } = useAppContext();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const url = inviteUrl(event.inviteCode);
  // The phone's own share sheet (Messages, WhatsApp...), where supported
  const canShare = typeof navigator.share === 'function';

  const share = async () => {
    try {
      await navigator.share({ title: event.name, text: `Join "${event.name}" on EventBuddy`, url });
    } catch {
      // Closing the share sheet without sharing also rejects; nothing to do
    }
  };

  const copy = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied');
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it instead.");
    }
  };

  const reset = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setError('');
    setIsResetting(true);
    try {
      await resetInviteLink(event._id);
      setMessage('New link created. The old one no longer works.');
      setConfirmingReset(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end sheet-scrim" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="sheet p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 id="invite-title" className="text-lg font-semibold">Invite friends</h2>
          <button onClick={onClose} className="text-faint" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-muted mb-3">
          Anyone with this link can join {event.name}. They'll sign up first if they're new.
        </p>

        <input
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(e) => e.target.select()}
          className="field bg-raised text-sm mb-3"
        />

        {message && <p className="text-sm text-go mb-3" role="status">{message}</p>}
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <div className={canShare ? 'grid grid-cols-2 gap-2' : ''}>
          {canShare && (
            <Button onClick={share} fullWidth icon={<Share2 size={16} />}>Share</Button>
          )}
          <Button onClick={copy} variant={canShare ? 'outline' : 'primary'} fullWidth icon={<Copy size={16} />}>
            Copy link
          </Button>
        </div>

        {isOrganizer && <RemovedPeople eventId={event._id} />}

        {isOrganizer && (
          <button
            onClick={reset}
            disabled={isResetting}
            className="w-full mt-3 py-2 text-sm text-red-400 font-medium disabled:opacity-50"
          >
            {confirmingReset ? 'Tap again: the current link will stop working' : 'Reset link'}
          </button>
        )}
      </div>
    </div>
  );
};

// People the organizer removed can't come back through the link. Listed
// here, next to the link, so letting someone back in is easy to find.
const RemovedPeople = ({ eventId }) => {
  const [removed, setRemoved] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    eventService.getRemoved(eventId)
      .then(list => !cancelled && setRemoved(list))
      // Not worth interrupting sharing the link over; the list just stays empty
      .catch(() => {});
    return () => { cancelled = true; };
  }, [eventId]);

  const letBackIn = async (person) => {
    setError('');
    try {
      await eventService.letBackIn(eventId, person.user);
      setRemoved(prev => prev.filter(p => p.user !== person.user));
    } catch (err) {
      setError(err.message);
    }
  };

  if (removed.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-muted mb-2">Removed</h3>
      <ul className="space-y-1">
        {removed.map(person => (
          <li key={person.user} className="flex items-center justify-between text-sm">
            <span className="truncate">{person.name}</span>
            <button onClick={() => letBackIn(person)} className="text-accent-soft font-medium px-3 py-2 -mr-3">
              Let back in
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
};

export default InviteSheet;
