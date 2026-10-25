// Runs changes to one event's money, and its membership, one at a time.
// Recording a payment reads the balances, checks the payment against them,
// then saves it; if another payment or an expense edit landed in between,
// two people tapping "Mark paid" at once could both pass the check. The same
// goes for removing someone while an expense with them is being added.
// Queuing every such change for the event behind the one before closes
// that gap.
//
// This works because the API runs as a single process (one instance on
// Render, and demo mode). Running more than one instance would need the
// database to do this instead, with a transaction or a revision number on
// the event's ledger.
const chains = new Map();

const withEventLock = (eventId, fn) => {
  // Ids arrive as typed in the URL, and MongoDB accepts upper- or lowercase
  // hex for the same event; one spelling, one lock
  const key = eventId.toString().toLowerCase();
  const previous = chains.get(key) || Promise.resolve();
  const run = previous.then(fn);
  // The next change waits for this one whether it worked or failed
  const settled = run.then(() => {}, () => {});
  chains.set(key, settled);
  // Nothing queued behind it: forget the event so the map doesn't grow
  settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
};

module.exports = { withEventLock, pendingLocks: () => chains.size };
