# Handoff: where EventBuddy stands (28 Oct 2026)

`CLAUDE.md` has the stack, commands, conventions and the permission boundaries. This note covers what's done, what's next, and the traps.
- **`docs/FINISH_PLAN.md` sets the order of work now.** Items 1 and 2 are done and deployed; **item 3, the compact activity feed (Phase 4c), is next**.
- `docs/PHASE_4_PLAN.md` is the plan for Phase 4. Its 4a and 4b parts are built; where the build departed from it, this note says so.

## State

- **Git:**
  - GitHub's `main` is at `4da7140a` (the demo pass), plus this note's commit once it's pushed.
  - The user pushes with `git push origin <branch>:main`, so **local `main` can lag behind**. Bring it level with `git switch main && git merge --ff-only origin/main` (or the branch), and check `git rev-list --left-right --count origin/main...main` before trusting this.
  - CI wasn't checked for the 28 Oct pushes. Ask the user to look at the Actions tab.
- **Deployed on Render:**
  - **Checked live on 28 Oct 2026:** retry-safe expense creates are on the API. A retry with the same `clientId` answered 200 with the same expense, and only one was stored.
  - **The API didn't have the demo pass yet** when checked after the push on 28 Oct: a new demo world's picnic had 0 schedule items. It needs a redeploy (see Waiting on the user). The web app deploys itself from `main`.
  - **From 27 Oct:** both services run Phase 4, the expiry fixes and every earlier security fix.
  - The socket connects (`101` in the browser), under the Content Security Policy.
  - The API sends `Cache-Control: no-store`. Logout with no login answers 401, a socket opened from another site gets 403, and a 200 kB body gets 413.
  - `/api/debug/request-ip` answers 404, so `SHOW_REQUEST_IP` is off again.
- **Tests:** 373 server tests, 484 app tests and 12 script tests pass, and `CI=true npm run build` is clean.
  - Run the app suite with `--maxWorkers=2`.
  - Run the script tests with `npm run test:scripts`, not `node --test scripts/`.
- **`npm audit --omit=dev`:** the server reports nothing, `ws` included. The app reports only `maplibre-gl` (see D1).
  - `react-scripts` is a dev dependency, so CRA's dev-server advisories only show in the full `npm audit`.
  - None of it ships in the built site.
- **Not checked on a device:**
  - the iOS build, haptics and pull-to-refresh in WKWebView
  - the sheets with a real keyboard, enlarged text or VoiceOver
  - the Profile password form
  - the darkened Liberty map in WKWebView
  - **the socket from the iPhone app:** what Origin its WebView sends. It must be in `CLIENT_ORIGIN`.
- **Branches:**
  - Locally: `main`, plus `expense-retry`, `chat-read` and `demo-polish`. All three are already in GitHub's `main`, so `git branch -d` can tidy them once local `main` has caught up.
  - `origin/phase-3b` still exists on GitHub. Deleting it would be a push, so leave it to the user.
  - `.git/config` has three harmless stale `vscode-merge-base` lines. The sandbox can't edit that file.
- **Local servers:**
  - None of Claude's are running.
  - `.claude/launch.json` (gitignored) has `rt-api-4150`, an isolated demo API, and `rt-web-3999`, the production build served with the real headers against it. Rebuild first with `INLINE_RUNTIME_CHUNK=false REACT_APP_API_URL=http://localhost:4150/api npm run build`.
  - A stray API process may still be running from the 4a session (PID 66908, no port). The user was told `kill 66908` stops it.
  - **To screenshot the waiting screen**, build with `REACT_APP_WAKE_SCREEN=true` as well, and open the page before starting `rt-api-4150`.

## Waiting on the user

- **Redeploy `eventbuddy-api` for `4da7140a`**, if it hasn't been done. Without it, the live picnic has no schedule or costs, and Discover's not-configured message is the old one.
  - Check: a new demo world's "Picnic in the Park" should have 4 schedule items.
