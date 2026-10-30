# Handoff: where EventBuddy stands (28 Oct 2026)

`CLAUDE.md` has the stack, commands, conventions and the permission boundaries. This note covers what's done, what's next, and the traps.
- **`docs/FINISH_PLAN.md` sets the order of work now.** Items 1 to 3 are done and pushed. **Item 4, scripted demo friends (Phase 4d), is built on `demo-friends`** (see What was done). **Item 5, the abuse backlog, is next.**
- `docs/PHASE_4_PLAN.md` is the plan for Phase 4. All four parts are built; where the build departed from it, this note says so.

## State

- **Git:**
  - GitHub's `main` is at `8179c337` (4c and the last handoff), confirmed on 28 Oct.
  - **`demo-friends`** (local only), branched from `8179c337`, has 4d (`ebf770cf`) and the fixes for Codex's review of it on top. Local `main` is still at `54dc0977`, behind both. The user pushes with `git push origin demo-friends:main`.
  - The user pushes with `git push origin <branch>:main`, so **local `main` can lag behind**. Bring it level with `git switch main && git merge --ff-only origin/main` (or the branch), and check `git rev-list --left-right --count origin/main...main` before trusting this.
  - CI wasn't checked for the 28 Oct pushes. Ask the user to look at the Actions tab.
- **Deployed on Render:**
  - **Checked live on 28 Oct 2026:** retry-safe expense creates are on the API. A retry with the same `clientId` answered 200 with the same expense, and only one was stored.
  - **The API didn't have the demo pass yet** when checked after the push on 28 Oct: a new demo world's picnic had 0 schedule items. It needs a redeploy (see Waiting on the user). The web app deploys itself from `main`.
  - **From 27 Oct:** both services run Phase 4, the expiry fixes and every earlier security fix.
  - The socket connects (`101` in the browser), under the Content Security Policy.
  - The API sends `Cache-Control: no-store`. Logout with no login answers 401, a socket opened from another site gets 403, and a 200 kB body gets 413.
  - `/api/debug/request-ip` answers 404, so `SHOW_REQUEST_IP` is off again.
- **Tests:** 439 server tests, 589 app tests and 12 script tests pass, and `CI=true npm run build` is clean.
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
  - Locally: `main`, `demo-friends` (4d), plus `activity-feed`, `expense-retry`, `chat-read` and `demo-polish`. Those four are already in GitHub's `main`, so `git branch -d` can tidy them once local `main` has caught up.
  - `origin/phase-3b` still exists on GitHub. Deleting it would be a push, so leave it to the user.
  - `.git/config` has three harmless stale `vscode-merge-base` lines. The sandbox can't edit that file.
- **Local servers:**
  - None of Claude's are running.
  - `.claude/launch.json` (gitignored) has `rt-api-4150`, an isolated demo API, and `rt-web-3999`, the production build served with the real headers against it. Rebuild first with `INLINE_RUNTIME_CHUNK=false REACT_APP_API_URL=http://localhost:4150/api npm run build`.
  - A stray API process may still be running from the 4a session (PID 66908, no port). The user was told `kill 66908` stops it.
  - **To screenshot the waiting screen**, build with `REACT_APP_WAKE_SCREEN=true` as well, and open the page before starting `rt-api-4150`.

## Waiting on the user

- **Push `live-glide`** (`git push origin live-glide:main`; it has 4d's fixes under it too), then redeploy the API for it. Check: open the picnic map in the demo; Jordan's walk to the dock (story steps 4 and 7) glides, and captions read in seconds.
- (Earlier) **Push `demo-friends`** if `live-glide` isn't pushed instead, then redeploy the API for it (and for 4c, if that hasn't been done). Check: Try the demo, open the picnic, and within ~15 s "Alex added Ice cream ($18.00)" appears and John's "Owed" drops by $4.50.
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

