// Cover photos for events, from Unsplash (free to use under the Unsplash
// License, no attribution required). They load from Unsplash's image CDN,
// which crops and resizes on the fly, so the app ships no photo files.
//
// Each type has 10 photos, in the order they're handed out: an organizer's
// first concert gets concert photo 1, their second photo 2, and so on (the
// server picks the number, event.coverIndex). Reordering this list changes
// existing events' photos, so swap a photo out in place instead.
export const COVER_PHOTOS = {
  'music-festival': [
    '1520095972714-909e91b038e5', // Arms up by the festival tents
    '1533174072545-7a4b6ad7a6c3', // Confetti over a night crowd
    '1472653816316-3ad6f10a6592', // Sunny festival field
    '1603910234616-3b5f4a6be2b4', // Purple stage lights and confetti
    '1788149903141-d53b08f6f38a', // Crowd under bunting at sunset
    '1506157786151-b8491531f063', // Hands up at a purple-lit stage
    '1565035010268-a3816f98589a', // Guitarist in the stage glow
    '1501386761578-eac5c94b800a', // Cheering front row
    '1470229722913-7c0e2dbbafd3', // Stage light over the crowd
    '1459749411175-04bf5292ceea' // Big stage at night
  ],
  concert: [
    '1602369944529-c237ca143d09', // Crowd facing a lit stage
    '1657208431551-cbf415b8ef26', // Teal and purple spotlights
    '1577042816206-2e85c23f2392', // Band playing under white lights
    '1558342706-2140d4e3c357', // Hands up in silhouette
    '1610901056511-31de499995f0', // Blue stage lights over the crowd
    '1723743807556-30d654464fc9', // Outdoor stage at dusk
    '1574155088851-0c770818ba40', // Light beams over a dark crowd
    '1729553199933-c897fea4f41f', // Crowd in a blue-lit hall
    '1619973226698-b77a5b5dd14b', // Golden stage lights
    '1577648884063-1d3d1477b8a7' // Stage lights at full blast
  ],
  outdoor: [
    '1629185752152-fe65698ddee4', // Hikers heading for the peaks
    '1519338381761-c7523edc1f46', // Running into the waves
    '1504280390367-361c6d9f38f4', // View from inside a tent
    '1668117778398-3ad69811d65d', // Friends on a park lawn
    '1550486686-a496af34a2d5', // Hikers above a mountain lake
    '1536869338989-e7ffd2297454', // Friends sitting on the beach
    '1444210971048-6130cf0c46cf', // Campfire at dusk
    '1548957175-84f0f9af659e', // Looking out over the mountains
    '1784675582581-ef8d34689f58', // Picnic in a sunny park
    '1725573839625-0a1ddd342964' // Picnic spread on a blanket
  ],
  'group-travel': [
    '1758272134082-f7078f04fdbb', // Rooftop selfie with friends
    '1778411602745-5db9ca798215', // Watching planes at the airport
    '1469854523086-cc02fe5d8800', // Van on a desert road
    '1496588152823-86ff7695e68f', // City skyline and bridge
    '1759054712338-a5bd9a712d4c', // Friends on a cobblestone street
    '1606759163253-094133091882', // Camper van by the water
    '1426086800127-2601510ca027', // Train through the mountains
    '1530065928592-fb0dc85d2f27', // Sitting in the back of the car
    '1547399152-e06396bbe9ca', // Open road through the trees
    '1720275421309-b2ca59396907' // Exploring a city street
  ],
  sports: [
    '1522778119026-d647f0596c20', // Soccer stadium from the stands
    '1767016697775-001518392206', // Packed basketball arena
    '1563299796-b729d0af54a5', // Fans cheering at a ballgame
    '1626003573503-2e088d82c647', // Court under the arena lights
    '1705593973313-75de7bf95b56', // Full stadium at a soccer game
    '1558151748-f2621b5e52f0', // Crowd cheering in the stands
    '1504450758481-7338eba7524a', // Arena lit up for the game
    '1782355341395-78f9a62428ef', // Football stadium from above
    '1762013315117-1c8005ad2b41', // Soccer match at night
    '1556816214-6d16c62fbbf6' // Fans in the stadium at night
  ],
  arts: [
    '1615414047026-802692414b79', // Theater from the seats
    '1503095396549-807759245b35', // Dancers silhouetted on stage
    '1569783721854-33a99b4c0bae', // Visitors in a gallery
    '1514306191717-452ec28c7814', // Red theater curtain
    '1572953109213-3be62398eb95', // Long museum hall of paintings
    '1554907984-15263bfd63bd', // Paintings on a red wall
    '1563000215-e31a8ddcb2d0', // Looking at a painting
    '1518998053901-5348d3961a04', // White gallery walls
    '1762786113000-fa587fd3d69c', // A lone figure on a dim stage
    '1774967550635-182fb37cf31f' // Spotlight through stage smoke
  ]
};

// The photos for a type (festival photos for an unknown one, matching the
// server's default type)
const photosForType = (type) => COVER_PHOTOS[type] || COVER_PHOTOS['music-festival'];

// The photo an event shows. Events from Discover have no coverIndex, so
// they get their type's first photo.
export const coverPhotoFor = ({ type, coverIndex = 0 } = {}) => {
  const photos = photosForType(type);
  return photos[coverIndex % photos.length];
};

// width is in CSS pixels; asking for double keeps it sharp on Retina screens
export const coverPhotoUrl = (photoId, width) =>
  `https://images.unsplash.com/photo-${photoId}?w=${width * 2}&q=70&auto=format&fit=crop`;
