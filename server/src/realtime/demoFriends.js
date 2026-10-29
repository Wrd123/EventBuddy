// Scripted friends for a private demo world. A reviewer who taps "Try the
// demo" is alone in their world, so nothing real-time would ever happen in
// front of them. When John first opens the picnic, a short fixed story plays
// there instead: Alex, Taylor and Jordan chat, move on the map, add a cost
// and mark Going, while he watches. The app labels all of it as simulated.
//
// The friends are API clients, not a second way of writing to the database.
// Each beat is a few ordinary authenticated requests to this server's own
// routes, made over loopback with the friend's login token. So a friend can
// do only what a member can, every check runs exactly as for a person
// (access, validation, the ledger lock, activity lines, pokes), and nothing
// in the routes is duplicated here. A friend's token also can't rebuild a
// pruned world: rebuildDemoWorld (middleware/auth.js) only rebuilds for the
// world's own John.
//
// What is guaranteed:
// - One chain per world. A session is a single awaited loop (wait, claim a
//   beat, run its requests in order), so nothing runs concurrently and the
//   story's order comes from the loop, not from the counter.
// - Once a session is stopped, no new request starts. A request the server
//   has already received may still finish.
// - Each beat is attempted at most once, and progress survives a later
//   visit, because a beat is claimed on John's account (demoScriptStep)
//   before it runs. A beat that fails part way is not retried, which is
//   fine for a disposable demo: the beats after it stay true on their own.
// - Within a beat, a request runs only if the one before it worked, so
//   nobody announces something that didn't happen.
//
// It runs only for the world's own John, only in demo mode, and only when he
// opens that world's picnic. Once the story is told, the friends stay here
// with nothing more to do, checking now and then that the world is still
// the one they told it in. It stops when he is really gone (see the hub's
// 'left'), leaves the picnic, or the world is pruned.
const User = require('../models/User');
const Event = require('../models/Event');
const config = require('../config');
const { signToken } = require('../middleware/auth');
const { idInWorld, demoWorldUserId } = require('../seed/demoData');
const realtime = require('./hub');

// The wait before the n-th beat of a session is leadMs[n] if there is one
// (so even a returning visitor sees something within seconds), else a random
// time between minMs and maxMs. Tests shorten all of it.
// toldCheckMs is how often a session whose story is told checks that its
// world is still the one it told it in.
const timing = { leadMs: [5000, 10000, 15000], minMs: 20000, maxMs: 40000, requestMs: 5000, toldCheckMs: 60000 };

const FRIENDS = ['Alex', 'Taylor', 'Jordan'];

// Where things happen, near the picnic's seeded meetup point (the dock).
// Jordan's seeded pin is a stale 33.7832, -84.3768.
const DOCK = { lat: 33.7857, lng: -84.3741 };
const JORDAN_ON_HIS_WAY = { lat: 33.7836, lng: -84.3762 };
const ALEX_NUDGED = { lat: 33.7861, lng: -84.3735 };

// The story as data. A beat is a list of requests, each { as, method, path,
// body } where path and body may be functions of { picnic, ids, beat, n }
// (the fresh picnic, user ids by name, this beat's index, this request's
// index in the beat). A path of null means there is nothing to do, which
// counts as a failed request.
const chat = (as, text) => ({
  as,
  method: 'POST',
  path: 'messages',
  // The same id on a repeat saves one message (see idempotency.js)
  body: ({ beat, n }) => ({ text, clientId: `demo-${beat}-${n}` })
});

const move = (as, position) => ({
  as,
  method: 'PUT',
  path: 'live/position',
  body: typeof position === 'function' ? position : () => ({ ...position, accuracy: 15 })
});

// The meetup point if one is set and still current, else the dock
const targetOf = (picnic) =>
  picnic.meetup?.expiresAt > new Date() ? { lat: picnic.meetup.lat, lng: picnic.meetup.lng } : DOCK;

const halfway = (from, to) => ({ lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 });

// Shares split equally among the picnic's current members, with leftover
// cents going to the first listed: the same rule as the app
const equalShares = (picnic, amountCents) => {
  const base = Math.floor(amountCents / picnic.members.length);
  const extra = amountCents % picnic.members.length;
  return picnic.members.map((m, i) => ({ user: m.user.toString(), amountCents: base + (i < extra ? 1 : 0) }));
};

const sunsetWalk = ({ picnic }) => picnic.schedule.find((item) => item.activity === 'Sunset walk');

