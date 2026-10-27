# Security review: EventBuddy

- **Code reviewed:** `c551650a` (the same app code as `origin/main` at `c2da4bcd`)
- **Date:** 27 October 2026
- **Who:** two independent passes, one by Claude and one by Codex. Each finding below was checked against the code, and reproduced where that was possible.
- **How:** reading the source, plus live tests against a separate local API started in production mode, with its own throwaway database and test accounts. Nothing was tested against the public site, the production database or any third-party service. The user's running servers and demo data were left alone.

This is a scoped review, not a certification. It doesn't claim compliance with OWASP's Application Security Verification Standard (ASVS), and it doesn't say the app is completely secure.

## Summary

The server's access control held up under direct testing:

- Every event route checks that the caller is a member. It answers 404, so it doesn't even confirm the event exists.
- Organizer-only and creator-only actions answer 403 to everyone else.
- A request can't set protected fields such as the organizer or the members.
- Removing someone revokes their access at once, and an old invite link doesn't let them back in.
- The money and location rules were enforced in every case tried.

The serious finding was on the client: **a member's display name could run as code on another member's map (S1).** That is now fixed. Two account weaknesses (S2, S3) mattered more because S1 showed a realistic way for a login token to be stolen. Both are now fixed too.

## Findings

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| S1 | A member's name could run as HTML in the live map's caption | High | **Fixed** on branch `fix-map-tooltip-xss` |
| S2 | Logging out didn't invalidate a login token that was already copied | Medium | **Fixed** on branch `fix-map-tooltip-xss` |
| S3 | Six-character and common passwords were accepted, and there was no way to change a password | Medium | **Fixed** on branch `fix-map-tooltip-xss` |
| F-1 | `TRUST_PROXY=3` can let the login rate limit be sidestepped | Medium if the host has fewer than 3 proxies | Open; the deployment wasn't checked |
| R1 | At startup, a late profile reply could show the previous account after switching accounts | Medium (correctness and privacy) | **Fixed** on branch `review-fixes-2` |
| R2 | A late "session expired" reply for an old login logged out the new one | Low | **Fixed** on branch `review-fixes-2` |
| R3 | A request body over 100 kB returned 500 instead of 413 | Low | **Fixed** on branch `review-fixes-2` |
| C2 | The one-tap demo sign-in has no rate limit and had no cap on concurrent world creation | Hardening | Cap added on `review-fixes-2`; a per-address limit waits on F-1 |
| H1 | No `Cache-Control: no-store` on API responses, and no Content Security Policy on the web page | Hardening | **Fixed** on branch `review-fixes-2` |
| D1 | Dependency advisories in the shipped bundle have no reachable path in this app | Hardening | React Router upgraded on branch `handoff-deps-screenshots`; MapLibre stays on 5.x (see D1) |

### S1: names on the live map (High, fixed)

**The problem.** Friends' captions on the map ("Alex • 2 min ago") were handed to Leaflet as plain strings, and Leaflet inserts string tooltip content as HTML. A name is whatever its owner typed, so markup in a name became live markup for everyone else at the event. It ran as soon as they opened the map, with access to their login token. The pin's initial was already escaped. The caption next to it was a second, unescaped sink.

**Where.** `src/components/map/MapCanvas.js`, at the two places that set a tooltip: `bindTooltip` when a pin first appears, and `setTooltipContent` when its caption changes.

**The fix.** Captions now go to Leaflet as a text node (`captionNode`), so a name always shows as its characters. A changed caption is now detected by comparing it with the caption stored for the pin. The old check compared it with the tooltip's content, which is now a node rather than a string.

**Checked by:**
- `src/components/map/MapCanvas.tooltip.test.js`, which runs the real Leaflet. It renders a friend pin whose name contains markup, both when the pin first appears and after its caption changes. It checks that the caption's text is exactly the name, that no element was created, and that no code ran. Both injection tests fail on the old code and pass on the fix. A third test checks that captions still update as time passes.
- A real-browser check: the app was pointed at the local test API with a sharing member whose name contains markup. The caption shows the raw characters and nothing ran.
- All 410 app tests pass, and `CI=true npm run build` is clean.

**Still worth doing.** Add a Content Security Policy to the web page (H1) as a second line of defence.

### S2: logout didn't revoke sessions (Medium, fixed)

**The problem.** Logging out only cleared the token on the phone. The server accepted any correctly signed token until it expired after 7 days, and there was no logout endpoint. On its own that's the usual trade-off with stateless tokens, but S1 showed how a token could be copied. (An earlier draft of this review called this an accepted risk "because there is no XSS sink". That premise was wrong.)

**The fix:**
- Each user has a `sessionVersion`, and every token carries the version it was issued with (`server/src/models/User.js`, `server/src/middleware/auth.js`). `requireAuth` refuses a token with an old version.
- `POST /api/auth/logout` bumps the version. That ends the login on every device, which is the honest meaning of "log out" while there's one version per person.
- Tokens issued before this change have no version and count as the first, so nobody was logged out by the upgrade.
- The Profile screen ends the session on the server before forgetting the token. If the server can't be reached, it says so and offers Try again or Log out anyway, the same pattern as stopping a location share.

