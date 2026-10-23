// Member avatar colors. The organizer is always purple; everyone else gets a
// color derived from their user id, so a person looks the same in every event.
const ORGANIZER_COLOR = '#7c3aed';
const MEMBER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];

const colorForUser = (userId) => {
  const id = userId.toString();
  // ObjectIds end in a counter, so their last characters vary the most
  const hash = parseInt(id.slice(-6), 16) || 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
};

module.exports = { ORGANIZER_COLOR, MEMBER_COLORS, colorForUser };