const SCRIPT = [
  // 1. Jordan's phone had died; his pin was last seen a while ago
  [
    chat('Jordan', 'Sorry, my phone died! Back now and on my way 🏃'),
    // His seeded share is still active, so this only resumes his position
    // updates. Sharing isn't started again, and no "started sharing" line.
    move('Jordan', JORDAN_ON_HIS_WAY)
  ],
  // 2. Alex adds a cost, and only says so if it was saved
  [
    {
      as: 'Alex',
      method: 'POST',
      path: 'expenses',
      body: ({ picnic, ids, beat, n }) => ({
        description: 'Ice cream',
        amountCents: 1800,
        date: picnic.startDate,
        paidBy: ids.Alex.toString(),
        splitType: 'equal',
        shares: equalShares(picnic, 1800),
        clientId: `demo-${beat}-${n}`
      })
    },
    chat('Alex', "Ice cream's on me, it's in expenses 🍦")
  ],
  // 3. Taylor is at the dock; Alex drifts toward the meetup point
  [
    chat('Taylor', "I'm at the dock with the blanket, come find us 🧺"),
    move('Alex', ALEX_NUDGED)
  ],
  // 4. Jordan gets closer
  [move('Jordan', ({ picnic }) => ({ ...halfway(JORDAN_ON_HIS_WAY, targetOf(picnic)), accuracy: 15 }))],
  // 5. Jordan joins the sunset walk (marking Going leaves no activity line)
  [{ as: 'Jordan', method: 'PUT', path: (ctx) => sunsetWalk(ctx) && `schedule/${sunsetWalk(ctx)._id}/going` }],
  // 6. Taylor plans a photo for today
  [
    {
      as: 'Taylor',
      method: 'POST',
      path: 'schedule',
      body: ({ picnic }) => ({
        date: picnic.startDate,
        startTime: '17:30',
        endTime: '18:00',
        activity: 'Group photo',
        location: 'By the lake'
      })
    }
  ],
  // 7. Jordan arrives
  [
    move('Jordan', ({ picnic }) => ({ ...targetOf(picnic), accuracy: 10 })),
    chat('Jordan', 'Found you all! 👋')
  ]
];

// ownerId (John's id as a string) -> session
const sessions = new Map();

const log = (message, err) => {
  if (!config.isTest) console.error(message, err?.message ?? '');
};

const stop = (session) => {
  if (session.stopped) return;
  session.stopped = true;
  clearTimeout(session.timer);
  // Wakes a wait that is still pending, so the loop exits at once
  session.wake?.();
  session.controller.abort();
  realtime.endSimulatedPresence(session.here, session.picnicId);
  // A late old loop must never remove a replacement
  if (sessions.get(session.ownerId) === session) sessions.delete(session.ownerId);
};

// Resolves after ms, or as soon as the session stops or is woken
const pause = (session, ms) => new Promise((resolve) => {
  clearTimeout(session.timer);
  session.wake = resolve;
  session.timer = setTimeout(resolve, ms);
  session.timer.unref();
});

const waitBefore = (n) => {
  const lead = timing.leadMs[n];
  return lead !== undefined ? lead : timing.minMs + Math.random() * (timing.maxMs - timing.minMs);
};

