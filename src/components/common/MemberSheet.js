import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { useAppContext } from '../../context/AppContext';
import { useSharing } from '../../context/SharingContext';

// Bottom sheet for one person in "Who's going": you can leave from your own,
// and the organizer can remove anyone else. The parent must be position:
// relative, since the sheet covers it.
const MemberSheet = ({ event, member, onClose }) => {
  const { currentUser, leaveEvent, removeMember } = useAppContext();
  const { share, setShare } = useSharing();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  // { message, unsettled }: unsettled when the balance stands in the way
  const [error, setError] = useState(null);

  const me = currentUser?._id;
  const isMe = member.user === me;
  const isOrganizerCard = member.user === event.createdBy;
  const action = isMe && !isOrganizerCard ? 'leave' : !isMe && event.createdBy === me ? 'remove' : null;
  const firstName = member.name.split(' ')[0];

  const act = async () => {
    // Both are hard to undo, so the first tap only asks
    if (!confirming) {
      // A message from the last try would muddle the new question
      setError(null);
      setConfirming(true);
      return;
    }
    setError(null);
    setIsWorking(true);
    try {
      if (action === 'leave') {
        await leaveEvent(event._id);
        // The server ended your sharing for this event; stop on this phone too
        if (share?.eventId === event._id) setShare(null);
        navigate('/', { replace: true });
        return;
      }
      await removeMember(event._id, member.user);
      onClose();
    } catch (err) {
      // The only 409 here: a balance that isn't settled yet (the organizer's
      // own card offers no action)
      setError({ message: err.message, unsettled: err.status === 409 });
      setConfirming(false);
      setIsWorking(false);
    }
  };

  const label = action === 'leave'
    ? (confirming ? 'Tap again to leave' : 'Leave event')
    : (confirming ? `Tap again to remove ${firstName}` : 'Remove from event');

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end sheet-scrim" role="dialog" aria-modal="true" aria-labelledby="member-title">
      <div className="sheet p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar initial={member.name.charAt(0)} color={member.color} size="lg" />
            <div className="min-w-0">
              <h2 id="member-title" className="text-lg font-semibold truncate">{isMe ? `${member.name} (you)` : member.name}</h2>
              {isOrganizerCard && <p className="text-sm text-accent-soft">Organizer</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-faint p-2 -m-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {action === 'remove' && confirming && (
          <p className="text-sm text-muted mb-3">
            {firstName} will lose access to the plans, chat and map, and can't rejoin with the invite link unless you let them back in.
          </p>
        )}
        {action === 'leave' && confirming && (
          <p className="text-sm text-muted mb-3">
            You'll lose access to the plans, chat and map. You can rejoin with the invite link.
          </p>
        )}

        {error && (
          <div className="text-sm text-red-400 mb-3" role="alert">
            {error.message}
            {error.unsettled && (
              <Link to={`/events/${event._id}/expenses`} className="block mt-1 text-accent-soft font-medium">Go to Expenses</Link>
            )}
          </div>
        )}

        {action && (
          <button
            onClick={act}
            disabled={isWorking}
            className="w-full h-12 rounded-full border border-red-400/40 text-red-400 font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {isWorking ? (action === 'leave' ? 'Leaving...' : 'Removing...') : label}
          </button>
        )}
      </div>
    </div>
  );
};

export default MemberSheet;