- **Turn on Auto-Deploy for `eventbuddy-api`** (Settings → Build & Deploy), so this stops being a manual step.
- **Check CI** for the 28 Oct pushes.

## What was done

**Finish plan, item 1 (28 Oct, deployed):**
- **Retry-safe expense creates** (`742baab7`).
  - `Expense` has a `clientId` with the shared `clientIdIndex`. The POST route checks for a saved retry before validating, so a retry still gets its expense back after the payer left. A reused id with a different expense gets 409.
  - `ExpenseForm` keeps one id per Add sheet. After a lost response it says the save is unconfirmed, and closing the sheet reloads the list. On a 409 after that, it says the first try was saved.
  - `fakeApi` has `expenseOutcomes`.
- **Chat read only up to what you've seen** (`c82c7e5b`).
  - `useChat` no longer marks read on its own; it exposes `markSeen(id)`. `GroupChat`'s `Conversation` calls it only when the newest message is in view: at the bottom, on scrolling down, from the pill, or on returning to the app while at the bottom.
  - A solid "New messages" pill appears when someone else writes while you're scrolled up.
  - Sending takes you to the bottom.
  - The old code also never marked a message that landed as the app went to the background; that's fixed and tested.

**Finish plan, item 2 (28 Oct, pushed; see Waiting on the user):** `4da7140a`
- **Try the demo copy:** made-up friends, a private copy that resets when the free server sleeps, and EventBuddy never moves money.
- **Sign up** warns, on a demo server only, that accounts are temporary. `useDemoAvailable()` is shared by Login and Register.
- **`ServerWake`** shows a sliding bar (`.wake-bar`, still under reduced motion) in place of the fake percentage, and a README link after 90 s.
- **The picnic** has four schedule items and two expenses. `equalShares` is shared in `demoData.js`.
- **Wording:**
  - "A short list of payments" in the README and `ledger.js`. A test pins the greedy method's 4-where-3-would-do case.
  - The README says US dollars only, times local to the event, and money moves in the payment apps.
  - Discover's not-configured message no longer mentions API keys.

**Security review** (Claude and Codex independently, then fixes with tests). `docs/SECURITY_REVIEW.md` is the full record.

| | What changed | Where |
|---|---|---|
| S1 | Map captions are text nodes, so a member's name can't run as code | `components/map/MapCanvas.js`, `MapCanvas.tooltip.test.js` |
| S2 | Logout and password changes bump the user's `sessionVersion`, ending every token they hold | `middleware/auth.js`, `models/User.js`, `routes/auth.js` |
| S3 | 8+ characters, a local common-password list, not the email or username, and a Profile form to change it | `validation.js`, `commonPasswords.js`, `utils/password.js` |
| R1, R2 | Late auth answers from an older login are ignored | `services/api.js`, `context/AppContext.js` |
| R3, H1, C2 | 413 for oversized bodies, `no-store` everywhere, at most 5 demo worlds built at once | `errorHandler.js`, `app.js`, `concurrencyLimit.js` |
| CSP | A strict page policy with nothing inline, now allowing `wss://*.onrender.com` | `render.yaml`, `scripts/serve-build.*` |
| F-1 | Measured on Render: Cloudflare → Render's network → a local proxy, so `TRUST_PROXY=3` is right. A test runs the real login limit behind that chain. | `render.yaml` comment, `server/tests/app.test.js` |

**Phase 4a, pokes** (`server/src/realtime/hub.js`, `src/services/realtime.js`, `src/hooks/usePolling.js`). One WebSocket per login at `/api/socket`, open only while the app is on screen.
- It never carries data: `{type:'changed', eventId, what}` makes the app run the REST read it already polls with.
- How it's secured:
  - The login is the first message (never the URL), checked by the shared `authenticate()`.
  - Subscribing goes through `findVisibleEvent`.
  - Removal, deletion, logout and password changes take access away at once.
