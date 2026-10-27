# Handoff: where EventBuddy stands (27 Oct 2026)

`CLAUDE.md` has the stack, commands, conventions and the permission boundaries. This note covers what was just finished, what comes next, and the traps to avoid.

## State

- **Local `main` is at `c2da4bcd`, 10 commits ahead of `origin/main`, and not pushed.** It holds phase 3b, the sandbox fix and the new `CLAUDE.md` sections. The user pushes it, or tells you to. `phase-3b` points at the same commit.
- **`origin/main` is at `3d2dd0f7`** (the six small fixes), and CI run 40494828677 passed for it.
- **After the push, both Render services need a redeploy,** because `server/src/db.js` changed. The user does that.
- **Tests:** 407 app tests and 301 server tests pass, and `CI=true npm run build` is clean. Run the app suite with `--maxWorkers=2`, because the machine is heavily loaded.
- **Not checked on a device:** the iOS build, haptics, and how pull-to-refresh feels in WKWebView (rubber band, the tap at the threshold). The sheets also haven't been tried with a real keyboard, enlarged text or VoiceOver.
- **The `small-fixes` branch is merged.** It can be deleted, but ask first.

## What was done (phase 3b)

Planned in plan mode, built by Sonnet agents one step at a time, checked and committed, then reviewed by the `reviewer` agent. All of its findings were fixed in `c2da4bcd`.

| | What people get | Where |
|---|---|---|
| Skeletons | While a screen loads, it keeps its real header and Back button and shows a shimmering outline of its content. Screen readers hear one sentence, such as "Loading the schedule". `ScreenLoader` is gone. | `common/Skeleton.js` (`Skeleton`, `SkeletonScreen`) and the `.skeleton` sweep in `styles/index.css`. Each screen's skeleton is a small component in its own file. The Map's `Suspense` fallback is in `MainLayout.js`. |
| Pull to refresh | Pull down from the top on Home, Chats, an event, its Schedule, Expenses or Discover. A ring fills as you pull, the phone taps at 64px, and the content holds at 56px with a spinner for at least 400ms. A failure shows "Couldn't refresh. Check your connection." for 2.5s. | `hooks/usePullToRefresh.js`, `common/PullIndicator.js`, `utils/pull.js` (rubber band capped at 96px), `utils/motion.js` (`prefersReducedMotion`, shared with `Sheet`) |
| Quiet refreshes | Refreshes that resolve or reject but never put the screen back into loading or blank it. | `AppContext.refreshEvents`, `useEvent().refresh`, `useChats().refresh`, `useLedger().reload({ rethrow: true })`, `useNearbyEvents().refresh`, `useEventSummary().refresh` |
| Sandbox | The server and its tests run inside Claude Code's sandbox. | `--nounixsocket` in `server/src/db.js` and `server/tests/helpers.js` |
| Rules | The permission boundaries, and the plain-English format for asking permission. | `CLAUDE.md`, enforced by `.claude/settings.json` (gitignored) |

**How pull-to-refresh hangs together:**
- **Wiring a screen:** wrap the screen's scroll container in `<div className="relative flex-1 overflow-hidden">{indicator}…</div>`. Give the container `ref={bind}` and `h-full overflow-y-auto overscroll-y-contain`. The indicator must be the container's sibling, because the hook slides the container itself down. The hook's header comment explains this.
- **Drawing:** the drag position and the ring's fill are written straight to the DOM through refs, so a touchmove doesn't re-render the screen. React state only covers "refreshing" and "failed".
- **Starting a pull:** a pull starts only when `scrollTop === 0` at touchstart and the first move is downward and more vertical than horizontal. A negative `scrollTop` means iOS is still bouncing. Inside the 6px slop, a downward move already calls `preventDefault`, so WKWebView's own scroll can't start and stack on ours. A second finger ends the pull.
- **Screen readers:** `PullIndicator` keeps one `role="status"` span mounted and only changes its text. The visible failure pill is `aria-hidden`. `SkeletonScreen` puts its sentence as text inside the region and has no `aria-busy`.
- **The event page:** its header floats over the photo, so it passes `{ messageTop: 68 }`. The ring still sits between Back and Edit while spinning. The reviewer called that crowded, I thought it was fine, and the user hasn't judged it yet.
- **Home:** a failed suggestions refresh doesn't fail the pull, because Home already hides suggestion errors.

## Decisions already made (don't reopen them)

- cover photos: a fixed rotation, with no picker
- automatic location
- the event map shows only that event
- the meetup flag uses a crosshair and `ResizeObserver`
- leaving or removal needs an even balance ("Settle up first")
- removal sticks until the organizer taps "Let back in"
- the organizer can't leave; they delete the event
- freshness uses polling, with WebSockets possibly added in phase 4 and polling kept as the fallback
- no React Query; the small `freshness.js` rule is deliberate
- the map's bottom panel is not a Sheet
- expense and schedule forms close instantly after saving
- **map tiles:** OpenFreeMap's `fiord` style, drawn by MapLibre, with OSM tiles as the fallback when there's no WebGL. Keyless CARTO tiles show a watermark.
- **No pull to refresh on Chat, Map, the forms or Profile.** On Chat a pull at the top loads earlier messages, on the Map a drag pans, and the forms and Profile have nothing to refresh.

