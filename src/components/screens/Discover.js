import React from 'react';
import { Search } from 'lucide-react';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { useAppContext } from '../../context/AppContext';
import { EventArt, SuggestedEventCard } from '../common';
import { recommendedArtists, popularEvents } from '../../data/mockData';
import { formatDateRange } from '../../utils/dates';

// Discovery is still preview data (no event source yet)
const Discover = () => {
  const { suggestedEvents } = useAppContext();

  return (
    <div className="flex flex-col h-full">
      <Header title="Discover" />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <SearchBar />

        <section className="mt-5">
          <h2 className="text-xl font-bold mb-3">Based on your preferences</h2>
          <div className="flex overflow-x-auto no-scrollbar space-x-3 -mx-4 px-4 pb-1">
            {suggestedEvents.map(event => <SuggestedEventCard key={event._id} event={event} />)}
          </div>
        </section>

        <ArtistRecommendations />

        <NearbyEvents />
      </div>

      <Footer />
    </div>
  );
};

const SearchBar = () => (
  <div className="relative mt-1">
    <Search size={18} className="absolute left-3.5 top-3 text-faint" aria-hidden="true" />
    <input
      type="search"
      aria-label="Search events, artists and venues"
      className="field rounded-full pl-10"
      placeholder="Search events, artists, venues..."
    />
  </div>
);

// No artist photos yet: a gradient tile with their initial
const ARTIST_GRADIENTS = [
  'from-fuchsia-500 to-violet-deep',
  'from-sky-500 to-indigo-700',
  'from-amber-400 to-rose-600'
];

const ArtistRecommendations = () => (
  <section className="mt-6">
    <h2 className="text-xl font-bold mb-3">Artists you might like</h2>
    <div className="grid grid-cols-3 gap-3">
      {recommendedArtists.map((artist, i) => (
        <div key={artist._id} className="text-center">
          <div
            className={`w-full aspect-square rounded-2xl mb-2 bg-gradient-to-br ${ARTIST_GRADIENTS[i % ARTIST_GRADIENTS.length]} flex items-center justify-center text-4xl font-extrabold text-white/90`}
            aria-hidden="true"
          >
            {artist.name.replace(/^The /, '').charAt(0)}
          </div>
          <div className="text-sm font-semibold">{artist.name}</div>
        </div>
      ))}
    </div>
  </section>
);

const NearbyEvents = () => (
  <section className="mt-6">
    <h2 className="text-xl font-bold mb-3">Popular near you</h2>
    <div className="space-y-3">
      {popularEvents.map(event => (
        <div key={event._id} className="card p-3 flex items-center">
          <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 mr-3">
            <EventArt type={event.type} seed={event._id} className="w-full h-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{event.name}</div>
            <div className="text-sm text-muted mb-1">
              {formatDateRange(event.startDate, event.endDate)} • {event.location}
            </div>
            <div className="text-xs text-violet-soft">
              {event.interestedFriends} friends interested
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default Discover;
