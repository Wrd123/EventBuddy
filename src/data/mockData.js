// Mock fixtures for features that don't have a backend yet (chat, groups,
// map). Events, users and Discover come from the API.
// Every record uses `_id` to match what the MongoDB API returns.

// Mock chat messages
export const chatMessages = [
  { _id: 'msg1', sender: "Alex", senderInitial: "A", color: "#3b82f6", message: "Has anyone seen the schedule for tomorrow?", time: "2:34 PM", isCurrentUser: false },
  { _id: 'msg2', sender: "Taylor", senderInitial: "T", color: "#10b981", message: "I just added it to the schedule tab!", time: "2:36 PM", isCurrentUser: false },
  { _id: 'msg3', sender: "Me", senderInitial: "Me", color: "#8b5cf6", message: "Thanks! We should all meet at the main stage around 3pm", time: "2:38 PM", isCurrentUser: true },
  { _id: 'msg4', sender: "Jordan", senderInitial: "J", color: "#8b5cf6", message: "I added our group expenses for the Airbnb. Everyone please check the expenses tab!", time: "2:40 PM", isCurrentUser: false },
  { _id: 'msg5', sender: "Alex", senderInitial: "A", color: "#3b82f6", message: "Who's excited for Arctic Monkeys today? 🎸", time: "10:15 AM", isCurrentUser: false, newDay: true },
  { _id: 'msg6', sender: "Me", senderInitial: "Me", color: "#8b5cf6", message: "Can't wait! Where should we meet before?", time: "10:17 AM", isCurrentUser: true }
];

// Groups data
export const groups = [
  {
    _id: 'grp1',
    name: "Festival Squad",
    memberCount: 4,
    eventName: "Summer Music Festival",
    eventId: '000000000000000000000001',
    icon: "Music",
    color: "purple",
    notifications: 3,
    isActive: true
  },
  {
    _id: 'grp2',
    name: "Hiking Crew",
    memberCount: 5,
    eventName: "Smoky Mountains Trip",
    eventId: '000000000000000000000002',
    icon: "Map",
    color: "blue",
    notifications: 0,
    isActive: true
  },
  {
    _id: 'grp3',
    name: "College Friends",
    memberCount: 6,
    eventName: "No active event",
    icon: "Users",
    color: "green",
    notifications: 0,
    isActive: true
  },
  {
    _id: 'grp4',
    name: "Coachella 2024",
    memberCount: 4,
    eventName: "Completed",
    icon: "Music",
    color: "gray",
    notifications: 0,
    isActive: false
  },
  {
    _id: 'grp5',
    name: "Ski Trip 2024",
    memberCount: 6,
    eventName: "Completed",
    icon: "Map",
    color: "gray",
    notifications: 0,
    isActive: false
  }
];

// Mock nearby friends for map
export const nearbyFriends = [
  { _id: "user1", name: "Alex", initial: "A", color: "#3b82f6", minutes: 3, status: "online" },
  { _id: "user2", name: "Taylor", initial: "T", color: "#10b981", minutes: 5, status: "online" },
  { _id: "user3", name: "Jordan", initial: "J", color: "#8b5cf6", minutes: 8, status: "online" }
];
