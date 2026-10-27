# Handoff: where EventBuddy stands (27 Oct 2026)

`CLAUDE.md` has the stack, commands, conventions and the permission boundaries. This note covers what was just finished, what's waiting on the user, what comes next, and the traps to avoid. The next big piece, Phase 4, has its own plan in `docs/PHASE_4_PLAN.md`.

## State

- **Git, when this note was written:**
  - `main` and GitHub's `main` are both at `45390d63`, with Phases 4a (pokes) and 4b (who's here now). The user pushed it on 27 Oct 2026.
  - **The fixes for Codex's review of `45390d63` are on the branch `fix-realtime-expiry`**: WS-1, sockets now close when their token expires, and L-1, the map's share-expiry clock. See `docs/SECURITY_REVIEW.md`.
  - The only local branch besides that one is `main`.
  - Check `git status` and `git rev-list --left-right --count origin/main...main` before trusting any of this.
- **Deployed on Render:**
  - The live site matches `acae73de`.
  - **The Content Security Policy is live**, checked by the user on 27 Oct 2026: the headers are there, and the app and map work under them.
- **Render needs a redeploy** of both services after each push.
  - **A change to `render.yaml` itself (headers, environment) also needs a Blueprint sync** in the Render dashboard: Blueprints → Manual Sync.
  - A redeploy alone doesn't re-read `render.yaml`, which is why the policy first went out missing.
- **The map** uses OpenFreeMap's Liberty style, darkened. The map screen's bottom sheet no longer gets covered by the map (see Decisions).
- **CI for the pushed commits hasn't been checked.** `gh` can't reach GitHub from the sandbox (see Traps), so ask the user to look at the Actions tab.
- **Tests (on `fix-realtime-expiry`):** 360 server tests, 468 app tests and 12 script tests pass, and `CI=true npm run build` is clean.
  - Run the app suite with `--maxWorkers=2`.
  - Run the script tests with `npm run test:scripts`, not `node --test scripts/`.
- **`npm audit --omit=dev`:** the server reports nothing. The app reports only `maplibre-gl` (see D1).
  - `react-scripts` is a dev dependency, so CRA's dev-server advisories (`webpack-dev-server`, `proxy-addr`, `websocket-driver` and the rest) only show in the full `npm audit`.
  - None of it ships in the built site.
- **Not checked on a device:**
  - the iOS build, haptics and pull-to-refresh in WKWebView
  - the sheets with a real keyboard, enlarged text or VoiceOver
  - the Profile password form
  - the darkened Liberty map in WKWebView
- **Branches:**
  - All merged local branches are deleted.
  - `origin/phase-3b` still exists on GitHub. Deleting it would be a push, so leave it to the user.
  - `.git/config` has three harmless stale `vscode-merge-base` lines for deleted branches. The sandbox can't edit that file.
- **No test servers are running**, and the `build-csp` and `web-3999-pentest` launch entries are removed. Start a fresh isolated API as described under Traps when one is needed.

## Waiting on the user

- **F-1, measuring the proxy count.** The API now has `GET /api/debug/request-ip`, which exists only while `SHOW_REQUEST_IP=true`. It returns the caller's own `ip`, `forwardedFor`, `connectedFrom` and the current `trustProxy`. The user was asked to:
  1. Push `main`, and wait for the API's deploy.
  2. Set `SHOW_REQUEST_IP=true` on the API service in Render.
  3. Open `https://<api>.onrender.com/api/debug/request-ip` and send back the three values. They may write `ME` in place of their own IP.
  4. Remove `SHOW_REQUEST_IP` again.

  To find the right `TRUST_PROXY`, count positions:
  - `connectedFrom` is position 0.
  - The addresses in `forwardedFor` are positions 1, 2, … counting from the right.

  `TRUST_PROXY` is the position of their real IP. For example, `forwardedFor: "ME, 104.x"` gives 2. Set it in `render.yaml`; the user then needs a **Blueprint sync**. Also add the limiter test that F-1 in `docs/SECURITY_REVIEW.md` asks for. Removing the debug route afterwards is optional, since it's off by default.
- **CI:** the user hasn't reported the Actions tab yet.

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

