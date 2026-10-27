# Handoff: where EventBuddy stands (27 Oct 2026)

`CLAUDE.md` has the stack, commands, conventions and the permission boundaries. This note covers what was just finished, what comes next, and the traps to avoid.

## State

- **Security work is done and on `main`.**
  - `origin/main` is at `499991c2`, which covers the map fix (S1) and sessions and passwords (S2, S3).
  - Local `main` is at `2842a117`, with two more commits: the account-switch and API fixes, and the Content Security Policy. Those two weren't pushed when this note was written, so check `git status`.
- **Render needs a redeploy** of both services after each push.
  - The static site must pick up the new `headers` and `INLINE_RUNTIME_CHUNK` from `render.yaml`. If it was set up by hand in the dashboard, add them there.
  - After deploying, open the live site and its map once, to check the policy refuses nothing.
- **CI for the pushed commits hasn't been checked.** `gh` can't reach GitHub from the sandbox (see Traps).
- **Tests:** 329 server tests, 434 app tests and 12 script tests pass, and `CI=true npm run build` is clean. Run the app suite with `--maxWorkers=2`.
- **Not checked on a device:** the iOS build, haptics, pull-to-refresh in WKWebView, the sheets with a real keyboard, enlarged text or VoiceOver, and the new Profile password form.
- **Merged branches that can be deleted (ask first):** `small-fixes`, `phase-3-feel`, `phase-3b`, `going-poll-fix`, `fix-map-tooltip-xss`, `review-fixes-2`.

## What was done: the security review

Claude and Codex each reviewed the app independently. Findings were checked against the code, then fixed with tests. `docs/SECURITY_REVIEW.md` is the full write-up and the record of what's fixed and what's open.

| | What changed | Where |
|---|---|---|
| S1 | A member's name could run as code in the map's friend captions, because Leaflet treats string tooltips as HTML. Captions are now text nodes. | `components/map/MapCanvas.js`, `MapCanvas.tooltip.test.js` (real Leaflet) |
| S2 | Logout ends the session on the server. Each user has a `sessionVersion` and every token carries `sv`. Logout and password changes bump it, which logs out every device. Tokens without `sv` count as 0. | `server/src/middleware/auth.js`, `models/User.js`, `POST /api/auth/logout`, `Profile.js` (`useLogOut`) |
| S3 | Passwords need at least 8 characters. A local common-password list is refused, and so is a password equal to the email or username. `POST /api/auth/password` and a Profile form, hidden for demo accounts (`user.isDemo`). | `server/src/validation.js`, `commonPasswords.js`, `routes/auth.js`, `utils/password.js` |
| R1, R2 | Late auth answers from an older login are ignored. `api.js` only treats a 401 as session-ended for the token still stored. A 401 for a token being replaced by a password change waits for the change's answer. | `services/api.js`, `context/AppContext.js` (startup check) |
| R3, H1, C2 | Oversized bodies get 413. Every API response is `Cache-Control: no-store`. At most 5 demo worlds are built at once; more get a 503. | `middleware/errorHandler.js`, `app.js`, `concurrencyLimit.js` |
| CSP | A strict policy for the web page, plus `nosniff` and a referrer policy. Scripts and styles come only from the app itself, with nothing inline. | `render.yaml` `headers`, `scripts/serve-build.js`, `scripts/serve-build.test.js` |

## Still open

- **F-1:** `TRUST_PROXY=3` in `render.yaml`. If fewer proxies sit in front of the API, a forged `X-Forwarded-For` escapes the login rate limit. The user needs to compare `req.ip` on the deployed API with their real IP, then set the right count. A per-address demo limit (the rest of C2) waits on this.
- **D1:** `maplibre-gl` and `react-router-dom` advisories, neither reachable in this app. Being worked on as this note is written.
- **Known limit:** a logged-out demo token works again if the hosted demo restarts empty and rebuilds that world. Accepted, and documented in `User.js`.

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
| — | Security review and fixes | Done, except F-1 |
| 4 | Real time: WebSockets for chat and locations, an activity feed ("Taylor set the meetup point"), who's in the app now | Planned |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility scores, Sentry, a keep-awake ping | Planned |
| 6 | Day-of mode, the signature feature: during an event, one screen with where everyone is, what's next and who owes what. Then a README case study and a demo video | Planned |

## What comes next

