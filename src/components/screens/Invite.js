import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Calendar, MapPin, Users } from 'lucide-react';
import Header from '../common/Header';
import { Button, ScreenLoader } from '../common';
import NotFound from './NotFound';
import { useAppContext } from '../../context/AppContext';
import * as eventService from '../../services/eventService';
import { formatDateRange } from '../../utils/dates';

// /invite/:code: what someone sees after opening an invite link (and logging
// in or signing up first, if needed). One tap joins the event.
const Invite = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { joinEvent } = useAppContext();
  const [state, setState] = useState({ status: 'loading', invite: null, error: '' });
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    let cancelled = false;
    eventService.getInvite(code)
      .then(invite => !cancelled && setState({ status: 'ready', invite, error: '' }))
      .catch(err => !cancelled && setState({ status: 'error', invite: null, error: err.message }));
    return () => { cancelled = true; };
  }, [code]);

  if (state.status === 'loading') return <ScreenLoader />;
  if (state.status === 'error') return <NotFound title="Invite not found" message={state.error} />;

  const { invite } = state;
  // Already in (including the organizer opening their own link): go straight there
  if (invite.isMember) return <Navigate to={`/events/${invite.eventId}`} replace />;

  const handleJoin = async () => {
    setJoinError('');
    setIsJoining(true);
    try {
      await joinEvent(code);
      // replace: Back from the event shouldn't return to this invite
      navigate(`/events/${invite.eventId}`, { replace: true });
    } catch (err) {
      setJoinError(err.message);
      setIsJoining(false);
    }
  };

  const others = invite.memberCount - 1;

  return (
    <div className="flex flex-col h-full">
      <Header title="You're invited" type="screen" showBack={true} showProfile={false} showNotifications={false} />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow p-5 text-center">
          <p className="text-sm text-gray-500 mb-1">
            {invite.organizerName ? `${invite.organizerName} invited you to` : "You're invited to"}
          </p>
          <h2 className="text-2xl font-bold mb-4">{invite.name}</h2>

          <div className="space-y-2 text-left text-gray-700 mb-2">
            <div className="flex items-center">
              <Calendar size={18} className="mr-2 text-purple-600 shrink-0" />
              {formatDateRange(invite.startDate, invite.endDate)}
            </div>
            {invite.location && (
              <div className="flex items-center">
                <MapPin size={18} className="mr-2 text-purple-600 shrink-0" />
                {invite.location}
              </div>
            )}
            <div className="flex items-center">
              <Users size={18} className="mr-2 text-purple-600 shrink-0" />
              {invite.memberCount} {invite.memberCount === 1 ? 'person' : 'people'} going
              {others > 0 && invite.organizerName ? ` (${invite.organizerName} + ${others})` : ''}
            </div>
          </div>
        </div>

        {joinError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">{joinError}</div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <Button onClick={handleJoin} fullWidth size="lg" disabled={isJoining}>
          {isJoining ? 'Joining...' : 'Join event'}
        </Button>
      </div>
    </div>
  );
};

export default Invite;