**Checked by:**
- Server tests: a token and a copy of it stop working after logout, other devices are logged out, logging in again works, and older tokens without a version still work.
- App tests: logout calls the server, the offline warning appears, and Try again and Log out anyway both work.
- In a real browser against a local test API: after Log out, a copy of the token taken just before gets 401.

**Known limit.** On the hosted demo, a world that is rebuilt after the server restarts empty starts again at version 0. So a demo token that was logged out before the restart works again once its world is rebuilt. Demo worlds hold only sample data and have no password, so this is accepted. Real accounts aren't rebuilt and aren't affected.

### S3: password policy (Medium, fixed)

**The problem.** The minimum password length was 6, common passwords were accepted, and there was no way to change a password.

**The fix:**
- New passwords need at least 8 characters, and still at most 72 bytes because of bcrypt.
- A short built-in list of common passwords is refused, and nothing is sent to an outside service. So are passwords that just repeat the email, the part before the @, or the username. There are no rules about digits or symbols, so long passphrases work well.
- The rule applies only when a password is set. Existing accounts with shorter passwords still log in.
- `POST /api/auth/password` takes the current password and a new one, and counts toward the login attempt limit. A wrong current password gets 400, not 401, because the app treats 401 as "your session ended".
- A successful change bumps the session version, which logs out every other device, and returns a new token for this one. It does that in one database update, and only if the session is still current, so it can't race a logout.
- Profile has a Change password form, which is hidden for demo accounts since they have no password. The user object now says `isDemo`.
- A change ends the old token, so requests still in flight with it come back 401. `src/services/api.js` now ignores a 401 for a token that is no longer the stored one, so those requests can't log you out right after the change. That also fixes the `api.js` half of R2. One gap is left: a request can be refused after the change lands on the server but before its answer gets back. To cover it, a 401 for the token being replaced waits for that answer, and only logs you out if the change failed.

**Checked by:**
- Server tests for the new rules on sign-up and change, including passphrases, the email and username rules, and non-text input. Others check that a change keeps this device logged in and logs out other sessions, that a wrong current password ends nothing, and that an old short password still logs in.
- App tests for the form: success, the server's messages, and a short or mismatched password caught before sending.
- Concurrency: two changes sent at once with the same login let exactly one through (server test). A background read refused mid-change doesn't log you out (app test). Both tests fail when their guard is removed.
- In a real browser: the form showed the server's "too common" message, then changed the password. The old token got 401 and this phone stayed logged in.

### F-1: proxy trust and the login rate limit (Medium, depends on the host)

`render.yaml` sets `TRUST_PROXY=3`. If fewer than three proxies actually sit in front of the API, `X-Forwarded-For` values a client sends itself decide which rate-limit bucket counts its attempts, so the 20-attempts-per-15-minutes login limit can be sidestepped. This was confirmed locally with no proxy in front. The real proxy chain on Render wasn't checked.

**Fix:** set `TRUST_PROXY` to the verified hop count (often 1), and confirm `req.ip` matches the client's address. Getting it wrong on the low side is safe. Consider also limiting attempts per email address.

**Tests:** the test suite turns rate limits off, so it should gain one test that runs the limiter with a fixed proxy setting.

### R1 and R2: account switching (client, fixed)

- **R1:** when the app opened, its profile check in `src/context/AppContext.js` wasn't tied to the login that sent it. If someone logged out and back in as someone else before it answered, the app showed the previous account's profile, including the email address and payment handles. The stored token stayed the new account's, so no requests were made as the wrong person.
- **R2:** a late 401 for an older token logged out the newer session. That came from two places: `src/services/api.js`, fixed with S3, and that same startup check's own error handling.

**The fix:** the startup check notes which login it belongs to. An answer that lands after a logout or a new login is ignored, whether it succeeded or failed. This uses the same session counter the app already uses for its other session-sensitive requests.

**Checked by:** two app tests, each holding up the startup check, switching accounts, then letting it answer. One answers with the old profile and the other with a 401. The new account stays shown and logged in. Both tests fail on the old code.

### R3: oversized body (Low, fixed)

Bodies over 100 kB were already turned away, but the error handler didn't recognise body-parser's `entity.too.large` error, so the client got a generic 500. It now gets 413 with a short message (`server/src/middleware/errorHandler.js`). This is checked by `server/tests/app.test.js` and against a running API.

### C2: the demo sign-in

`POST /api/auth/demo` deliberately has no rate limit. Pruning keeps at most 300 worlds.

