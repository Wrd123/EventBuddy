# Handoff: where EventBuddy stands (25 Oct 2026, evening)

`CLAUDE.md` has the stack, commands and conventions. This note covers what was just finished, what comes next, and the traps to avoid.

## State

- `main` is at `bd82652e` and pushed. CI passed for both of today's commits (runs 40227714242 and 40229933950: API and Web app both succeeded).
- Both commits changed the API *and* the web app, so both Render services need to be on `bd82652e`. Deploying the API resets everyone's in-memory demo copy, which is expected.
- Tests: 301 server, 284 app and 4 script tests, all passing. The script tests run with `npm run test:scripts`, which CI now runs too.
- **Uncommitted, and not ours:** two `waitFor` edits in `src/components/screens/Map.test.js` (around lines 261 and 505), probably from Codex. Leave them alone, and don't commit them with your own work; stage your hunks only. Ask the user what they want done with them.

## What was done today

Codex reviewed the Afterglow commit and listed engineering findings E1–E6 and design findings D1–D6. All of E1–E6 are now done:

| | What people get | Where |
|---|---|---|
| E1 | Friends' changes show without a refresh. An open event rechecks every 15s, the events list every 30s, the event page's balance and unread hints too. | `src/utils/freshness.js` (one rule: a read only counts if nothing changed locally while it was out and no later read landed first), `AppContext`, `useEvent`, `usePolling` |
| E2 | A payment is counted once. A payment that would take anyone past even gets a 409 ("That's already settled"); retries reuse a `clientId`. | `server/src/idempotency.js`, `server/src/ledger.js`, `server/src/eventLock.js`, `SettlementRow` in `Expenses.js` |
| E3 | A retried chat message is saved once. | `clientId` on messages, `useChat` |
| E4 | Leave an event, or (organizer) remove someone and later let them back in. Only with an even balance. Removed people can't rejoin with an old link. Location sharing stops reliably: a removed phone stops tracking, logout warns if the server still has your share. | `DELETE /api/events/:id/members/:userId`, `Event.removed` (`select: false`), `MemberSheet`, `InviteSheet` removed list, `useLogOut` in `Profile.js`, `SharingContext` (`unstopped`) |
| E5 | iOS release builds require matching `https` API and web URLs, so invite links work. | `scripts/native-env.js`, README |
| E6 | Place lookups answer in time or say "busy": one 10s deadline covering queue and request, a bounded queue, shared in-flight lookups, a 10s budget for the map. | `server/src/discover/places.js`, `routes/map.js` |

**How the money rules hang together:**
- Every change to an event's money or membership runs under `withEventLock` (an in-process, per-event queue), and loads the event *inside* the lock (`ledgerChange` in `routes/expenses.js`).
- This only works because the API is a single process. Running more than one instance needs a Mongo transaction or a ledger revision first; the comment in `eventLock.js` says so.
- Old expenses stay editable after someone leaves, but no edit or delete may move a former member's balance off even (`formerMembersLeftUneven`).

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

## What comes next

The user hasn't chosen yet. I offered **phase 3 (feel)** with D1, D4 and D5 folded in. Plan it in plan mode first, as `CLAUDE.md` asks. Then build, then have the `reviewer` subagent check it.

**Phase 3:** route transitions, draggable sheets, optimistic UI, haptics.
- Optimistic UI is now safe for messages and payments, which have idempotent creates. Other creates (expenses, schedule items) don't have a `clientId` yet. Add one before making them optimistic.
- Haptics: `@capacitor/haptics` on iOS, nothing on the web, and only free packages.
- Motion must respect `prefers-reduced-motion`. Keep the existing reduced-transparency fallbacks and the ones for browsers without `backdrop-filter`.

**Codex's design findings to fold in:**
- **D5:** one shared `Sheet` component, with initial focus, focus trapping, Escape to close, focus returned to the trigger, and the background shut off while it's open. It replaces the hand-rolled `.sheet`/`.sheet-scrim` in InviteSheet, MemberSheet, PlaceSheet, LocalEventSheet and the map panels. Dragging (phase 3) belongs on the same component.
- **D1:** small screens. The Home timeline has a 56px marker column next to cards with one-line titles. Test at 375–430px; 320px phones can't run current iOS, so skip that width. Allow two-line titles and shrink the gutter.
- **D4:** tap targets toward 44×44. "Mark paid" is about 26px tall (`Expenses.js`, `text-xs px-3 py-1`), and small close and edit buttons need the same treatment.

**Later polish:**
- **D2:** the greeting repeats the event name.
- **D3:** switch the map from the CSS-filtered OSM tiles to CARTO dark or Voyager tiles, which are free with attribution.
- **D6:** the Wordmark is hardcoded at 19px. Reduced transparency doesn't cover `.sheet`, `.sheet-scrim` or the photo backdrop.
- After phase 3, retake the README screenshots (`docs/screenshots/*.jpg`), which still show the look from before Afterglow.

**Phases 4–6 are unchanged:**
- **4:** real time
- **5:** TypeScript, Playwright, Lighthouse and accessibility audits, Sentry, a keep-awake ping
- **6:** day-of mode, a case study and a demo video

Don't start a phase until the user asks.

## Traps

- **Editing `server/` wipes the user's local demo world.** `npm run server` runs `node --watch` with an in-memory MongoDB; `server/.env` has no `MONGODB_URI`. Every save restarts the API and erases everything created locally. Today that cost the user their Hike, Coachella and Stage Coach events. Before the first server edit, check `lsof -iTCP:4000 -sTCP:LISTEN` and ask.
- **Live checks:** use throwaway users at `http://127.0.0.1:3001`. Browser storage is per origin, so this never touches the user's `localhost:3000` session.
  - The :3001 dev server runs from this checkout. The one on :3000 has been hanging. Neither is ours to restart.
  - The scratch scripts that create two users (register, join, share, pay) were in the session scratchpad and are gone, so rewrite them against `http://localhost:4000/api`.
- **The fake API in app tests** (`src/testUtils/fakeApi.js`) has helpers for the cases above:
  - `holdNext(method, path)` holds a response back to simulate a slow read.
  - `changeEvent` and `removeEvent` simulate another person's edits.
  - Options cover failures: `chatSendsLost`, `paymentOutcomes`, `memberRemovalError`, `stopShareFails`.
  - Polling is triggered with `fireEvent(document, new Event('visibilitychange'))`; no fake timers.
- **Switching branches** fails while the Map.test.js edits are uncommitted. Today `main` was fast-forwarded with `git branch -f main <branch>` after checking it was an ancestor, then checked out.

## Working with this user

- They want whole features built and the reasoning explained, with no TODOs left for them.
- **Git:**
  - Commit on a new branch. When asked, fast-forward `main` locally.
  - Push only when they say so; today they said "push and delete" and "push it".
  - After a push, watch CI in the background with `gh`, matching the full SHA, and report the result.
- **Commit messages:** one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **They do these themselves:** accounts, passwords, payments, Render dashboard and environment changes, and anything public.
- They run Codex reviews alongside you and paste them in. Check each claim against the code before agreeing, and say plainly where you disagree.
