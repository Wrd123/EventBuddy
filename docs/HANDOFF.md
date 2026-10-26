# Handoff: where EventBuddy stands (25 Oct 2026, night)

`CLAUDE.md` has the stack, commands and conventions. This note covers what was just finished, what comes next, and the traps to avoid.

## State

- **Phase 3 and the Going fix are on `main`**, pushed. Phase 3 landed at `ef94888a` (CI run 40251059986). The fix for Codex's phase 3 review finding (below) landed at `e5902c16` (CI run 40252460418). Both CI runs passed, for the web app and the API.
- **Only the web Render service needs redeploying**, since the server is unchanged. The user does that.
- **The six small fixes are built on `small-fixes`**, 12 commits, not merged or pushed. The `reviewer` agent checked it twice and every finding is fixed. Waiting on the user to merge.
- **Tests:** 347 app, 301 server and 4 script tests, all passing. `CI=true npm run build` is clean. While an iOS Simulator is busy, the first Map test in each `describe` can time out under full parallelism; `--maxWorkers=2` passes.
- **Not checked:** the iOS build and the haptics on a device. The sheets also haven't been tried with a real phone keyboard, enlarged text or VoiceOver on a device.

## What was done today (phase 3)

Planned in plan mode, built step by step by Sonnet agents, each step checked and committed, then reviewed by the `reviewer` agent. All seven of its findings were fixed in `7814d6da`.