## The roadmap

The goal: a reviewer opens EventBuddy and sees senior-level work. That means a distinctive design, a smooth feel, real time and production-grade engineering. Each phase ships on its own with tests passing. The user judges the visual work, so show screenshots before moving on. The $0 budget rules out push notifications and TestFlight.

| Phase | What | Status |
|---|---|---|
| 1 | Design directions: Afterglow chosen, with Signal's timeline on Home | Done |
| 2 | The design system, and every screen rebuilt on it | Done |
| 3 | Feel: transitions, draggable sheets, optimistic UI, haptics, with D5, D1 and D4 | Done, pushed |
| 3b | Loading skeletons and pull-to-refresh | Done, on local `main`, not pushed |
| 4 | Real time: WebSockets for chat and locations, an activity feed ("Taylor set the meetup point"), who's in the app now | Planned |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility scores, Sentry, a keep-awake ping | Planned |
| 6 | Day-of mode, the signature feature: during an event, one screen with where everyone is, what's next and who owes what. Then a README case study and a demo video | Planned |

## What comes next

1. **Push `main`** when the user says so (`git push origin main`). Then watch CI in the background with `gh`, matching the full SHA, and report the result.
2. **iOS check:** run `npm run build:ios`, then use the Simulator to look at the sheets, transitions, skeletons and pull-to-refresh, plus the haptics wiring. `xcodebuild`, `xcrun` and `npx cap` are excluded from the sandbox for this. Open the Simulator panel (`attach`) before building.
3. **Retake the README screenshots** (`docs/screenshots/*.jpg`). They still show the look from before Afterglow.
4. **Phase 4**, only when the user asks.

**Later:**
- Optimistic creates for expenses and schedule items, once there is a server `clientId` for both. That's a server edit, so ask first.
- The sheets need a check with a real phone keyboard, enlarged text and VoiceOver on a device.

## Traps

- **The sandbox (new).** `.claude/settings.json` turns on Claude Code's Bash sandbox:
  - Writes are limited to the project, `$TMPDIR` and `~/.cache/mongodb-binaries`.
  - The network only reaches npm, GitHub and MongoDB's download site.
  - `gh`, `xcodebuild`, `xcrun` and `npx cap` run outside it.
  - What fails inside it: `ps`, `open`, writing to `/tmp`, and other websites. macOS has no `timeout` command either.
  - If a command hits the sandbox, tell the user which restriction it hit. Changing the settings is their call. A "yes" in chat doesn't authorize editing the permission rules.
- **Editing `server/` wipes the user's local demo world.** `npm run server` runs `node --watch` with an in-memory MongoDB. Every save restarts the API and erases everything created locally. Before a server edit, check whether an API is listening on :4000 and ask, using the plain-English format in `CLAUDE.md`.
  - In this session an API was already running on :4000 that Claude hadn't started. It answered `{"status":"ok","demo":true}`. If the user started it, the `db.js` edit restarted it and reset its demo data.
- **Live checks:** use `http://127.0.0.1:3001`, started with `preview_start` and the `web-3001` entry in `.claude/launch.json` (gitignored). The :3000 dev server hangs, so leave it alone. **Try the demo** gives a throwaway world.
  - **Catching a skeleton on screen:** in the page, replace `window.fetch` with one that never resolves `/api/` GETs, then navigate in the app. A reload removes the override.
  - **Driving a pull:** dispatch `TouchEvent`s with `new Touch(...)` on `.overscroll-y-contain`.
  - **The first screenshot after a tab change can come out blank** while the route transition runs. Take it again.
- **A hidden Browser pane or a background tab pauses `requestAnimationFrame`.** Bring the tab to the front before judging the map or animations.
- **The fake API in app tests** (`src/testUtils/fakeApi.js`):
  - `holdNext` and `delayNext` for slow reads and writes.
  - `failNext(method, path, status)` (new) makes one request fail.
  - `changeEvent` and `removeEvent` simulate another person's edits.
  - Options cover failures: `chatSendsLost`, `paymentOutcomes`, `memberRemovalError`, `stopShareFails`, `goingError`.
  - Polling is triggered with `fireEvent(document, new Event('visibilitychange'))`.
- **`role="status"` is no longer unique on a screen.** Every pull-to-refresh screen has an always-mounted, empty status span. In tests, query a status by its text, e.g. `findByText('…', { selector: '[role=status]' })`, not with a bare `getByRole('status')`.
- **jsdom has no `matchMedia`.** That counts as reduced motion, so sheets close at once and the pull snaps back with no spring.
- **Sonnet agents in the background:** tell them to stage files by path (no `git add -A`) when you are editing the same tree. Resume an agent with SendMessage instead of starting over.

## Working with this user

- They want whole features built and the reasoning explained, with no TODOs left for them.
- **Git:**
  - Commit on a new branch. When asked, fast-forward `main` locally.
  - Push only when they say so.
- **Commit messages:** one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Asking permission:** follow "Explain permission requests in plain English" in `CLAUDE.md`, using Action, Reason, Impact, Recovery, Alternative and Permission.
- **They do these themselves:** accounts, passwords, payments, Render dashboard and environment changes, and anything public.
- They run Codex reviews alongside you and paste them in. Check each claim against the code before agreeing, and say plainly where you disagree.