1. **Dependency upgrades (D1), then the README screenshots.** The screenshots still show the look from before Afterglow. Both were in progress as this note was written.
2. **iOS check** in the Simulator: sheets, transitions, skeletons, pull-to-refresh, haptics and the Profile password form. `xcodebuild`, `xcrun` and `npx cap` may need to run outside the sandbox. Open the Simulator panel (`attach`) before building.
3. **Phase 4**, only when the user asks. WebSockets need their own security pass: authorize on connect and on every subscription, and drop a socket when its user is removed or its session version changes.

**Later:**
- Optimistic creates for expenses and schedule items, once there's a server `clientId` for both.
- The sheets need a check with a real phone keyboard, enlarged text and VoiceOver on a device.

## Traps

- **The sandbox.** `.claude/settings.json` turns on Claude Code's Bash sandbox.
  - Writes are limited to the project, `$TMPDIR` and `~/.cache/mongodb-binaries`.
  - **`gh` fails with a TLS error and `git push` can't read credentials.** Give the user the command to run themselves.
  - What else fails inside it: `ps`, `open`, writing to `/tmp`, and most websites. macOS has no `timeout` command either.
  - Never `pkill -f index.js`: it matches the user's :4000 API too, and the classifier blocks it anyway.
  - If a command hits the sandbox, tell the user which restriction it hit. Changing the settings is their call.
- **Editing `server/` restarts the user's :4000 API** (`node --watch`, in-memory MongoDB) and erases their local demo world. In this session the user said that's fine because it isn't production. Still say when it happens.
- **The Content Security Policy is strict.** Anything new the web app loads from another host needs adding to the policy in `render.yaml`, or production will block it: fonts, images from a new non-https host, a new API host, WebSockets in phase 4 (`connect-src` needs the `wss://` address). So does any inline `style="…"`, `on…=` or `<script>` in markup. `scripts/serve-build.test.js` catches the inline cases in CI. To check a real build:
  - `INLINE_RUNTIME_CHUNK=false REACT_APP_API_URL=http://localhost:<api>/api npm run build`
  - then `node scripts/serve-build.js --port 3999 --api http://localhost:<api>`
- **Isolated test APIs.** Start one from a scratchpad folder, so `server/.env` and its Ticketmaster key aren't loaded:
  - `NODE_ENV=production DEMO_MODE=true PORT=41xx JWT_SECRET=<random> CLIENT_ORIGIN=http://localhost:3999 node <repo>/server/src/index.js`
  - Rate limits are on in that mode. A different `X-Forwarded-For` per request gets a fresh bucket while `TRUST_PROXY` trusts it.
- **Live checks:**
  - Use `preview_start` with a `.claude/launch.json` entry (gitignored). The :3000 dev server hangs, so leave it alone. **Try the demo** gives a throwaway world.
  - **Catching a skeleton on screen:** in the page, replace `window.fetch` with one that never resolves `/api/` GETs, then navigate in the app.
  - **Driving a pull:** dispatch `TouchEvent`s with `new Touch(...)` on `.overscroll-y-contain`.
  - **The first screenshot after a tab change can come out blank** while the route transition runs. Take it again.
- **A hidden Browser pane or a background tab pauses `requestAnimationFrame`.** Bring the tab to the front before judging the map or animations.
- **The fake API in app tests** (`src/testUtils/fakeApi.js`):
  - `holdNext`, `delayNext` and `failNext(method, path, status)` for slow and failing requests.
  - `changeEvent` and `removeEvent` simulate another person's edits.
  - Options include `demoAccount` (a demo account, with no password form) and failure options such as `stopShareFails` and `paymentOutcomes`.
  - `POST /auth/password` accepts the current password `password`, and refuses `password1` as common.
- **`role="status"` and `role="alert"` aren't unique on a screen.** Query them by their text, or within a section.
- **jsdom has no `matchMedia`** (so it counts as reduced motion), **no `ResizeObserver` and no WebGL.** `MapCanvas.tooltip.test.js` shows how to run the real Leaflet anyway.
- **Testing Leaflet output:** `outerHTML` writes a DOM-set style back out as a `style` attribute. Don't use it to check what the page's policy would see.

## Working with this user

- They want whole features built and the reasoning explained, with no TODOs left for them.
- **Git:**
  - Commit on a new branch. When asked, fast-forward `main` locally.
  - Push only when they say so. They run the push themselves, since the sandbox can't.
- **Commit messages:** one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Asking permission:** follow "Explain permission requests in plain English" in `CLAUDE.md`.
- **They do these themselves:** accounts, passwords, payments, Render dashboard and environment changes, and anything public.
- They run Codex reviews alongside you and paste them in. Check each claim against the code before agreeing, and say plainly where you disagree. Codex found S1, which Claude's own pass missed by checking only the escaped pin icon next to it.
