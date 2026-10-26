# Handoff: where EventBuddy stands (25 Oct 2026, late evening)

`CLAUDE.md` has the stack, commands and conventions. This note covers what was just finished, what comes next, and the traps to avoid.

## State

- **Phase 3 is on `main`** at `ef94888a`, pushed. CI passed (run 40251059986: Web app and API both succeeded). Only the web Render service needs redeploying for it; the user does that.
- **Branch `going-poll-fix`** (not merged, not pushed) fixes Codex's phase 3 review finding (below). Server unchanged.
- **Tests:** 329 app, 301 server and 4 script tests, all passing. `CI=true npm run build` is clean.
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
- **Pending Going is laid over every read** (`withPendingGoing` in `AppContext`, used by `readEvents`, `fetchEvent` and `storeEvent`). A read can start after a tap yet reach the server before it, and without the overlay it erased the tap. My own entry always comes from the queue's `wanted`, never from the copy on screen. The write's answer counts as a read started when it was sent, so its friend list is dropped if a newer read already landed (Codex's phase 3 review, fixed on `going-poll-fix`).

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

## What comes next

1. **The user decides on `going-poll-fix`:** merge to `main` (fast-forward), push, and watch CI.
2. **iOS check:** `npm run build:ios`, then a Simulator run to see the sheets, the transitions and the haptics wiring.
3. **Retake the README screenshots** (`docs/screenshots/*.jpg`). They still show the look from before Afterglow.
4. **Then phase 3b** (skeletons, pull-to-refresh) or the polish below, whichever the user picks.

**Later polish:**
- **D2:** the greeting repeats the event name.
- **D3:** switch the map from the CSS-filtered OSM tiles to CARTO dark or Voyager tiles, which are free with attribution.
- **D6:** the Wordmark is hardcoded at 19px. Reduced transparency now covers `.sheet` and `.sheet-scrim`, but not the photo backdrop.
- Home rows still squeeze dates and locations (Codex, phase 3 review).
- **Backlog Codex reported earlier, acknowledged and not yet fixed:** a late create response can restore state after logout, and a failed stop-sharing request can be followed by sharing switching itself back on.
- Optimistic creates for expenses and schedule items, after adding a server `clientId` to both (a server edit, so ask first; see Traps).

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
