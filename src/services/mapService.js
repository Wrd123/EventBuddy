// Your events' positions for the Map tab
import { apiRequest } from './api';

// -> [{ _id, name, type, startDate, endDate, location, lat, lng }], where
// lat/lng are null for events without a location the server could find
export const getMapEvents = async () => (await apiRequest('/map/events')).events;
