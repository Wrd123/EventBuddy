// Mock fixtures for features that don't have a backend yet (the map).
// Everything else comes from the API.
// Every record uses `_id` to match what the MongoDB API returns.

// Mock nearby friends for map
export const nearbyFriends = [
  { _id: "user1", name: "Alex", initial: "A", color: "#3b82f6", minutes: 3, status: "online" },
  { _id: "user2", name: "Taylor", initial: "T", color: "#10b981", minutes: 5, status: "online" },
  { _id: "user3", name: "Jordan", initial: "J", color: "#8b5cf6", minutes: 8, status: "online" }
];
