import React, { useState, useEffect, useRef } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import Header from '../common/Header';
import { Button, ScreenLoader } from '../common';
import NotFound from './NotFound';
import { useEvent } from '../../hooks/useEvent';
import { useAppContext } from '../../context/AppContext';
import { eachDay, formatDay, defaultScheduleDay } from '../../utils/dates';
import { formatTimeRange, sortSchedule, isGoing, validateScheduleItem } from '../../utils/schedule';

const Schedule = () => {
  const { eventId } = useParams();
  const { event, status, error } = useEvent(eventId);
  // null until the user picks a tab; until then show the default day.
  // Derived rather than initial state, since the event may still be loading.
  const [chosenDay, setChosenDay] = useState(null);
  // null (no form), 'new', or the item being edited
  const [editing, setEditing] = useState(null);

  if (status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') {
    return <NotFound title="Couldn't load event" message={error} />;
  }

  const days = eachDay(event.startDate, event.endDate);
  const activeDay = chosenDay ?? defaultScheduleDay(event);
  const items = sortSchedule(event.schedule.filter(item => item.date === activeDay));

  return (
    <div className="flex flex-col h-full relative">
      <Header
        title="Schedule"
        type="screen"
        showBack={true}
        showProfile={false}
        showNotifications={false}
        backTo={`/events/${eventId}`}
      />

      <div className="p-4 flex-1 overflow-y-auto">
        <DaySelector
          days={days}
          activeDay={activeDay}
          setActiveDay={setChosenDay}
        />

        <ScheduleItems event={event} items={items} onEdit={setEditing} />

        <Button variant="outline" fullWidth className="mt-4" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
          Add to {formatDay(activeDay)}
        </Button>
      </div>

      {editing && (
        <ScheduleItemForm
          event={event}
          days={days}
          item={editing === 'new' ? null : editing}
          defaultDay={activeDay}
          onClose={() => setEditing(null)}
          // Show the day the item was saved on, in case it was moved
          onSaved={(day) => {
            setChosenDay(day);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const DaySelector = ({ days, activeDay, setActiveDay }) => {
  const activeRef = useRef(null);

  // Long events have more tabs than fit; keep the selected one visible,
  // e.g. when the schedule opens on day 6 of a festival
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeDay]);

  return (
    <div className="flex overflow-x-auto no-scrollbar space-x-2 mb-4">
      {days.map((day) => (
        <button
          key={day}
          ref={activeDay === day ? activeRef : null}
          className={`flex-shrink-0 px-4 py-2 rounded-full ${
            activeDay === day
              ? 'bg-violet text-white'
              : 'bg-surface text-fg/80 border border-line'
          }`}
          onClick={() => setActiveDay(day)}
        >
          {formatDay(day)}
        </button>
      ))}
    </div>
  );
};

const ScheduleItems = ({ event, items, onEdit }) => {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nothing scheduled for this day yet.</p>;
  }

  return (
    <div className="flex flex-col space-y-4">
      {items.map((item) => (
        <ScheduleItem key={item._id} event={event} item={item} onEdit={() => onEdit(item)} />
      ))}
    </div>
  );
};

const ScheduleItem = ({ event, item, onEdit }) => {
  const { currentUser, setGoing } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const going = isGoing(item, currentUser?._id);
  // Highlight plans most of the group is going to
  const isPopular = item.attendees.length > 2;

  const toggleGoing = async () => {
    setError('');
    setIsSaving(true);
    try {
      await setGoing(event._id, item._id, !going);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`card p-3 ${isPopular ? 'border-l-4 border-violet' : ''}`}>
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <div className="text-sm text-muted mb-1">{formatTimeRange(item.startTime, item.endTime)}</div>
          <div className="font-medium mb-1">{item.activity}</div>
          {item.location && <div className="text-sm mb-2">{item.location}</div>}
        </div>
        <button onClick={onEdit} className="text-faint p-1 -mr-1" aria-label={`Edit ${item.activity}`}>
          <Pencil size={16} />
        </button>
      </div>

      <div className="flex justify-between items-center">
        <AttendeesList attendees={item.attendees} members={event.members} />

        <button
          onClick={toggleGoing}
          disabled={isSaving}
          aria-pressed={going}
          className={`text-xs font-medium flex items-center px-3 py-1 rounded-full disabled:opacity-50 ${
            going ? 'bg-violet text-white' : 'text-violet-soft border border-violet'
          }`}
        >
          {going ? <Check size={14} className="mr-1" /> : <Plus size={14} className="mr-1" />}
          {going ? 'Going' : 'Join'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
};

// An attendee's avatar color comes from their member entry, so people look
// the same everywhere in the event
const colorFor = (attendee, members) => {
  const member = members.find(m =>
    attendee.user ? m.user === attendee.user : !m.user && m.name === attendee.name
  );
  return member?.color || '#9ca3af';
};

const AttendeesList = ({ attendees, members }) => {
  if (attendees.length === 0) {
    return <div className="text-xs text-faint">No one going yet</div>;
  }

  return (
    <div className="flex space-x-1">
      <div className="flex -space-x-2">
        {attendees.slice(0, 3).map((attendee) => (
          <div
            key={attendee.user || attendee.name}
            className="w-6 h-6 rounded-full border border-night flex items-center justify-center text-white text-xs"
            style={{ backgroundColor: colorFor(attendee, members) }}
            title={attendee.name}
          >
            {attendee.name.charAt(0)}
          </div>
        ))}

        {attendees.length > 3 && (
          <div className="w-6 h-6 bg-faint rounded-full border border-night flex items-center justify-center text-white text-xs">
            +{attendees.length - 3}
          </div>
        )}
      </div>
      <div className="text-xs text-muted self-center ml-1">{attendees.length} going</div>
    </div>
  );
};

// Bottom sheet for adding (item is null) or editing a schedule item
const ScheduleItemForm = ({ event, days, item, defaultDay, onClose, onSaved }) => {
  const { addScheduleItem, updateScheduleItem, deleteScheduleItem } = useAppContext();
  const [fields, setFields] = useState({
    activity: item?.activity ?? '',
    date: item?.date ?? defaultDay,
    startTime: item?.startTime ?? '',
    endTime: item?.endTime ?? '',
    location: item?.location ?? ''
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleChange = (field) => (e) => setFields(prev => ({ ...prev, [field]: e.target.value }));

  // Runs a save or delete, keeping the form open with the message on failure
  const run = async (action, savedDay) => {
    setError('');
    setIsSaving(true);
    try {
      await action();
      onSaved(savedDay);
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = { ...fields, activity: fields.activity.trim(), location: fields.location.trim() };

    const validationError = validateScheduleItem(cleaned, event);
    if (validationError) {
      setError(validationError);
      return;
    }

    run(
      () => (item ? updateScheduleItem(event._id, item._id, cleaned) : addScheduleItem(event._id, cleaned)),
      cleaned.date
    );
  };

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    run(() => deleteScheduleItem(event._id, item._id), item.date);
  };

  const inputClass = 'field';

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black bg-opacity-40" role="dialog" aria-modal="true" aria-labelledby="schedule-form-title">
      <form onSubmit={handleSubmit} className="bg-surface border-t border-line rounded-t-3xl p-4 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="schedule-form-title" className="text-lg font-semibold">
            {item ? 'Edit schedule item' : 'Add to schedule'}
          </h2>
          <button type="button" onClick={onClose} className="text-faint" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded mb-4">{error}</div>
        )}

        <label htmlFor="item-activity" className="block text-sm font-medium text-fg/80 mb-1">What's happening</label>
        <input id="item-activity" className={`${inputClass} mb-3`} maxLength={80} placeholder="Arctic Monkeys" value={fields.activity} onChange={handleChange('activity')} />

        <label htmlFor="item-day" className="block text-sm font-medium text-fg/80 mb-1">Day</label>
        <select id="item-day" className={`${inputClass} mb-3`} value={fields.date} onChange={handleChange('date')}>
          {days.map(day => <option key={day} value={day}>{formatDay(day)}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label htmlFor="item-start" className="block text-sm font-medium text-fg/80 mb-1">Starts</label>
            <input id="item-start" type="time" className={inputClass} value={fields.startTime} onChange={handleChange('startTime')} />
          </div>
          <div>
            <label htmlFor="item-end" className="block text-sm font-medium text-fg/80 mb-1">Ends (optional)</label>
            <input id="item-end" type="time" className={inputClass} value={fields.endTime} onChange={handleChange('endTime')} />
          </div>
        </div>

        <label htmlFor="item-location" className="block text-sm font-medium text-fg/80 mb-1">Location (optional)</label>
        <input id="item-location" className={`${inputClass} mb-4`} maxLength={80} placeholder="Main Stage" value={fields.location} onChange={handleChange('location')} />

        <Button type="submit" fullWidth size="lg" disabled={isSaving}>
          {isSaving ? 'Saving...' : item ? 'Save changes' : 'Add to schedule'}
        </Button>

        {item && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="w-full mt-2 py-3 text-red-400 font-medium disabled:opacity-50"
          >
            {confirmingDelete ? 'Tap again to delete' : 'Delete from schedule'}
          </button>
        )}
      </form>
    </div>
  );
};

export default Schedule;
