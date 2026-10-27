# Phase 4 plan: real time

Worked out on 27 Oct 2026 and not started yet. The user agreed the direction and chose the scripted demo friends (4d). Check the code before following a detail here, since things may have moved.

## Why

EventBuddy stays fresh by polling, all through `usePolling` (`src/hooks/usePolling.js`), and `utils/freshness.js` stops a late read from undoing newer state. Current intervals:

| What | Interval | Where it's set |
|---|---|---|
| Chat | 4 s | `useChat` |
| Live map | 10 s | `useLive` |
| An event | 15 s | `useEvent`, `EventDetails`, `Expenses` |
| Chats list | 15 s | `useChats` |
| Events list | 30 s | `AppContext` |

Phase 4 adds three things: real-time updates over WebSockets, an activity feed ("Taylor set the meetup point"), and who's in the app now.

The handoff's conditions still apply: polling stays as the fallback, and sockets get their own security pass. That means authorizing on connect and on every subscription, and dropping a socket when its user is removed or their session version changes.

## The core idea: the socket pokes, REST still reads

The socket never carries app data. When something changes, the server sends `{ type: 'changed', topic, what }` to subscribers, and the client runs the read it already has straight away.

Why:
- All of today's race handling stays exactly as it is: freshness, pending chat messages, the optimistic Going and payments.
- An authorization slip on the socket could leak at most "something changed", never content.
- Without a socket (offline, a proxy that blocks it, an old app build), polling works as it does today.
- While the socket is connected, polling slows to a 60 s safety net.

**Topics:**
- `event:<id>`, with `what` set to `chat`, `live` or `event`.
- `user:<id>`, meaning your events list changed: you joined, were removed, or an event was deleted.

## 4a: the socket server and pokes

**Server:**
- **Dependency:** `ws` in `server/package.json`. It's small, standard and free.
- **`server/src/realtime/hub.js`** (new):
  - Attaches to the HTTP server at path `/api/socket`. `index.js` passes it the server from `listen()`.
  - Keeps an in-memory map of users → sockets → subscribed events.
  - Render runs one instance, so there's no Redis. Say in a comment and the README that a second instance would need pub/sub.
- **Security:**
  - **Origin:** check it on upgrade against `config.clientOrigin`. The iOS app's origin is `capacitor://localhost`. Check that it's in the deployed `CLIENT_ORIGIN`; `scripts/native-env.js` explains it.
  - **Auth:**
    - The first message must be `{type:'auth', token}` within 5 s, or the socket closes with 4401.
    - The token never goes in the URL, so it can't end up in logs.
    - Factor the verify-and-load-user logic out of `requireAuth` into `authenticate(token)` in `server/src/middleware/auth.js`, and use it in both places. It must keep the `sessionVersion` check and the demo-world rebuild.
  - **Subscribe:** `{type:'subscribe', eventId}` is checked with `findVisibleEvent` (`server/src/eventAccess.js`); otherwise reply `{type:'denied', eventId}`. Re-check whenever membership changes.
  - **Drops:**
    - Removing a member or deleting an event unsubscribes the affected sockets and pokes `user:<id>`.
    - Logout and password change (`routes/auth.js`, where `sessionVersion` is bumped) close all of that user's sockets with 4401.
  - **Limits:**
    - 1 KB messages (`maxPayload`)
    - 5 sockets per user
    - 20 subscriptions per socket
    - a 30 s ping/pong that drops dead peers
    - unknown message types ignored
- **Pokes from routes:** a `notify(topic, what)` helper, called after a write succeeds:

  | Route | Writes | Poke |
  |---|---|---|
  | `messages.js` | post | `chat` |
  | `live.js` | share, position, meetup | `live` |
  | `schedule.js` | all | `event` |
  | `expenses.js` | all, inside `ledgerChange` | `event` |
  | `events.js` | patch | `event` |
  | `events.js` | members, delete | `event`, plus the affected `user:` topics |
  | `invites.js` | join | `event`, plus the affected `user:` topics |

**App:**
- **`src/services/realtime.js`** (new): one socket per login.
  - It connects while the app is visible and logged in, and closes when hidden or on logout.
  - It reconnects with backoff and re-subscribes on reconnect.
  - It's keyed to `session.current` (`src/context/AppContext.js`), so an old login's socket can never act for the new one.
- **Socket URL:** derived from `API_URL` in `src/services/api.js`, as `wss://…/api/socket`.
  - When the API is the relative `/api` (development), use the page's own host through a new `src/setupProxy.js` with `ws: true`.
  - CRA's own hot-reload socket lives at `/ws`, so don't use that path.
  - Check that `setupProxy.js` and the `proxy` field in `package.json` work together. If they don't, move the HTTP proxy into `setupProxy.js` too.
- **`usePolling(fn, ms, topic)`:** gains an optional topic.
  - A poke runs `fn` at once, coalesced.
  - While connected, the interval becomes `max(ms, 60 s)`.
  - The callers gain their topic, a one-argument change at each: `useChat`, `useLive`, `useEvent`, `EventDetails`, `Expenses`, `useChats` and `AppContext`.
- **`src/testUtils/fakeApi.js`:** add a fake socket with `poke()` and `presence()`.

**Content Security Policy:**
- Add `wss://*.onrender.com` to `connect-src` in `render.yaml`.
- Update `scripts/serve-build.test.js`, and `forLocal` in `scripts/serve-build.js` (which needs `ws://localhost:<api>`).
- The deploy needs a **Blueprint sync** on Render, not just a redeploy.