- Limits: 1 kB messages, 5 sockets per person, 20 subscriptions and 20 refusals per socket, 500 sockets in all.
- Polling slows to 60 s for a topic once the server confirms its subscription, and returns, with a catch-up read, when the socket drops or comes back.
- Departures from the plan:
  - no `setupProxy.js`, since CRA's `proxy` already forwards WebSockets;
  - pruning a demo world doesn't close sockets;
  - the chats list keeps its own 15 s poll;
  - the events list hears `events` pokes but keeps its 30 s pace;
  - meetup changes poke both `live` and `event`;
  - EventDetails' summary listens to `event` and `chat`.

**Phase 4b, who's here now** (`usePresence(eventId)`). A member is here while they have a logged-in socket.
- The hub sends `{type:'presence', eventId, userIds}` to that event's subscribers only:
  - on subscribe,
  - when someone arrives,
  - and 5 s after their last socket closes. Logging out or a token running out ends it at once.
- Where it shows: a `go` dot on avatars in Who's going, a "Here now: …" line under the chat header, and "Here now •" on the map's friend panel. The user saw screenshots.

**Fixes from Codex's review of `45390d63`:**
- **WS-1:** a socket now closes when its token expires, and nothing is sent to it after that.
- **L-1:** the map hides an expired share on time; `useLive` uses the current clock.

Each was checked against the code first, and each got a test that fails on the old code.

## Still open

- **C2's per-address demo limit** can go ahead now that F-1 confirmed `req.ip` is the visitor's real address.
- **D1:** `maplibre-gl` stays on 5.x, because 6.x can't be bundled by CRA; its advisory isn't reachable here. Upgrade it along with moving off CRA (Vite, in phase 5).
- **Socket hardening backlog** (from Codex): a budget for queued inbound messages per socket, and the iPhone WebView's real Origin (see State).
- **The map's first fit can tuck a friend's pin under the bottom sheet's edge.** It was there before Phase 4, and was found during the 4b screenshots.
- **Known limit:** a logged-out demo token works again if the hosted demo restarts empty and rebuilds that world. Accepted, and documented in `User.js`.

## Decisions already made (don't reopen them)

- cover photos: a fixed rotation, with no picker
- automatic location
- the event map shows only that event
- the meetup flag uses a crosshair and `ResizeObserver`
- leaving or removal needs an even balance ("Settle up first")
- removal sticks until the organizer taps "Let back in"
- the organizer can't leave; they delete the event
- freshness uses polling. Phase 4 adds WebSockets that only *poke* the app to read again, with polling kept as the fallback (see `docs/PHASE_4_PLAN.md`)
- **Phase 4 includes scripted demo friends**, so a reviewer alone in a demo world sees real time happen. The user chose this on 27 Oct 2026.
- **The finish plan (adopted 27 Oct 2026):** finish the core journey before adding to it, in the order in `docs/FINISH_PLAN.md`. 4c comes after the two correctness fixes and the demo pass, in a compact form, and 4d stays.
- no React Query; the small `freshness.js` rule is deliberate
- the map's bottom panel is not a Sheet
- expense and schedule forms close instantly after saving
- **map tiles:** OpenFreeMap's `liberty` style, drawn by MapLibre and turned dark by a CSS filter, with OSM tiles (same filter) as the fallback when there's no WebGL. `fiord` looked darker but dropped buildings and landmarks, and the user missed them. Keyless CARTO tiles show a watermark.
- **The map screen's sheet overlaps the map by 1.5rem.** The map's wrapper is `isolate` so Leaflet's layers can't paint over the sheet, and `.eb-map-under-sheet` lifts Leaflet's bottom controls clear of it.
- **No pull to refresh on Chat, Map, the forms or Profile.**
- **Logging out ends the login on every device.** There's one session version per person, not per device.
- **No rules about digits or symbols in passwords.** Length and the common-password list are the rule.

## The roadmap

The goal: a reviewer opens EventBuddy and sees senior-level work. The user judges the visual work, so show screenshots before moving on. The $0 budget rules out push notifications and TestFlight.

