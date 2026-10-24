// Turning events into map pins

// Nearby (Ticketmaster) events -> one pin per venue, soonest event first.
// An arena can have a dozen shows coming up; separate pins would sit exactly
// on top of each other. Events without a position are left out.
// -> [{ id, lat, lng, venue, events }]
export const groupByVenue = (events) => {
  const venues = new Map();
  events
    .filter((e) => e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined)
    .forEach((event) => {
      // ~10 m: the same building, even if the two listings differ slightly
      const id = `venue:${event.lat.toFixed(4)},${event.lng.toFixed(4)}`;
      if (!venues.has(id)) venues.set(id, { id, lat: event.lat, lng: event.lng, venue: event.venue, events: [] });
      venues.get(id).events.push(event);
    });

  const sooner = (a, b) =>
    `${a.startDate} ${a.startTime || '99:99'}`.localeCompare(`${b.startDate} ${b.startTime || '99:99'}`);
  return [...venues.values()].map((v) => ({ ...v, events: [...v.events].sort(sooner) }));
};

// "Hiking Trip", "Hiking Trip and Game Night", "Hiking Trip, Game Night and 2 more"
export const listNames = (names) => {
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
};