**Added:** at most 5 worlds can be built at once. Further taps get a 503 straight away with "The demo is busy right now. Try again in a moment.", which the login screen shows as it is. They aren't queued, because queued work can pile up and keep running after visitors give up. The limit lives in `server/src/concurrencyLimit.js` and has its own tests. It counts within one process, like the ledger lock.

**Still open:** a limit per address waits on F-1, so that client addresses can be trusted. This wasn't load-tested.

### H1: headers

**Added:** every API response now carries `Cache-Control: no-store` (`server/src/app.js`), so no browser, proxy or CDN keeps a copy of someone's plans, chats, money or friends' locations. This is checked by `server/tests/app.test.js` and against a running API.

**Added: a Content Security Policy for the web page**, set on the static host as `headers` in `render.yaml`, with `nosniff` and a referrer policy alongside it.
- The page runs only its own scripts: no inline scripts, inline event handlers or `eval`. The build keeps its startup script in a file (`INLINE_RUNTIME_CHUNK=false`) so nothing inline is needed.
- No inline styles either. The one inline `style` attribute in the app, a friend pin's colour, now goes on through the DOM.
- It allows what the app really uses: Google Fonts, photos from https hosts, OpenFreeMap's tiles with MapLibre's `blob:` workers, and the API on `onrender.com`. An API anywhere else needs adding to `connect-src`, as the README says.
- Plugins and framing are blocked, and the base address can't be rewritten.

**Checked by:**
- A real production build served with exactly these headers (`scripts/serve-build.js`), browsed through the demo: home, an event, the live map (vector tiles, friends' pins and captions), chat and expenses. No violations were recorded.
- An injected `<img onerror=…>`, the kind of payload S1 used, was refused and didn't run, so the policy would also have stopped S1.
- `scripts/serve-build.test.js`, run in CI, fails if the policy is loosened, if the build would inline its startup script, or if app code adds anything the policy refuses (inline styles, inline handlers, `<script>` in markup, `dangerouslySetInnerHTML`).

**Not checked:** the no-WebGL fallback map (OpenStreetMap's raster tiles, allowed by `img-src https:`), and Discover's Ticketmaster images (no key in the test setup), though both fall under the same `https:` image rule. The live site needs a look after deploying.

### D1: dependencies

The API (`server/`) has no audit findings.

In the app's bundle, two flagged packages actually ship:

- **`react-router-dom` (moderate advisories), upgraded.** One advisory needs server-side rendering and the other needs navigation to an address an attacker controls, so neither applied here. It's now on 7.18, which the audit reports clean.
  - The app had already opted into v7's behaviour, so the upgrade itself was a version bump. The now-pointless `routerFuture` flags are gone.
  - CRA's old Jest needs two shims, both in the test setup: a `moduleNameMapper` for `react-router/dom` in `package.json`, and Node's `TextEncoder` in `setupTests.js`.
  - Checked in a real production build: pushing a screen, the header's Back, the tabs, browser Back, a deep link to a nested route, and the map.
- **`maplibre-gl` (critical advisory), not upgraded.**
  - **Why not:** the advisory concerns MapLibre's attribution HTML. The Leaflet bridge turns off MapLibre's own attribution control, and the map style comes from a fixed URL, so its path isn't reachable here. Every 5.x release is in the advisory's range, and 6.x is ES modules only. It starts its map worker from a separate file it finds with `import.meta.url`, which CRA's webpack can't bundle: the CI build fails on the warning, and the worker file would be missing.
  - **When:** upgrade it along with moving off CRA (for example, to Vite in phase 5).

The rest of the findings are in the Create React App build tools and never run in production. Don't run `npm audit fix --force`, because some of the replacements it suggests would break the build.

### Secrets

No secrets were found in tracked files or in the git history. The demo password is public on purpose, and seeding refuses to run in production. `server/.env` is ignored by git and has never been committed.

## What held up under testing

- **Access control:** every event route kept out non-members, members acting on someone else's records, and removed members. That covers reading an event, its ledger, chat and live positions, editing, inviting and removing people.
- **Protected fields:** extra fields sent on create, and on profile updates, are ignored.
- **Login tokens:** missing, malformed, unsigned (`alg=none`) and tampered tokens are all rejected, and the signing algorithm is fixed.
- **Database queries:** objects sent where text is expected in login fields or chat cursors never reach a query as operators.
- **Money:** splits have to add up to the total. Zero, negative, fractional and oversized amounts are rejected. Payments must involve the person recording them. Reusing a request id with a different amount is refused, and changes to an event's money are processed one at a time.
- **Location:** positions are only accepted while you're sharing. Removal deletes a person's shared location immediately, a stopped share can't resume, and only the latest position is kept.
- **Demo worlds:** each visitor's private world can't see another's events or chat.

## Not covered

- The public deployment, its proxy chain, TLS and caching.
- On-device iOS checks: how the token is stored on the phone, background location, deep links.
- Running more than one server process. The lock that serializes money changes only works within one process.
- Real-time features, which don't exist yet (phase 4) and will need their own review.