| Phase | What | Status |
|---|---|---|
| 1 | Design directions: Afterglow chosen, with Signal's timeline on Home | Done |
| 2 | The design system, and every screen rebuilt on it | Done |
| 3 | Feel: transitions, draggable sheets, optimistic UI, haptics, with D5, D1 and D4 | Done |
| 3b | Loading skeletons and pull-to-refresh | Done |
| — | Security review and fixes | Done, F-1 included |
| 4 | Real time: pokes, who's here now, an activity feed, scripted demo friends | 4a and 4b done and deployed; 4c (compact) and 4d follow the finish plan's first two items |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility scores, Sentry, a keep-awake ping | Planned |
| 6 | Day-of mode, the signature feature: during an event, one screen with where everyone is, what's next and who owes what. Then a README case study and a demo video | Planned |

## What comes next

Follow `docs/FINISH_PLAN.md`, in order:
1. ~~Correctness~~ (done).
2. ~~The demo and copy pass~~ (done).
3. **4c, compact. Next** (notes below). Plan it in plan mode first.
4. **4d** (notes below).
5. **The abuse backlog:** a per-visitor demo budget and a socket queue budget.
6. **Playwright against a real API, the Simulator pass, and the user's physical-iPhone location check.**
7. **Rehearse and package.**

Notes for the Phase 4 items:

1. **Phase 4c, the activity feed** ("Taylor set the meetup point"). Plan it in plan mode first, per `CLAUDE.md`; `docs/PHASE_4_PLAN.md` § 4c is the starting point. The finish plan changes it:
   - a compact entry on EventDetails (one or two lines plus See all) instead of five rows;
   - no meetup note or coordinates;
   - `record` awaited and never failing the write;
   - the list replaced when a fresh page doesn't overlap.
   - **Server:**
     - `models/Activity.js` (`{ event, actor, kind, data, createdAt }`, indexed by `{ event, _id }`, with a 30-day TTL).
     - A `record(event, user, kind, data)` called beside each poke.
     - `GET /api/events/:id/activity?before=<id>`, members only through `findVisibleEvent`, 20 per page, paged by id like chat.
     - Seed the demo data with a short, believable history that matches what's there now. The picnic now has its schedule (set up by the lake, lunch, frisbee, sunset walk) and two expenses: Taylor's Snacks & drinks and John's Blanket & frisbee.
   - **Where to record:**
     - Most writes under `/api/events/:id/...` already pass through `pokeOnSuccess` in `routes/events.js`, but recording needs the route's own details (an item's title, an amount), so `record` belongs in each route.
     - Joins and removals go through `routes/invites.js` and the members route in `routes/events.js`, beside `addMember` and `dropFromEvent`.
     - After recording, poke `event`, so EventDetails (which listens to `event` and `chat`) reads the feed again.
   - **App:**
     - `utils/activity.js` turns a kind into a sentence, with money through `utils/money.js`, and gets a unit test.
     - A compact "Recent activity" entry on EventDetails (the newest one or two), and "See all" opens the shared `Sheet` with paging.
     - Names are user input, so render text only and test a name with markup in it, like the GroupChat "Here now" test.
   - **Then:** both suites, `CI=true npm run build`, the `reviewer` subagent, screenshots to the user before committing, and a commit on its own branch.
2. **Phase 4d, scripted demo friends** (`server/src/realtime/demoFriends.js`, see the plan). Label them as simulated. The friends can show as here by joining `state.memberships` the way an arriving socket does, and should act through the same routes or models with `notifyEvent`/`record`. Never for real accounts.
3. **iOS check** in the Simulator: sheets, transitions, skeletons, pull-to-refresh, haptics, the Profile password form, the Liberty map, and now the socket and its Origin.
   - `xcodebuild`, `xcrun` and `npx cap` may need to run outside the sandbox.
   - Open the Simulator panel (`attach`) before building.

**Later:**
- The pill and the new sheets need a VoiceOver pass on a device (finish-plan item 6).
- Optimistic creates for expenses and schedule items, once there's a server `clientId` for both (expenses get theirs in finish-plan item 1).
- The sheets need a check with a real phone keyboard, enlarged text and VoiceOver on a device.

