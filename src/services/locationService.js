// Location service for handling geolocation and location-based features
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock location data for different cities
const mockLocationData = {
  "atlanta": {
    city: "Atlanta",
    state: "GA",
    country: "USA",
    coords: { latitude: 33.7490, longitude: -84.3880 },
    events: [
      {
        _id: 'loc_1',
        name: 'Atlanta Jazz Festival',
        date: 'Sep 15-17, 2025',
        location: 'Piedmont Park, Atlanta',
        distance: '2.3 miles',
        interestedFriends: 15,
        type: 'music'
      },
      {
        _id: 'loc_2',
        name: 'Food & Wine Expo',
        date: 'Sep 22, 2025',
        location: 'Georgia World Congress Center',
        distance: '5.1 miles',
        interestedFriends: 8,
        type: 'food'
      }
    ]
  },
  "default": {
    city: "Your Area",
    events: [
      {
        _id: 'loc_default_1',
        name: 'Local Music Night',
        date: 'This Weekend',
        location: 'Downtown',
        distance: '1.2 miles',
        interestedFriends: 5,
        type: 'music'
      }
    ]
  }
};

const LOCATION_KEY = 'eventbuddy_location';

export class LocationService {
  async getCurrentLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: 33.7490, longitude: -84.3880, fallback: true });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          localStorage.setItem(LOCATION_KEY, JSON.stringify(coords));
          resolve(coords);
        },
        () => {
          resolve({ latitude: 33.7490, longitude: -84.3880, fallback: true });
        }
      );
    });
  }

  async getEventsNearLocation() {
    await delay(800);
    return mockLocationData.atlanta.events;
  }

  async getCurrentCity() {
    return "Atlanta, GA";
  }
}

export const locationService = new LocationService();
