// Mock events data
export const events = [
    {
      id: 1,
      name: "Summer Music Festival",
      date: "Apr 15-18, 2025",
      location: "Indio, CA",
      members: [
        { name: "Alex", color: "#3b82f6" },
        { name: "Taylor", color: "#10b981" },
        { name: "Jordan", color: "#8b5cf6" },
        { name: "Jamie", color: "#f59e0b" }
      ],
      schedule: [
        { time: "2:00 PM - 3:30 PM", activity: "Arctic Monkeys", location: "Main Stage", attending: 4 },
        { time: "4:00 PM - 5:00 PM", activity: "Tame Impala", location: "Sunset Stage", attending: 2 },
        { time: "5:30 PM - 6:30 PM", activity: "Billie Eilish", location: "Main Stage", attending: 1 },
        { time: "7:00 PM - 8:30 PM", activity: "The Strokes", location: "Desert Stage", attending: 0 }
      ]
    },
    {
      id: 2,
      name: "Hiking Trip",
      date: "May 10-12, 2025",
      location: "Smoky Mountains",
      members: [
        { name: "Alex", color: "#3b82f6" },
        { name: "Jordan", color: "#8b5cf6" },
        { name: "Casey", color: "#ec4899" }
      ],
      schedule: []
    }
  ];
  
  // Suggested events data
  export const suggestedEvents = [
    { id: 3, name: "Coachella 2025", date: "Apr 10-19, 2025" },
    { id: 4, name: "Lollapalooza", date: "Jul 30-Aug 2, 2025" },
    { id: 5, name: "Bonnaroo", date: "Jun 12-15, 2025" }
  ];
  
  // Mock chat messages
  export const chatMessages = [
    { id: 1, sender: "Alex", senderInitial: "A", color: "#3b82f6", message: "Has anyone seen the schedule for tomorrow?", time: "2:34 PM", isCurrentUser: false },
    { id: 2, sender: "Taylor", senderInitial: "T", color: "#10b981", message: "I just added it to the schedule tab!", time: "2:36 PM", isCurrentUser: false },
    { id: 3, sender: "Me", senderInitial: "Me", color: "#8b5cf6", message: "Thanks! We should all meet at the main stage around 3pm", time: "2:38 PM", isCurrentUser: true },
    { id: 4, sender: "Jordan", senderInitial: "J", color: "#8b5cf6", message: "I added our group expenses for the Airbnb. Everyone please check the expenses tab!", time: "2:40 PM", isCurrentUser: false },
    { id: 5, sender: "Alex", senderInitial: "A", color: "#3b82f6", message: "Who's excited for Arctic Monkeys today? 🎸", time: "10:15 AM", isCurrentUser: false, newDay: true },
    { id: 6, sender: "Me", senderInitial: "Me", color: "#8b5cf6", message: "Can't wait! Where should we meet before?", time: "10:17 AM", isCurrentUser: true }
  ];
  
  // Mock expenses
  export const expenses = [
    {
      id: 1,
      title: "Accommodation",
      addedBy: "Alex",
      amount: 320.00,
      date: "Apr 15, 2025",
      splitType: "equally",
      amountPerPerson: 80.00,
      status: "settled"
    },
    {
      id: 2,
      title: "Transportation",
      addedBy: "Taylor",
      amount: 120.00,
      date: "Apr 16, 2025",
      splitType: "equally",
      amountPerPerson: 30.00,
      status: "pending",
      pendingCount: 2
    },
    {
      id: 3,
      title: "Food & Drinks",
      addedBy: "You",
      amount: 120.00,
      date: "Apr 17, 2025",
      splitType: "equally",
      amountPerPerson: 30.00,
      status: "pending",
      pendingCount: 1
    }
  ];
  
  // Groups data
  export const groups = [
    {
      id: 1,
      name: "Festival Squad",
      memberCount: 4,
      eventName: "Summer Music Festival",
      icon: "Music",
      color: "purple",
      notifications: 3,
      isActive: true
    },
    {
      id: 2,
      name: "Hiking Crew",
      memberCount: 5,
      eventName: "Smoky Mountains Trip",
      icon: "Map",
      color: "blue",
      notifications: 0,
      isActive: true
    },
    {
      id: 3,
      name: "College Friends",
      memberCount: 6,
      eventName: "No active event",
      icon: "Users",
      color: "green",
      notifications: 0,
      isActive: true
    },
    {
      id: 4,
      name: "Coachella 2024",
      memberCount: 4,
      eventName: "Completed",
      icon: "Music",
      color: "gray",
      notifications: 0,
      isActive: false
    },
    {
      id: 5,
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
    { name: "Alex", initial: "A", color: "#3b82f6", minutes: 3, status: "online" },
    { name: "Taylor", initial: "T", color: "#10b981", minutes: 5, status: "online" },
    { name: "Jordan", initial: "J", color: "#8b5cf6", minutes: 8, status: "online" }
  ];
  
  // Popular nearby events
  export const popularEvents = [
    {
      id: 6,
      name: "Summer Music Festival",
      date: "May 15-17, 2025",
      location: "Nashville, TN",
      interestedFriends: 5
    },
    {
      id: 7,
      name: "Food & Wine Festival",
      date: "Jun 5-7, 2025",
      location: "Memphis, TN",
      interestedFriends: 3
    },
    {
      id: 8,
      name: "Outdoor Adventure Weekend",
      date: "Jul 12-14, 2025",
      location: "Smoky Mountains",
      interestedFriends: 2
    }
  ];
  
  // Artist recommendations
  export const recommendedArtists = [
    { id: 1, name: "Arctic Monkeys" },
    { id: 2, name: "The Strokes" },
    { id: 3, name: "Tame Impala" }
  ];