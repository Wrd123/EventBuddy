import React, { useState } from 'react';
import { Music, Calendar, Map, Users, Trophy, Ticket, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import { Button, ScreenLoader } from '../common';
import NotFound from './NotFound';
import { useEvent } from '../../hooks/useEvent';
import { todayISO } from '../../utils/dates';

export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 500;

// Returns the first problem as a user-facing message, or '' if valid.
// Expects trimmed values; the form trims before calling it.
// Dates are "YYYY-MM-DD" strings, which compare correctly as strings.
// allowPastStart: editing an event that already started, without moving
// its start date, is fine.
export const validateEvent = ({ name, startDate, endDate, description = '' }, today = todayISO(), { allowPastStart = false } = {}) => {
  if (!name) return 'Please enter an event name.';
  if (name.length > MAX_NAME_LENGTH) return `Event name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (!startDate) return 'Please choose a date.';
  if (startDate < today && !allowPastStart) return "The event can't start in the past.";
  if (!endDate) return 'Please choose an end date.';
  if (endDate < startDate) return 'The end date must be on or after the start date.';
  if (description.length > MAX_DESCRIPTION_LENGTH) return `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
  return '';
};

const EVENT_TYPES = [
  { id: 'music-festival', label: 'Music festival', icon: Music },
  { id: 'concert', label: 'Concert', icon: Calendar },
  { id: 'outdoor', label: 'Outdoor trip', icon: Map },
  { id: 'group-travel', label: 'Group travel', icon: Users },
  { id: 'sports', label: 'Sports', icon: Trophy },
  { id: 'arts', label: 'Arts & shows', icon: Ticket }
];

const BLANK = { name: '', type: 'music-festival', startDate: '', endDate: '', location: '', description: '' };

// The form behind Create event and Edit event. onSave gets the cleaned
// fields and returns a promise; errors it throws are shown on the form.
const EventForm = ({ initial = BLANK, submitLabel, savingLabel, onSave, footnote, children }) => {
  const [eventData, setEventData] = useState({
    ...initial,
    isMultiDay: Boolean(initial.endDate && initial.endDate !== initial.startDate)
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field, value) => setEventData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError('');

    // Validate and save the trimmed values, not the raw input.
    // A single-day event ends on the day it starts; isMultiDay is form-only.
    const { isMultiDay, ...fields } = eventData;
    const cleaned = {
      name: fields.name.trim(),
      type: fields.type,
      startDate: fields.startDate,
      endDate: isMultiDay ? fields.endDate : fields.startDate,
      location: fields.location.trim(),
      description: fields.description.trim()
    };

    const validationError = validateEvent(cleaned, todayISO(), {
      allowPastStart: Boolean(initial.startDate) && cleaned.startDate === initial.startDate
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(cleaned);
      // On success the screen navigates away; staying disabled until then
      // prevents a duplicate submit
    } catch (err) {
      setError(err.message || 'Could not save the event. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-4 flex-1 overflow-y-auto">
        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl mb-4" role="alert">
            {error}
          </div>
        )}

        <TextField
          id="event-name"
          label="Event name"
          placeholder="Lake weekend"
          maxLength={MAX_NAME_LENGTH}
          value={eventData.name}
          onChange={(value) => handleChange('name', value)}
        />

        <EventTypeSelector selectedType={eventData.type} onSelect={(type) => handleChange('type', type)} />

        <DateFields
          isMultiDay={eventData.isMultiDay}
          startDate={eventData.startDate}
          endDate={eventData.endDate}
          earliest={initial.startDate && initial.startDate < todayISO() ? initial.startDate : todayISO()}
          onChange={handleChange}
        />

        <TextField
          id="event-location"
          label="Location"
          placeholder="City, ST or a venue"
          value={eventData.location}
          onChange={(value) => handleChange('location', value)}
        />

        <div className="mb-4">
          <label htmlFor="event-description" className="block text-sm font-medium text-fg/80 mb-1">
            Description <span className="text-faint font-normal">(optional)</span>
          </label>
          <textarea
            id="event-description"
            className="field min-h-[88px] resize-none"
            placeholder="What's the plan? What should people bring?"
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={eventData.description}
            onChange={(e) => handleChange('description', e.target.value)}
          />
        </div>

        {footnote && <p className="text-sm text-muted">{footnote}</p>}
        {children}
      </div>

      <div className="p-4 border-t border-line">
        <Button onClick={handleSubmit} fullWidth variant="primary" size="lg" disabled={isSubmitting}>
          {isSubmitting ? savingLabel : submitLabel}
        </Button>
      </div>
    </>
  );
};

const CreateEvent = () => {
  const { createEvent } = useAppContext();
  const navigate = useNavigate();

  const save = async (fields) => {
    const { event } = await createEvent(fields);
    // replace: Back from the new event goes Home, not back into this form.
    // Open the invite sheet there, since inviting is the natural next step.
    navigate(`/events/${event._id}`, { replace: true, state: { showInvite: true } });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="New event" type="screen" showBack showProfile={false} />
      <EventForm
        submitLabel="Create event"
        savingLabel="Creating..."
        onSave={save}
        footnote="You'll get a link to invite friends once the event is created."
      />
    </div>
  );
};

// Changing or deleting an event. Organizer only, like the server.
export const EditEvent = () => {
  const { eventId } = useParams();
  const { event, status, error } = useEvent(eventId);
  const { currentUser, updateEvent, deleteEvent } = useAppContext();
  const navigate = useNavigate();

  if (status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  if (status === 'error') return <NotFound title="Couldn't load event" message={error} />;
  if (event.createdBy !== currentUser?._id) {
    return <NotFound title="Can't edit this event" message="Only the organizer can change this event." />;
  }

  const backTo = `/events/${eventId}`;
  const save = async (fields) => {
    await updateEvent(eventId, fields);
    navigate(backTo, { replace: true });
  };
  const remove = async () => {
    await deleteEvent(eventId);
    navigate('/', { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Edit event" type="screen" showBack backTo={backTo} showProfile={false} />
      <EventForm
        initial={{
          name: event.name,
          type: event.type,
          startDate: event.startDate,
          endDate: event.endDate,
          location: event.location || '',
          description: event.description || ''
        }}
        submitLabel="Save changes"
        savingLabel="Saving..."
        onSave={save}
      >
        <DeleteEvent eventName={event.name} onDelete={remove} />
      </EventForm>
    </div>
  );
};

// Deleting asks first, since it removes the event for everyone
const DeleteEvent = ({ eventName, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onDelete();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="mt-6 flex items-center text-sm font-semibold text-red-300">
        <Trash2 size={16} className="mr-2" aria-hidden="true" />
        Delete event
      </button>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-3" role="alertdialog" aria-labelledby="delete-title">
      <p id="delete-title" className="font-semibold mb-1">Delete {eventName}?</p>
      <p className="text-sm text-muted mb-3">
        This removes it for everyone, along with its schedule, chat and expenses. It can't be undone.
      </p>
      {error && <p className="text-sm text-red-300 mb-2" role="alert">{error}</p>}
      <div className="flex space-x-2">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy} className="flex-1">Keep it</Button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex-1 rounded-xl bg-red-500 text-white font-semibold py-2 disabled:opacity-50"
        >
          {busy ? 'Deleting...' : 'Delete event'}
        </button>
      </div>
    </div>
  );
};

const TextField = ({ id, label, onChange, ...input }) => (
  <div className="mb-4">
    <label htmlFor={id} className="block text-sm font-medium text-fg/80 mb-1">{label}</label>
    <input id={id} type="text" className="field" onChange={(e) => onChange(e.target.value)} {...input} />
  </div>
);

const EventTypeSelector = ({ selectedType, onSelect }) => (
  <fieldset className="mb-4">
    <legend className="block text-sm font-medium text-fg/80 mb-1">Event type</legend>
    <div className="grid grid-cols-2 gap-2">
      {EVENT_TYPES.map(({ id, label, icon: Icon }) => {
        const isSelected = selectedType === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isSelected}
            className={`border p-2 rounded-xl flex items-center justify-center ${
              isSelected ? 'border-violet bg-violet/10 text-violet-soft' : 'border-line text-fg/80'
            }`}
            onClick={() => onSelect(id)}
          >
            <Icon className="mr-2" size={16} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  </fieldset>
);

// type="date" opens the phone's native date picker and always yields
// "YYYY-MM-DD". min blocks past days in the picker; validateEvent still
// checks, since min isn't enforced on typed input in every browser.
const DateFields = ({ isMultiDay, startDate, endDate, earliest, onChange }) => (
  <div className="mb-4">
    <label className="flex items-center mb-2 text-sm text-fg/80">
      <input
        type="checkbox"
        className="mr-2 h-4 w-4 accent-violet"
        checked={isMultiDay}
        onChange={(e) => onChange('isMultiDay', e.target.checked)}
      />
      Multi-day event
    </label>

    <div className={isMultiDay ? 'grid grid-cols-2 gap-2' : ''}>
      <div>
        <label htmlFor="event-start-date" className="block text-sm font-medium text-fg/80 mb-1">
          {isMultiDay ? 'Start date' : 'Date'}
        </label>
        <input
          id="event-start-date"
          type="date"
          className="field"
          min={earliest}
          value={startDate}
          onChange={(e) => onChange('startDate', e.target.value)}
        />
      </div>

      {isMultiDay && (
        <div>
          <label htmlFor="event-end-date" className="block text-sm font-medium text-fg/80 mb-1">
            End date
          </label>
          <input
            id="event-end-date"
            type="date"
            className="field"
            min={startDate || earliest}
            value={endDate}
            onChange={(e) => onChange('endDate', e.target.value)}
          />
        </div>
      )}
    </div>
  </div>
);

export default CreateEvent;
