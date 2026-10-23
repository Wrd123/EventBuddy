import React from 'react';
import { formatDateRange } from '../../utils/dates';

const SuggestedEventCard = ({ event }) => (
  <div className="flex-shrink-0 w-40">
    <img src="https://placehold.co/160x120" alt="Event" className="w-full h-20 object-cover rounded-lg mb-2" />
    <div className="font-medium text-sm">{event.name}</div>
    <div className="text-xs text-gray-500">{formatDateRange(event.startDate, event.endDate)}</div>
  </div>
);

export default SuggestedEventCard;