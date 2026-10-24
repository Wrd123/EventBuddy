// A small in-memory cache with expiry. Entries live for ttlMs; past `max`
// entries the oldest is dropped. Per server process, which is plenty for
// sharing lookups between people in the same area.
const createCache = ({ ttlMs, max = 500 }) => {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expires: Date.now() + ttlMs });
      // Maps keep insertion order, so the first key is the oldest
      if (entries.size > max) entries.delete(entries.keys().next().value);
    },
    clear() {
      entries.clear();
    }
  };
};

module.exports = { createCache };
