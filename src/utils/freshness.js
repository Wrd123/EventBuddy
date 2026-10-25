// Shared data is read again and again to stay fresh, and a read can come
// back after something newer: your own edit, a delete, logging out, or a
// later read that already landed. Applying it then would quietly undo the
// newer state. One rule covers all of those: every local change is
// recorded with changed(), and a read only counts if nothing changed while
// it was out and no later read has landed first. A read that doesn't count
// is dropped; the next one picks up whatever it had.
//
//   const read = tracker.start();
//   const data = await fetchSomething();
//   if (tracker.accept(read)) setData(data);
export const createFreshness = () => {
  let revision = 0;
  let started = 0;
  let landed = 0;

  return {
    changed: () => {
      revision += 1;
    },
    start: () => ({ revision, seq: ++started }),
    // True (and recorded as the latest) when the read still counts
    accept: (read) => {
      if (read.revision !== revision || read.seq <= landed) return false;
      landed = read.seq;
      return true;
    }
  };
};