## Traps

- **The sandbox.** `.claude/settings.json` turns on Claude Code's Bash sandbox.
  - Writes are limited to the project, `$TMPDIR` and `~/.cache/mongodb-binaries`.
  - **`gh` fails with a TLS error and `git push` can't read credentials.** Give the user the command to run themselves.
  - What else fails inside it: `ps`, `open`, writing to `/tmp`, and most websites. macOS has no `timeout` command either.
  - Never `pkill -f index.js`: it matches the user's :4000 API too, and the classifier blocks it anyway. Stop your own background servers with `TaskStop`.
  - **Bash can't write `.claude/` or `.git/config`.** Edit `.claude/launch.json` with the Edit tool. `git branch -d` still works but warns that it couldn't tidy `.git/config`.
  - npm's cache in `~/.npm` isn't writable. Prefix npm commands with `npm_config_cache=$TMPDIR/npm-cache`. `npm audit` also needs `registry.npmjs.org` allowed for the command.
  - If a command hits the sandbox, tell the user which restriction it hit. Changing the settings is their call.
- **Editing `server/` restarts the user's :4000 API** (`node --watch`, in-memory MongoDB) and erases their local demo world. In this session the user said that's fine because it isn't production. Still say when it happens.
- **The Content Security Policy is strict.** Anything new the web app loads from another host needs adding to the policy in `render.yaml`, or production will block it: fonts, images from a new non-https host, a new API host, WebSockets in phase 4 (`connect-src` needs the `wss://` address). So does any inline `style="…"`, `on…=` or `<script>` in markup. `scripts/serve-build.test.js` catches the inline cases in CI. To check a real build:
  - `INLINE_RUNTIME_CHUNK=false REACT_APP_API_URL=http://localhost:<api>/api npm run build`
  - then `node scripts/serve-build.js --port 3999 --api http://localhost:<api>`
- **Isolated test APIs.** Start one from a folder with no `.env` (the scratchpad from Bash; the project root from `preview_start`, which only takes a `cwd` in the project), so `server/.env` and its Ticketmaster key aren't loaded:
  - `NODE_ENV=production DEMO_MODE=true PORT=41xx JWT_SECRET=<random> CLIENT_ORIGIN=http://localhost:3999 node <repo>/server/src/index.js`
  - Rate limits are on in that mode. A different `X-Forwarded-For` per request gets a fresh bucket while `TRUST_PROXY` trusts it.
- **Live checks:**
  - Use `preview_start` with a `.claude/launch.json` entry (gitignored). The :3000 dev server hangs, so leave it alone. **Try the demo** gives a throwaway world.
  - **Catching a skeleton on screen:** in the page, replace `window.fetch` with one that never resolves `/api/` GETs, then navigate in the app.
  - **Driving a pull:** dispatch `TouchEvent`s with `new Touch(...)` on `.overscroll-y-contain`.
  - **The first screenshot after a tab change can come out blank** while the route transition runs. Take it again.
- **A hidden Browser pane or a background tab pauses `requestAnimationFrame`.** Bring the tab to the front before judging the map or animations.
- **Render deploys:**
  - **The API doesn't deploy itself** (see Waiting on the user). After a push, check the live API itself, not the dashboard:
    - `/api/health` should carry `Cache-Control: no-store`;
    - `POST /api/auth/logout` with no login should answer 401;
    - a WebSocket handshake to `/api/socket` should get `101`, or `403` with a foreign Origin.

    `curl` reaches `eventbuddy-api.onrender.com` when the command allows that domain.
  - **A change to `render.yaml` itself (headers, environment) also needs a Blueprint sync**: Blueprints → Manual Sync. A redeploy alone doesn't re-read it.
  - Any API restart wipes the hosted demo worlds.
