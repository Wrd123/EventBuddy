import React, { useState } from 'react';
import { Flag, Navigation, Radio } from 'lucide-react';
import { Button, DemoFriendsNote, Sheet, useSheet } from '../common';
import { agoText, directionsUrl, shareDurations, untilText } from '../../utils/live';
import { tracksInBackground } from '../../services/locationTracker';

export const DirectionsLink = ({ to }) => (
  <a
    href={directionsUrl(to)}
    target="_blank"
    rel="noopener noreferrer"
    className="flex-1 inline-flex items-center justify-center h-11 rounded-full border border-line bg-white/[0.08] font-semibold text-fg transition-transform active:scale-[0.97]"
  >
    <Navigation size={16} className="mr-2 text-accent-soft" aria-hidden="true" />
    Get directions
  </a>
);

// Top of the map's panel while an event is happening: whether you're
// sharing, with the controls for sharing and the meetup point
export const LiveBar = ({ event, live, trackingError, onShare, onSetMeetup }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sharingCount = live.people.length;

  const stop = async () => {
    setBusy(true);
    setError('');
    try {
      await live.stopSharing();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card rounded-[22px] p-3.5 mb-3" aria-label={`Live at ${event.name}`}>
      <div className="flex items-center text-sm font-semibold mb-1">
        <Radio size={16} className="mr-2 text-go shrink-0" aria-hidden="true" />
        <span className="truncate">Live at {event.name}</span>
      </div>
      <p className="text-sm text-muted mb-3">
        {live.stopPending
          ? `Couldn't stop sharing yet. Friends can still see your last spot ${untilText(live.sharing.until)}.`
          : live.sharing
            ? `You're sharing your location ${untilText(live.sharing.until)}.`
            : sharingCount === 0
              ? 'Nobody is sharing their location yet.'
              : `${sharingCount} ${sharingCount === 1 ? 'friend is' : 'friends are'} sharing their location.`}
      </p>
      {(trackingError || error) && (
        <p className="text-sm text-red-300 mb-3" role="alert">{trackingError || error}</p>
      )}
      <div className="flex space-x-2">
        {live.sharing ? (
          <Button variant="secondary" onClick={stop} disabled={busy} className="flex-1 h-11 px-3 whitespace-nowrap text-[15px]">Stop sharing</Button>
        ) : (
          <Button onClick={onShare} className="flex-1 h-11 px-3 whitespace-nowrap text-[15px]">Share my location</Button>
        )}
        <Button variant="secondary" onClick={onSetMeetup} icon={<Flag size={16} />} className="flex-1 h-11 px-3 whitespace-nowrap text-[15px]">
          {live.meetup ? 'Move meetup' : 'Set meetup'}
        </Button>
      </div>
      <DemoFriendsNote className="mt-3" />
    </section>
  );
};

// Choosing how long to share
export const ShareSheet = ({ event, onShare, onClose }) => (
  <Sheet title="Share your location" onClose={onClose} className="p-4">
    <ShareChoices event={event} onShare={onShare} />
  </Sheet>
);

// Its own component so it can close the sheet with the exit animation once
// sharing has started
const ShareChoices = ({ event, onShare }) => {
  const { close } = useSheet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const share = async (until) => {
    setBusy(true);
    setError('');
    try {
      await onShare(until);
      close();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-sm text-muted mb-4">
        Everyone in {event.name} will see where you are on the map until it ends or you stop.
        {tracksInBackground
          ? ' It keeps working with your phone locked, and your phone shows that location is in use.'
          : " On the web, updates pause while EventBuddy isn't open."}
      </p>
      {error && <p className="text-sm text-red-300 mb-3" role="alert">{error}</p>}
      <div className="space-y-2">
        {shareDurations().map(option => (
          <Button key={option.label} variant="secondary" fullWidth disabled={busy} onClick={() => share(option.until)}>
            {option.label}
          </Button>
        ))}
      </div>
    </>
  );
};

// A friend's pin, tapped. here: they have the app open right now. now: the
// time to count from, the same one the map's captions use.
export const FriendPanel = ({ person, here = false, now = Date.now() }) => (
  <div>
    <div className="flex items-center mb-3">
      <div className="relative mr-3 shrink-0" aria-hidden="true">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: person.color }}
        >
          {person.name.charAt(0)}
        </div>
        {here && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-go rounded-full border-2 border-night" />}
      </div>
      <div className="min-w-0">
        <h2 className="font-bold truncate">{person.name}</h2>
        <p className="text-sm text-muted">
          {here && 'Here now • '}Updated {agoText(person.positionAt, now)} • sharing {untilText(person.until)}
        </p>
      </div>
    </div>
    <div className="flex"><DirectionsLink to={person} /></div>
  </div>
);

// The meetup pin, tapped
export const MeetupPanel = ({ meetup, onClear }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <div className="flex items-start mb-3">
        <div className="w-11 h-11 rounded-xl bg-amber-500 text-night flex items-center justify-center mr-3 shrink-0" aria-hidden="true">
          <Flag size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold">{meetup.note || 'Meetup point'}</h2>
          <p className="text-sm text-muted">
            {meetup.time && `At ${formatTime(meetup.time)} • `}Set by {meetup.setBy?.name || 'someone'} {agoText(meetup.setAt)}
          </p>
        </div>
      </div>
      <div className="flex space-x-2">
        <DirectionsLink to={meetup} />
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onClear();
            } finally {
              setBusy(false);
            }
          }}
          className="flex-1"
        >
          Remove
        </Button>
      </div>
    </div>
  );
};

const formatTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Placing the meetup point: the map shows a crosshair in the middle, and
// this saves wherever it's pointing
export const MeetupForm = ({ existing, onSave, onCancel }) => {
  const [note, setNote] = useState(existing?.note || '');
  const [time, setTime] = useState(existing?.time || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ note: note.trim(), time });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <h2 className="font-bold mb-1">Set the meetup point</h2>
      <p className="text-sm text-muted mb-3">Move the map until the flag is where everyone should meet.</p>
      {error && <p className="text-sm text-red-300 mb-2" role="alert">{error}</p>}
      <div className="flex space-x-2 mb-3">
        <input
          aria-label="Meetup note"
          className="field flex-1"
          placeholder="By the main stage"
          maxLength={80}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <input
          aria-label="Meetup time"
          type="time"
          className="field w-32"
          value={time}
          onChange={e => setTime(e.target.value)}
        />
      </div>
      <div className="flex space-x-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" disabled={busy} className="flex-1">Save meetup</Button>
      </div>
    </form>
  );
};