- **F-1:** `TRUST_PROXY=3` in `render.yaml`. If fewer proxies sit in front of the API, a forged `X-Forwarded-For` escapes the login rate limit. The measurement is under way (see Waiting on the user). A per-address demo limit (the rest of C2) waits on this.
- **D1:** React Router is upgraded to 7, and the audit reports it clean. `maplibre-gl` stays on 5.x, whose advisory isn't reachable here, because 6.x can't be bundled by CRA (see `docs/SECURITY_REVIEW.md`). Upgrade it along with moving off CRA, for example to Vite in phase 5.
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
| — | Security review and fixes | Done, except F-1 |
| 4 | Real time: WebSockets for chat and locations, an activity feed ("Taylor set the meetup point"), who's in the app now, and scripted demo friends | 4a on `main`; 4b on `phase-4b-presence`; 4c and 4d next (see `docs/PHASE_4_PLAN.md`) |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility scores, Sentry, a keep-awake ping | Planned |
| 6 | Day-of mode, the signature feature: during an event, one screen with where everyone is, what's next and who owes what. Then a README case study and a demo video | Planned |

## What comes next

1. **Finish F-1** as soon as the user sends the measured values (see Waiting on the user).
2. **Phase 4.** Follow `docs/PHASE_4_PLAN.md`:
   - **4a is built** on `phase-4a-realtime`. Where it departs from the plan:
     - no `setupProxy.js`, since CRA's `proxy` already forwards WebSockets;
     - pruning a demo world doesn't close its sockets;
     - the chats list keeps its own 15 s poll;
     - the events list hears `events` pokes but keeps its 30 s pace;
     - meetup changes poke both `live` and `event`.

     Deploying it needs a **Blueprint sync**, for `wss://*.onrender.com` in `connect-src`. After the deploy, the user checks the live site's console for a socket blocked by the policy.
   - **4b is built** on `phase-4b-presence`:
     - Presence is "has a logged-in socket", with a 5 s grace on leaving.
     - It's ids only, sent only to the event's subscribers.
     - The hub learns each online person's events when their first socket logs in, and keeps them current through `dropFromEvent` and `addMember`.
     - `usePresence(eventId)` gives the others who are here.
   - Build 4c (the activity feed) and 4d (scripted demo friends) next, each on its own branch. 4d's friends can show as here by joining `state.memberships` the way a socket does.
   - **The map's first fit can put a friend's pin right under the bottom sheet's edge.** That was there before 4b; found during the 4b screenshots.
   - **Hardening backlog from Codex's review:**
     - a per-socket budget for queued inbound messages. The 1 kB frame limit and the socket cap don't bound how many small messages queue up.
     - a check of what Origin the iPhone app's WebView really sends. It must be in `CLIENT_ORIGIN`, so don't assume it sends none.
   - **Render last deployed `2842a117`** (according to the log the user shared with Codex), which predates Phase 4. Deploying needs a Blueprint sync, then both services redeployed.
   - Each gets tests, the strict build and the `reviewer` subagent before it's committed, plus screenshots for the user before any UI commit.
   - Plan the first part in plan mode, per `CLAUDE.md`.
3. **iOS check** in the Simulator: sheets, transitions, skeletons, pull-to-refresh, haptics, the Profile password form and the Liberty map. It can come before or after Phase 4, as the user prefers.
   - `xcodebuild`, `xcrun` and `npx cap` may need to run outside the sandbox.
   - Open the Simulator panel (`attach`) before building.

**Later:**
- Optimistic creates for expenses and schedule items, once there's a server `clientId` for both.
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
- **The real-time socket** (`server/src/realtime/hub.js`, `src/services/realtime.js`):
  - It only pokes. Screens pass a topic to `usePolling(fn, ms, { eventId, what })`.
  - A topic with an event slows polling to 60 s once the server confirms that subscription (`subscribed`; a `denied` one keeps its pace). So **any new write that changes what a screen shows needs a poke**, and anything that changes with time alone (a share running out) has to be handled on the phone, as `useLive` does. Writes under `/api/events/:id/...` get one from `pokeOnSuccess` in `routes/events.js`. Anything else needs a call to `notifyEvent` or `notifyUsers`.
  - The hub is one per process. The supertest suites never attach it, so pokes there do nothing.
- **The fake API in app tests** (`src/testUtils/fakeApi.js`):
  - Its `WebSocket` never connects unless `installFakeApi({ realtime: true })`, so older tests keep 4 s polling. With it: `poke(eventId, what)`, `dropSocket(code)` and `openSockets()`.
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
  - Commit on a new branch. Fast-forward `main` locally **only when they ask**. In the last session Claude once fast-forwarded without asking, and owned it.
  - Push only when they say so. They run the push themselves, since the sandbox can't.
- **Commit messages:** one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Asking permission:** follow "Explain permission requests in plain English" in `CLAUDE.md`.
- **They do these themselves:** accounts, passwords, payments, Render dashboard and environment changes, and anything public.
- They run Codex reviews alongside you and paste them in. Check each claim against the code before agreeing, and say plainly where you disagree. Codex found S1, which Claude's own pass missed by checking only the escaped pin icon next to it.