| | What people get | Where |
|---|---|---|
| D5 | Every dialog is one bottom sheet. It traps focus, closes on Escape, a scrim tap or a downward drag, and returns focus to the trigger (or the screen's h1 if the trigger is gone). The screen behind is `inert`. | `common/Sheet.js` (`SheetHostProvider` in `MainLayout` renders the routes container plus a portal host above it; `isolate` keeps Leaflet under it). `useSheet().close()` closes with the exit animation. |
| D4 | Small controls have 44×44 hit areas. Mark paid is a real pill. | the `.tap` utility in `styles/index.css` (an invisible `::before`) |
| D1 | The Home timeline marker column is 54px instead of 68px, with stacked day markers and two-line titles. | `Home.js`, `EventCard.js`, `daysAwayParts` in `utils/dates.js` |
| Motion | Tabs fade, and going deeper slides in from the right. Back slides in from the left, from browser back or the header arrow (`state: { back: true }`). | `layout/RouteTransition.js`. Enter animations only, no fill mode. |
| Haptics | Light taps and success buzzes in the iPhone app; nothing on the web. | `services/haptics.js`, `@capacitor/haptics` 7.0.5 |
| Optimistic | Mark paid and Going change the screen at once and roll back with a reason. | `useLedger.recordPayment` in `Expenses.js`, `setGoing` in `AppContext.js` |

**How the optimistic rules hang together:**
- **Payments:** a pending payment stays across polls until a read contains its `clientId`. Retry ids live in a Map keyed by `from|to|amount` in `useLedger`. An entry is dropped once the server confirms that `clientId`, so a later debt of the same size gets a new id.
- **Going:** at most one request per item is in flight. Taps meanwhile only change `wanted`, and a loop sends again until the server matches. A reply merges only that item's attendees.
- **Error messages:** the generic "Couldn't record ..." shows only for network errors and 5xx. Other failures show the server's message.
- **Pending Going is laid over every read** (`withPendingGoing` in `AppContext`, used by `readEvents`, `fetchEvent` and `storeEvent`). A read can start after a tap yet reach the server before it, and without the overlay it erased the tap. My own entry always comes from the queue's `wanted`, never from the copy on screen. The write's answer counts as a read started when it was sent, so its friend list is dropped if a newer read already landed (Codex's phase 3 review, fixed in `e5902c16`).

## Decisions already made (don't reopen them)

Everything from the previous note still holds:
- cover photos: a fixed rotation, with no picker
- automatic location
- the event map shows only that event
- the meetup flag uses a crosshair and `ResizeObserver`

New today:
- **Leaving or removal needs an even balance** ("Settle up first"). The user chose this over keeping former members on the ledger.
- **Removal sticks.** A removed person can't rejoin until the organizer taps "Let back in" in the invite sheet.
- **The organizer can't leave**; they delete the event instead.
- **Freshness uses polling, not WebSockets.** Phase 4 can add sockets later; polling stays as the fallback.
- **No React Query.** The small `freshness.js` rule is deliberate.
- **Phase 3 has no server edits.** Optimistic creates for expenses and schedule items need a server `clientId` first, so they're a follow-up.
- **The map's bottom panel is not a Sheet.** It's part of the screen, not a dialog, so it doesn't trap focus or drag.
- **Expense and schedule forms close instantly after saving**, with no slide-down, since animating them would delay the reload.

## The roadmap

The goal: a reviewer opens EventBuddy and sees senior-level work. That means a distinctive design, a smooth feel, real time and production-grade engineering. Each phase ships on its own with tests passing. The user judges the visual work, so show screenshots before moving on. The $0 budget rules out push notifications and TestFlight.

| Phase | What | Status |
|---|---|---|
| 1 | Design directions: Afterglow chosen, with Signal's timeline on Home | Done |
| 2 | The design system, and every screen rebuilt on it | Done |
| 3 | Feel: route transitions, draggable sheets, optimistic UI, haptics, with D5, D1 and D4 | Built on `phase-3-feel`, awaiting merge |
| 3b | Loading skeletons instead of spinners, and pull-to-refresh | Planned |
| 4 | Real time: WebSockets for chat and locations, an activity feed ("Taylor set the meetup point"), who's in the app now | Planned |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility scores, Sentry, a keep-awake ping | Planned |
| 6 | Day-of mode, the signature feature: during an event, one screen with where everyone is, what's next and who owes what. Then a README case study and a demo video | Planned |

## What comes next: the small fixes (chosen by the user)

**Done on `small-fixes`.** Where it differs from the plan below:
- **Map tiles (3):** keyless CARTO tiles now show an "API KEY REQUIRED" watermark, so the user chose OpenFreeMap's `fiord` vector style instead. It's drawn by `maplibre-gl` 5.x (6.x is ESM-only, and the Leaflet bridge uses `require`) and tinted plum with one filter on `.leaflet-gl-layer`. Without WebGL it falls back to darkened OSM tiles. The map now sets `maxZoom` itself, because markercluster needs it.
- **Sharing (6):** while `unstopped` names the event, `useLive` keeps the server's share off the phone and retries the stop on each poll. The map says "Couldn't stop sharing yet", and its Stop button clears that. `useLive` now uses `freshness`, so a read from before a stop, start or meetup change is dropped, and each change reads again at once.
- **Logout (5):** `authService` also only caches a user if the login token hasn't changed since the request went out.
- **Testing trap:** a hidden Browser pane or a background tab pauses `requestAnimationFrame`, so MapLibre draws nothing there. Bring the tab to the front before judging the map.

The user asked for **all six small items below, in one batch**, before the iOS check and phase 3b. None needs a server edit. Work on a new branch (e.g. `small-fixes`) with one commit per item. Each needs tests, and both suites must pass. Show screenshots of the visual ones (1–4) at 375 and 390px. Then have the `reviewer` subagent check the branch before asking the user about merging. The pointers are from a quick read; check them before building.

**1. Home rows squeeze dates and locations** (Codex, phase 3 review)
- `src/components/common/EventCard.js` puts `formatDateRangeShort(...)` and `event.location` on one truncating line, so at 375px "Nov 13 – 15, Smoky Mountains" gets cut off.
- Give each its own line: date first, then location, each truncating on its own. Or use a date line with a small `MapPin` location line. Keep the two-line title from phase 3.
- Check the past-events rows on Home use the same card, and check the row height still looks right next to the timeline markers.

**2. The greeting repeats the event name** (D2)
- `headline()` in `src/components/screens/Home.js` (around line 30) gives "Hey John, Picnic in the Park is on." directly above the hero card titled "Picnic in the Park".
- Make the headline say something the card doesn't, without the name. For example, "something's on right now." for an ongoing event, or "your next plan is in 19 days." / "tomorrow's the day." for an upcoming one. Keep "what's the plan?" when there's nothing.
- Update `Home.test.js`, which asserts on the greeting text. Keep it short and friendly, matching the voice.

**3. Clearer map tiles** (D3)
- `src/components/map/MapCanvas.js` uses OpenStreetMap's tiles darkened with a long CSS `filter` (`.eb-tiles-darkened` in `map.css`), which looks muddy. OSM's tile policy is also meant for light use.
- Switch the default to CARTO's free dark basemap, `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` with `subdomains: 'abcd'`. Its attribution must credit both OpenStreetMap contributors and CARTO.
- Drop the CSS filter for these tiles, and keep the `REACT_APP_MAP_TILE_URL` override.
- Check the coral and lilac pins, the friend avatars and the meetup flag still stand out. If plain `dark_all` is too neutral against the plum theme, a light tint is fine.
- Update the comment block above `TILE_URL`, and the README if it mentions the tiles.
- It must stay free and keyless ($0 budget). Don't add a key-based provider.
- CARTO's basemaps are free for non-commercial use within a monthly view limit, which a portfolio demo stays well under. Check their current terms and say so in the code comment.

**4. Wordmark size and the photo backdrop under Reduce Transparency** (D6)
- `Wordmark` in `src/components/common/Header.js:16` hardcodes `text-[19px]`. That overrides its parents: the Login `text-4xl` h1, the Register `text-3xl` h1 and ShowcaseFrame's `text-5xl` all render "EventBuddy" at 19px.
- Make the Wordmark inherit its size (keep the tracking), and give the Header's use its own 19px class.
- Then check the Login and Register screens and the laptop showcase frame visually.
- Reduce Transparency: `@media (prefers-reduced-transparency: reduce)` in `src/styles/index.css` covers `.glass`, `.sheet` and `.sheet-scrim`, but not `PhotoBackdrop`'s blurred photo (`common/PhotoBackdrop.js`). Under that setting, hide the photo or swap it for a flat `bg-night` plus the existing ambient glow, so text never sits on a moving, busy backdrop.

**5. A late response can restore data after logout** (Codex backlog)
- The mutation helpers in `src/context/AppContext.js` (`createNewEvent` around line 260, `updateEventData`, `storeEvent`, `joinEvent`, the schedule helpers, and the `setGoing` loop) apply the server's answer with `changeEvents` whenever it arrives.
- Scenario: create an event, log out before the answer lands, and the new event is added to the logged-out (or next user's) list. `freshness` only guards reads.
- Fix: a session counter (a ref bumped in `clearSession` and `startSession`). Each mutation captures it before awaiting and drops its local update if it changed. Return or throw as before so screens behave the same.
- `setGoing` already clears `goingState` on logout, but its loop still calls `setEvents` afterwards, so guard that too.
- Tests in `AppContext.test.js`: use `holdNext` on the POST, log out, release, and check nothing came back. Do the same for logging in as someone else.

**6. Sharing can switch itself back on after a failed stop** (Codex backlog)
- Likely path, to confirm with a test first:
  - `useLogOut` in `src/components/screens/Profile.js` sets `unstopped`, clears `share` (tracking stops), then `endShareOnServer` fails.
  - The user stays logged in. Any `useLive` poll (`src/hooks/useLive.js`, the "started on another device" branch around line 30) sees the server still sharing and calls `setShare(...)` again, so the phone starts tracking without anyone asking.
- Fix idea: while `unstopped` names that event, `useLive` must not adopt the server's share for it. It should keep showing the "couldn't stop" warning and retry the stop rather than resume tracking. Alternatively, retry the stop in the background until it succeeds or the share's `until` passes.
- Whichever you choose, the user's intent (stop) wins over the server's stale state.
- Tests: use the `stopShareFails` option in `fakeApi.js`.

After the batch:
1. **iOS check:** `npm run build:ios`, then a Simulator run to see the sheets, the transitions and the haptics wiring.
2. **Retake the README screenshots** (`docs/screenshots/*.jpg`). They still show the look from before Afterglow.
3. **Phase 3b** (skeletons, pull-to-refresh), when the user asks.

**Later:**
- Optimistic creates for expenses and schedule items, after adding a server `clientId` to both. That's a server edit, so ask first; see Traps.
- The sheet needs a check with a real phone keyboard, enlarged text and VoiceOver on a device.
- A Map test ("shows your upcoming events and nearby venues") failed once in about 9 full runs during phase 3 and never again. If it recurs, look at its timing.

Phases 3b to 6 are in the roadmap above. Don't start a phase until the user asks.

## Traps

- **Editing `server/` wipes the user's local demo world.** `npm run server` runs `node --watch` with an in-memory MongoDB; `server/.env` has no `MONGODB_URI`. Every save restarts the API and erases everything created locally. Today that cost the user their Hike, Coachella and Stage Coach events. Before the first server edit, check `lsof -iTCP:4000 -sTCP:LISTEN` and ask.
- **Live checks:** use throwaway users at `http://127.0.0.1:3001`. Browser storage is per origin, so this never touches the user's `localhost:3000` session.
  - The :3000 dev server hangs. Leave it alone. Start :3001 from this checkout with `preview_start` and the `web-3001` entry in `.claude/launch.json` (which is gitignored).
  - **Try the demo** gives a throwaway world without credentials. It's safe while the local API is less than 24h old, because older worlds get pruned on the next demo login. Check the start time with `ps -o lstart= -p <api pid>`.
  - The scratch scripts that create two users (register, join, share, pay) were in the session scratchpad and are gone, so rewrite them against `http://localhost:4000/api`.
- **The fake API in app tests** (`src/testUtils/fakeApi.js`) has helpers for the cases above:
  - `holdNext(method, path)` holds a response back to simulate a slow read.
  - `changeEvent` and `removeEvent` simulate another person's edits.
  - Options cover failures: `chatSendsLost`, `paymentOutcomes`, `memberRemovalError`, `stopShareFails`, `goingError`.
  - `delayNext(method, path)` holds a request *before* the server applies it, for a write that hasn't landed yet while a refresh gets there first. `serverEvent(id)` reads what the server has.
  - Polling is triggered with `fireEvent(document, new Event('visibilitychange'))`; no fake timers.
- **Sheets in jsdom:** a missing `matchMedia` counts as reduced motion, so sheets close at once in tests. The animated path is covered in `Sheet.test.js` by mocking `matchMedia`.
- **Fast-forwarding `main`:** use `git branch -f main <branch>` after checking `main` is an ancestor, then check it out.
- **Sonnet agents hit the session limit once.** Resume the same agent with SendMessage after the reset instead of starting over.

## Working with this user

- They want whole features built and the reasoning explained, with no TODOs left for them.
- **Git:**
  - Commit on a new branch. When asked, fast-forward `main` locally.
  - Push only when they say so; today they said "push and delete" and "push it".
  - After a push, watch CI in the background with `gh`, matching the full SHA, and report the result.
- **Commit messages:** one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **They do these themselves:** accounts, passwords, payments, Render dashboard and environment changes, and anything public.
- They run Codex reviews alongside you and paste them in. Check each claim against the code before agreeing, and say plainly where you disagree.