- **A second person for live real-time checks:**
  - A background browser tab counts as hidden, so its socket closes.
  - Use a small Node script instead: one that registers through the API and keeps a `ws` socket open, run with `run_in_background` and stopped with `TaskStop`.
  - Register the test accounts from inside the page or the script, so their tokens never pass through the conversation.
  - Usernames need at least 3 characters. Event types are `music-festival`, `concert`, `outdoor`, `group-travel`, `sports` and `arts`.
- **The real-time socket** (`server/src/realtime/hub.js`, `src/services/realtime.js`):
  - It only pokes. Screens pass a topic to `usePolling(fn, ms, { eventId, what })`.
  - A topic with an event slows polling to 60 s once the server confirms that subscription (`subscribed`; a `denied` one keeps its pace). So **any new write that changes what a screen shows needs a poke**, and anything that changes with time alone (a share running out) has to be handled on the phone, as `useLive` does. Writes under `/api/events/:id/...` get one from `pokeOnSuccess` in `routes/events.js`. Anything else needs a call to `notifyEvent` or `notifyUsers`.
  - The hub is one per process. The supertest suites never attach it, so pokes there do nothing. `server/tests/realtime.test.js` attaches it to a real server with a real `ws` client: reuse its `logIn`, `subscribe`, `poke` and `assertHeardNothing` (a barrier, not a timed wait).
  - Hub checks that wait on the database go through `checked()`, which reruns them if `accessChanges` moved meanwhile. Anything new that grants or removes access, or ends presence, must bump it.
  - Rate limits are off in tests. `createApp({ rateLimits: true })` switches the login limit back on for a test.
- **The fake API in app tests** (`src/testUtils/fakeApi.js`):
  - Its `WebSocket` never connects unless `installFakeApi({ realtime: true })`, so older tests keep 4 s polling. With it: `poke(eventId, what)`, `presence(eventId, userIds)`, `dropSocket(code)`, `openSockets()`, and `deniedEvents: [...]` to refuse subscriptions.
  - `friendShareEndsInMs` sets when Alex's live share ends; `moveFriend(eventId, user, { lat, lng })` moves him.
  - Jest 27 here has no `advanceTimersByTimeAsync`, and a zero-delay timer created inside `advanceTimersByTime(0)` doesn't fire. Advance a few milliseconds instead.
  - `holdNext`, `delayNext` and `failNext(method, path, status)` for slow and failing requests.
  - `changeEvent` and `removeEvent` simulate another person's edits.
  - Options include `demoAccount` (a demo account, with no password form) and failure options such as `stopShareFails` and `paymentOutcomes`.
  - `POST /auth/password` accepts the current password `password`, and refuses `password1` as common.
- **`role="status"` and `role="alert"` aren't unique on a screen.** Query them by their text, or within a section.
- **React Router 7 under CRA's Jest** needs the `react-router/dom` mapping in `package.json` and `TextEncoder` from `setupTests.js`. Don't remove them.
- **jsdom has no `matchMedia`** (so it counts as reduced motion), **no `ResizeObserver` and no WebGL.** `MapCanvas.tooltip.test.js` shows how to run the real Leaflet anyway.
- **Testing Leaflet output:** `outerHTML` writes a DOM-set style back out as a `style` attribute. Don't use it to check what the page's policy would see.

## Working with this user

- They want whole features built and the reasoning explained, with no TODOs left for them.
- **Git:**
  - Commit on a new branch. One branch per finish-plan piece has worked well, each branched from the last. Fast-forward `main` locally **only when they ask**. In the last session Claude once fast-forwarded without asking, and owned it.
  - Push only when they say so. They run the push themselves, since the sandbox can't.
- **Commit messages:** one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Asking permission:** follow "Explain permission requests in plain English" in `CLAUDE.md`.
- **They do these themselves:** accounts, passwords, payments, Render dashboard and environment changes, and anything public.
- They run Codex reviews alongside you and paste them in. Check each claim against the code before agreeing, and say plainly where you disagree. Codex found S1, which Claude's own pass missed by checking only the escaped pin icon next to it.