**Finish plan, item 3: Phase 4c, the compact activity feed (28 Oct, committed as `fc591c4a`, not pushed).** The plan was revised after a Codex review before building, and the `reviewer` subagent checked the diff.
- **Server:**
  - `models/Activity.js`: `kind` is an enum, and `data` is a strict sub-schema (title, description, amount, from/to, changed field names), so a position or meetup note can't be stored. An empty `data` isn't stored at all, so `joined` lines arrive without one. The 30-day TTL is only housekeeping; reads don't filter on it.
  - `activityLog.js`: `record`, `follow` and `forget` all go through `bounded()`, which waits at most `timing.waitMs` (2 s), logs failures and never throws. A line that lands late pokes `event` itself. **This reverses the finish plan's "No timeout"**, because expense and payment routes record inside the ledger lock.
  - **Lines follow their subject:** deleting an expense, payment or plan removes its line, and renaming or re-pricing one updates it. Accepted and documented: a line that lands after the deadline can outlive a delete made in that window.
  - **Only real changes count:** expense and payment creates only when `created`, joins only when `modifiedCount > 0`, event edits only for fields `isModified` before the save. Sharing counts only on a start: `live.js` deletes an expired leftover share, then `findOneAndUpdate` with `returnDocument: 'before'`, and it's a start when there was none or it had run out. That also stops a restart showing the old position. A start pokes `event` too.
  - **Not recorded, on purpose:** organizer removals, Going, meetup clearing, schedule location edits.
  - `GET /api/events/:id/activity?before=<id>` (`routes/activity.js`): 20 a page, newest first, members only.
  - The demo seed gives each world a picnic history (joins, Taylor's four plans, both expenses, three shares starting, the meetup at its `setAt`) and three festival lines. The prune deletes them.
- **App:**
  - `utils/activity.js`: the sentences, plus `mergeNewest`, `appendOlder` and `clearFeed`. The fresh newest page is the truth for its range. A page that doesn't reach the loaded lines replaces the list. The tail's `hasMore` survives refreshes. `gen` drops an older page asked for before a replace.
  - `hooks/useActivity.js`: a 404 means access is lost. It clears the lines and calls `freshness.changed()`, so nothing on its way can restore them. Other failures keep what's shown.
  - EventDetails shows "Recent activity" under Who's going: the newest two lines, each truncated to one line. See all (only when there are more than two) opens `ActivitySheet` with Show earlier. The sheet closes for good when access goes.
  - Payments read "Alex recorded a payment of $80.00 to you" (or "from"). That avoids "a/an $80" and names whoever tapped Mark paid.
- **Checked live** on the isolated API and production build: a new line arrived by poke within 1.5 s, deleting its expense removed it, there were no CSP errors, and 125% text still keeps one line each. The user saw screenshots.

**Finish plan, item 4: Phase 4d, scripted demo friends (28 Oct, on `demo-friends`).** The plan was revised after Codex's review, built by Sonnet subagents, checked by Claude, and reviewed by the `reviewer` subagent, whose findings were all fixed.
- **`server/src/realtime/demoFriends.js`:** when a private world's John first subscribes to his picnic, Alex, Taylor and Jordan play a 7-beat `SCRIPT`: Jordan's chat and pin, Alex's $18 ice cream and his chat about it, Taylor at the dock, Jordan closer, Jordan going to the sunset walk, Taylor's "Group photo" plan, Jordan at the meetup point. The waits are 5, 10 and 15 s, then 20–40 s.
  - **The friends are API clients:** `fetch` to `hub.localUrl()` with `signToken` tokens, so every route check, lock, activity line and poke runs as for a person. A friend's token can't rebuild a pruned world.
  - **Lifecycle:** one awaited loop per world (`sessions`). `stop` is synchronous: it aborts the in-flight request and ends simulated presence, and no new request starts after it. A stop during a claim hands the beat back.
  - **Progress:** `demoScriptStep` on John's User doc, claimed before each beat, so each beat is tried at most once and a later visit resumes.
  - **Truthfulness:** a beat stops at its first failed request.
  - **When it stops:** once the story is told, the friends stay here until John leaves. It stops on the hub's `'left'` (after the grace, logout or expiry), when John leaves the picnic, when the picnic is deleted, and when John's account is gone.
  - **Departures from the plan:** Jordan *resumes* position updates rather than starting to share, because the seed already has him sharing (Codex caught it). `ids.me` and the `SCRIPT` export were dropped.
- **`hub.js`:** `hubEvents` (`'subscribed'`, `'left'`, emitted through a try/catch), `state.simulated` kept apart from `memberships` (`presenceOf` reports the union; `dropFromEvent` prunes both), and `simulatePresence`, `endSimulatedPresence` and `localUrl`.
- **App:** `DemoFriendsNote` ("Demo friends are simulated. At the picnic, they chat, move and add costs while you're here.") for `isDemo`, on EventDetails (under Recent activity), GroupChat (under Here now), the map's LiveBar and Expenses (under Balances). The user saw screenshots.
- **Checked live** on `rt-api-4150` plus the `rt-web-3999` production build: all 7 beats arrived by poke, the balance moved, there were no CSP errors, and no friend request was refused. The final review fixes (stop ordering, claim rollback, the caption's wording) came after that run and are covered by tests only.
- **Fixes from Codex's review of `ebf770cf` (29 Oct):**
  - **P2:** a stopped session's hand-back of an unplayed beat could undo a replacement session's claim, replaying a beat (a duplicate Group photo; schedule POSTs have no retry id). The hand-back now only happens if `demoScriptStep` is still the value its claim set; otherwise the beat is skipped.
  - **P2:** a finished session waited forever, so a world pruned and rebuilt with the same ids never got its story, and a deleted picnic or a John who left went unnoticed. A told session now re-runs the loop's checks every `toldCheckMs` (60 s), and at once when John opens the picnic again: a rebuilt world (counter back at 0) gets its story, and anything else invalid ends the session.
  - "Never undoes a claim made by the session that replaced it" and the four "after the story is told" tests fail when the old code is put back. "Hands the beat back when nobody has claimed since" guards against making the condition too strict.
- **Tests:** `server/tests/demoFriends.test.js` (27). Its cleanup hook is registered before `useTestDatabase()`, so stories stop before each wipe. Not covered: `'left'` through token expiry (it shares `endPresence` with logout, which is tested).

**Smoother live tracking (29 Oct, on `live-glide`, after 4d).** The user asked for a friend's pin that moves like a delivery driver's. The plan was revised twice after Codex's reviews, then built by Sonnet subagents, checked by Claude, and reviewed by the `reviewer` subagent before each commit.
- **Commit A, `b9f9bbf8`, frequent ordered uploads:**
  - **Sender** (`SharingContext` `useShareMyLocation`, `utils/live.js`):
    - about every 2 s while moving on screen, with a 10 s target hidden;
    - one upload in flight, with only the newest fix pending;
    - checked on every location callback, on becoming visible, and after each upload;
    - `hasMoved` needs `max(3 m, min(accuracy, 15 m))`;
    - the heartbeat sends only a new fix;
    - every failure backs off (4/8/16/30 s, `Retry-After` honoured, exposed by CORS).
  - **Ordering** (`routes/live.js`):
    - a fix carries `shareId`, `seq` and `ageMs`;
    - `positionAt = receipt − ageMs`, plus a stored `receivedAt`;
    - only a higher `seq` for that share id is stored, an out-of-date or >2-min-old fix answers 204 with `res.locals.noPoke`, and an ended share answers 409;
    - with none of the three fields, the old unordered path, used by the demo friends.
  - **Keeping count:** `sharing: { id, until, seq }` comes back from `PUT /share` and `GET /live`. The phone keeps its count in `eventbuddy_share_seq` and counts on from the larger of its own and the server's, so a relaunch doesn't freeze the pin (the reviewer's High finding).
- **Commit B, glide and freshness:**
  - **Glide:** `utils/glide.js`, and `createGlider` in `MapCanvas.js` with one rAF loop. It's linear over the measured gap (cap 3 s), snaps after more than 10 s, on first placement, under reduced motion and when the page comes back.
  - **Accuracy circle** (`.eb-accuracy` in `map.css`) above 20 m.
  - **Merge:** `mergePositions` in `useLive` (same share only; the server's list decides who's there).
  - **Captions:** seconds, ticking once a second while friend pins show. `STALE_AFTER_MS` is 2 min.
  - **Demo friends walk:** `walk()` steps with a stop-aware `afterMs` (`timing.walkMs`).
- **Checked live** on `rt-api-4150` plus the `rt-web-3999` build, with `walker.mjs` (scratchpad) as a second person joining by invite.
  - Reads arrived every 2 s, and a fix was readable 5–60 ms after it was measured.
  - The pin moved in 1 px steps across each interval while frames ran.
  - The in-app browser pane pauses frames for about 1 s at a time, so judge smoothness on a device.
  - No CSP errors.
- **Not claimed:** the locked-iPhone pace and battery. That's finish-plan item 6's physical check.
- **Nobody walks through Lake Clara Meer (29 Oct, after the user spotted Jordan crossing it).** Jordan's straight walk to the dock crossed the lake's southern arm, and Alex's seeded pin and nudge target were inside it. Both friends now start on the west shore (`demoData.js`, `demoFriends.js`), every walk is a straight line at least 6 m from the water, and `demoFriends.test.js` checks every seeded pin and every step of the story against the lake's OpenStreetMap outline (`server/tests/fixtures/lake-clara-meer.json`, relation 2474664, ODbL). The routes were checked with a footpath graph from OpenStreetMap (Overpass). Known limit: if a visitor moves the meetup point across the lake, Jordan's last leg is still a straight line.

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
- **The activity feed (28 Oct):** two lines plus See all; organizer removals aren't announced; a line follows its subject (deleted with it, updated with it) rather than being strict history; the write waits at most 2 s; payments say "recorded a payment". The user approved these with the plan.

## The roadmap

The goal: a reviewer opens EventBuddy and sees senior-level work. The user judges the visual work, so show screenshots before moving on. The $0 budget rules out push notifications and TestFlight.

| Phase | What | Status |
|---|---|---|
| 1 | Design directions: Afterglow chosen, with Signal's timeline on Home | Done |
| 2 | The design system, and every screen rebuilt on it | Done |
| 3 | Feel: transitions, draggable sheets, optimistic UI, haptics, with D5, D1 and D4 | Done |
| 3b | Loading skeletons and pull-to-refresh | Done |
| — | Security review and fixes | Done, F-1 included |
| 4 | Real time: pokes, who's here now, an activity feed, scripted demo friends | 4a and 4b deployed; 4c committed, not pushed; 4d next |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility scores, Sentry, a keep-awake ping | Planned |
| 6 | Day-of mode, the signature feature: during an event, one screen with where everyone is, what's next and who owes what. Then a README case study and a demo video | Planned |

## What comes next

Follow `docs/FINISH_PLAN.md`, in order:
1. ~~Correctness~~ (done).
2. ~~The demo and copy pass~~ (done).
3. ~~4c, compact~~ (done, see What was done).
4. ~~4d~~ (built, see What was done).
5. **The abuse backlog (next):** a per-visitor demo budget and a socket queue budget.
6. **Playwright against a real API, the Simulator pass, and the user's physical-iPhone location check.**
7. **Rehearse and package.**

Notes for what's ahead:

1. **iOS check** in the Simulator: sheets, transitions, skeletons, pull-to-refresh, haptics, the Profile password form, the Liberty map, and now the socket and its Origin.
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
  - Activity: event 1 starts with three lines by Alex (joined, Arctic Monkeys, the Airbnb). `addActivity(eventId, { kind, data, actor })`, `removeActivity(eventId, id)`, and `activity: { eventId: [lines, oldest first] }` to replace them (`{}` for none). `failNext('GET', '/events/1/activity', 404)` cuts off only the feed.
- **Activity on the server:** the feed only reads again on an `event` poke (or the 60 s safety poll), so a new kind of line needs a route that pokes `event`. Tests can shorten `timing.waitMs` from `activityLog.js` and stub `Activity.create` with `t.mock.method`.
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
