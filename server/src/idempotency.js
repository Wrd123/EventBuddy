// Creates that are safe to retry. The app gives each new message or payment
// an id of its own (clientId) and sends the same id again when it retries.
// If the first try was saved but its response got lost (a dropped signal, a
// server waking up), the retry gets that saved record back instead of making
// a second one. Sending the same text twice on purpose still works, because
// each send gets a new id.
const { HttpError } = require('./errors');

const MAX_CLIENT_ID_LENGTH = 64;
const CLIENT_ID = /^[A-Za-z0-9_-]+$/;

// The request's clientId, or undefined when it has none (older app versions
// and scripts). Anything else that isn't a short, plain id is a 400.
const readClientId = (body) => {
  const value = body?.clientId;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > MAX_CLIENT_ID_LENGTH || !CLIENT_ID.test(value)) {
    throw new HttpError(400, 'Something went wrong sending that. Try again.');
  }
  return value;
};

const REUSED = 'That request was already used for something else.';

// The record already saved under this key, or null. A record that doesn't
// match what this request asks for means the id was reused for something
// different, which is a bug on the sender's side, never a retry.
const findExisting = async (Model, key, matches) => {
  const existing = await Model.findOne(key);
  if (existing && !matches(existing)) throw new HttpError(409, REUSED);
  return existing;
};

// Mongo's duplicate-key error for this model's clientId index specifically.
// Any other unique index clashing is a real error and is passed on.
const isClientIdClash = (err) => err?.code === 11000 && Boolean(err.keyPattern?.clientId);

// -> { record, created }. Without a clientId it simply creates. With one, it
// returns the record already saved under that key, or creates it. If two
// tries race, the database's unique index lets only one in, and the other
// gets the winner's record.
const createOnce = async (Model, key, doc, matches) => {
  if (key.clientId === undefined) return { record: await Model.create(doc), created: true };

  const existing = await findExisting(Model, key, matches);
  if (existing) return { record: existing, created: false };
  try {
    return { record: await Model.create({ ...doc, clientId: key.clientId }), created: true };
  } catch (err) {
    if (!isClientIdClash(err)) throw err;
    return { record: await findExisting(Model, key, matches), created: false };
  }
};

// The partial index behind it: unique per key, ignoring records saved
// without a clientId
const clientIdIndex = (schema, fields) =>
  schema.index({ ...fields, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = { readClientId, findExisting, createOnce, clientIdIndex, MAX_CLIENT_ID_LENGTH };