## 4b: who's here now

- **Connected means here.** The socket closes when the app is hidden, so connected means visible.
- **The hub sends** `{type:'presence', eventId, userIds}` to an event's subscribers:
  - when a member connects or leaves,
  - and on subscribe.

  Only that event's members get it.
- **UI:**
  - a small `go` dot on member avatars in EventDetails,
  - a "Here now: Alex, Taylor" line under the chat header,
  - the same dot on the friend panel on the map.

  Use the theme tokens only.

## 4c: the activity feed

**Server:**
- **`server/src/models/Activity.js`:** `{ event, actor, kind, data, createdAt }`, indexed by `{ event, _id }`, with a 30-day TTL.
- **Kinds:**
  - `joined`, `left`
  - `schedule_added`, `expense_added`, `payment_marked`
  - `meetup_set`, `sharing_started`
  - `event_updated`
- **`data`** holds only what the sentence needs: an item title, an amount in cents, a name.
- **`record(event, user, kind, data)`** is called beside `notify` in the same routes, with a poke whose `what` is `event`.
- **`GET /api/events/:id/activity?before=<id>`:** members only (`findVisibleEvent`), 20 per page, paged by id like chat.

**App:**
- **`src/utils/activity.js`:** turns a kind into a sentence, with money through `utils/money.js`. It gets a unit test.
- **A "Recent activity" section on EventDetails** shows the newest 5. "See all" opens the shared `Sheet` with paging.
  - It's rendered as text only.
  - Names are user input, so add a test with markup in a name, like `MapCanvas.tooltip.test.js`.

**Seed:** give the demo data (`server/src/seed/demoData.js`) a short, believable history.

## 4d: scripted demo friends (the user's choice)

A reviewer alone in a private demo world would otherwise see nothing real-time happen.

**`server/src/realtime/demoFriends.js`:**
- **When it runs:** only when `config.demoMode`, only for a private demo world (`user.demoWorld`), and only while its owner is connected.
- **What happens:** every 20–40 s, jittered, a friend does one plausible thing through the same model code and `notify`/`record`:
  - replies in the live event's chat from a small canned list,
  - nudges their live position by a few metres,
  - marks Going on a plan,
  - now and then adds something to the activity feed.
- **Presence:** the friends show as here now while the owner is connected.
- **Limits:**
  - at most a fixed number of actions per world per session,
  - timers paused when the owner disconnects,
  - timers cleared on disconnect and when the world is pruned.
- **Never for real accounts.** A test guards that.

## Build order

Build 4a, 4b, 4c and 4d each on its own branch, in that order. Each part:
- has its tests, with both suites and the script tests green,
- passes `CI=true npm run build`,
- gets the `reviewer` subagent on its diff before it's committed,
- for UI work, gets screenshots shown to the user before committing.

Each part is shippable alone, because polling still covers everything. Commit messages are one sentence on what the user gets.

**Editing `server/` restarts the user's :4000 API** and wipes its demo world. The user has said that's fine, but say when it happens.

## Main files

**Server:**
- New: `realtime/hub.js`, `realtime/demoFriends.js`, `models/Activity.js`.
- Changed:
  - `index.js`, `middleware/auth.js`
  - routes `messages`, `live`, `schedule`, `expenses`, `events`, `invites` and `auth`
  - `seed/demoData.js`

**App:**
- New: `services/realtime.js`, `utils/activity.js`, `setupProxy.js`.
- Changed:
  - `hooks/usePolling.js` and its callers
  - `context/AppContext.js`
  - `screens/EventDetails.js`, `screens/GroupChat.js`, the map's friend panel
  - `testUtils/fakeApi.js`

**Config and docs:**
- `render.yaml` (CSP), `scripts/serve-build.*`
- `README.md`: the design decision "pokes, not payloads", and the single-instance limit
- `docs/SECURITY_REVIEW.md`: a WebSocket section
- `docs/HANDOFF.md`

## Verification

**Server tests:** `node --test`, with a real `ws` client against `app.listen(0)`.
- **Connecting:**
  - No auth closes the socket.
  - A bad token closes it, and so does an ended session (an old `sv`).
  - A disallowed `Origin` is refused.
  - A sixth socket for one user is refused.
  - An oversize message closes the socket.
- **Who gets what:**
  - Subscribing to someone else's event is denied.
  - A poke reaches members and not outsiders.
  - Removing a member stops their pokes.
  - Logging out closes that user's sockets.
  - Presence goes only to members.
- **Activity:** it's recorded, and only members can read it.
- **Demo friends:** they act only in demo worlds and stop when the owner disconnects.

**App tests:**
- A poke runs the read at once.
- The interval slows while connected and returns when the socket drops.
- The socket closes on logout and when switching accounts.
- The here-now dots show.
- Activity sentences render, with markup in a name shown as text.

**In the browser:**
- **Two accounts:** use two isolated real accounts in one event, on a production build under the real CSP. Use `scripts/serve-build.js` against an isolated test API, never the user's :4000 (see Traps in the handoff).
  - A message sent in one shows in the other within a second.
  - The here-now dot comes and goes with the tab.
- **A demo world:** friends reply and move on their own.
- **Stop the test API:** the app keeps working by polling, and reconnects when the API is back.

**After deploy:** the user checks the live site's socket connects under the CSP. That's one look at the console.
