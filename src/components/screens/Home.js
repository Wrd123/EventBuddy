import React from 'react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { EventCard, SuggestedEventCard } from '../common';

const Home = () => {
  const { events, suggestedEvents, selectEvent } = useAppContext();
  
  return (
    <div className="flex flex-col h-full">
      <Header title="EventBuddy" />
      
      <div className="flex-1 overflow-y-auto pb-16">
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-2">Upcoming Events</h2>
          <div className="flex flex-col space-y-3">
            {events.map((event) => (
              <EventCard 
                key={event.id} 
                event={event} 
                onSelect={() => selectEvent(event)} 
              />
            ))}
          </div>
        </div>
        
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-2">Suggested For You</h2>
          <div className="flex overflow-x-auto space-x-3 pb-2">
            {suggestedEvents.map((event) => (
              <SuggestedEventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default Home;