// One request as a friend. true only if the server accepted it; errors
// (stopped, timed out, network, refused) are failures, never thrown.
const send = async (session, step, context) => {
  const base = realtime.localUrl();
  const path = typeof step.path === 'function' ? step.path(context) : step.path;
  if (!base || !path) return false;
  const body = typeof step.body === 'function' ? step.body(context) : step.body;
  try {
    const res = await fetch(`${base}/api/events/${session.picnicId}/${path}`, {
      method: step.method,
      headers: { Authorization: `Bearer ${session.tokens[step.as]}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([session.controller.signal, AbortSignal.timeout(timing.requestMs)])
    });
    if (!res.ok) log(`Demo friend ${step.as} was refused (${res.status}):`);
    // Read to the end so the connection is freed
    await res.text().catch(() => {});
    return res.ok;
  } catch (err) {
    log(`Demo friend ${step.as}'s request failed:`, err);
    return false;
  }
};

// A beat stops at its first failed request
const playBeat = async (session, beat, picnic, ids) => {
  for (let n = 0; n < SCRIPT[beat].length; n += 1) {
    if (session.stopped) return;
    const ok = await send(session, SCRIPT[beat][n], { picnic, ids, beat, n });
    if (!ok) return;
  }
};

const run = async (session) => {
  const { tag, ownerId, picnicId } = session;
  const owner = demoWorldUserId(tag);
  const ids = Object.fromEntries(FRIENDS.map((name) => [name, idInWorld(tag, `user:${name}`)]));

  const friends = await User.find({ _id: { $in: FRIENDS.map((name) => ids[name]) } });
  if (session.stopped || friends.length !== FRIENDS.length) return;
  FRIENDS.forEach((name) => {
    session.tokens[name] = signToken(friends.find((f) => f._id.equals(ids[name])));
  });

  const first = await Event.findById(picnicId).lean();
  if (session.stopped || !first) return;
  // Only friends the picnic lists are "here"
  session.here = FRIENDS.filter((name) => first.members.some((m) => m.user.equals(ids[name]))).map((name) => ids[name].toString());
  realtime.simulatePresence(session.here, picnicId);

  for (let n = 0; !session.stopped; n += 1) {
    await pause(session, waitBefore(n));
    if (session.stopped) return;

    const picnic = await Event.findById(picnicId).lean();
    if (session.stopped) return;
    // John may have settled up and left, or the picnic been deleted
    if (!picnic || !picnic.members.some((m) => m.user.equals(owner))) return;

    // Claimed before it runs: attempted at most once, and a later visit
    // carries on from here. No owner means the world was pruned.
    const before = await User.findOneAndUpdate(
      { _id: owner, demoWorld: tag, demoScriptStep: { $not: { $gte: SCRIPT.length } } },
      { $inc: { demoScriptStep: 1 } },
      { returnDocument: 'before' }
    );
    if (session.stopped) {
      // Stopped while claiming: hand the beat back, so the next visit plays
      // it rather than skipping, say, the ice cream. Only if nobody has
      // claimed since: a session that replaced this one may already have,
      // and undoing its claim would play a beat twice. Then this beat is
      // skipped, which "at most once" allows.
      if (before) {
        const claimed = (before.demoScriptStep || 0) + 1;
        await User.updateOne({ _id: owner, demoScriptStep: claimed }, { $inc: { demoScriptStep: -1 } });
      }
      return;
    }
    if (!before) {
      if (!(await User.exists({ _id: owner }))) return;
      // The story is told. The friends stay here as long as John does,
      // rather than all vanishing together while he watches. Every so
      // often, and whenever he opens the picnic again, the checks above run
      // again: they end the session if the picnic went or he left it, and
      // a world that was pruned and rebuilt (same ids, its story not yet
      // told) gets its story from the start.
      session.told = true;
      const idle = pause(session, timing.toldCheckMs);
      // Only this wait can be cut short by John opening the picnic, never
      // the lead before a beat that follows it
      session.recheck = session.wake;
      await idle;
      session.recheck = null;
      n = -1;
      continue;
    }

    session.told = false;

    await playBeat(session, before.demoScriptStep || 0, picnic, ids);
  }
};

const start = (user, eventId) => {
  const tag = user.demoWorld;
  if (!config.demoMode || !tag || !demoWorldUserId(tag).equals(user._id)) return;
  if (eventId !== idInWorld(tag, 'event:picnic').toString()) return;
  const ownerId = user._id.toString();
  const existing = sessions.get(ownerId);
  if (existing) {
    // A told story checks its world again now: it may have been rebuilt
    existing.recheck?.();
    return;
  }

  const session = {
    ownerId, tag, picnicId: eventId, stopped: false, told: false, timer: null, wake: null, recheck: null,
    controller: new AbortController(), here: [], tokens: {}
  };
  sessions.set(ownerId, session);
  // stop runs inside the chain, so even an error from it is caught: this
  // runs outside Express, where an unhandled one would end the process
  run(session)
    .finally(() => stop(session))
    .catch((err) => log('Demo friends stopped:', err));
};

// Starts listening to the hub. Returns the function that undoes it and
// stops every session.
const install = () => {
  const onSubscribed = (user, eventId) => start(user, eventId);
  const onLeft = (userId) => {
    const session = sessions.get(String(userId));
    if (session) stop(session);
  };
  realtime.hubEvents.on('subscribed', onSubscribed);
  realtime.hubEvents.on('left', onLeft);
  return () => {
    realtime.hubEvents.off('subscribed', onSubscribed);
    realtime.hubEvents.off('left', onLeft);
    [...sessions.values()].forEach(stop);
  };
};

// For tests: a session exists (the friends are here), and its story still
// has beats to play
const running = (ownerId) => sessions.has(String(ownerId));
const telling = (ownerId) => running(ownerId) && !sessions.get(String(ownerId)).told;

module.exports = { install, timing, sessions, running, telling };
