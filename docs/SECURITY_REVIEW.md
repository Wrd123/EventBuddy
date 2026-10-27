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

The serious finding was on the client: **a member's display name could run as code on another member's map (S1).** That is now fixed. Two account weaknesses (S2, S3) matter more than they otherwise would, because S1 showed a realistic way for a login token to be stolen. They are the next priority.

## Findings

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| S1 | A member's name could run as HTML in the live map's caption | High | **Fixed** on branch `fix-map-tooltip-xss` |
| S2 | Logging out doesn't invalidate a login token that was already copied | Medium | Open |
| S3 | Six-character and common passwords are accepted, and there's no way to change a password | Medium | Open |
| F-1 | `TRUST_PROXY=3` can let the login rate limit be sidestepped | Medium if the host has fewer than 3 proxies | Open; the deployment wasn't checked |
| R1 | At startup, a late profile reply can show the previous account after switching accounts | Medium (correctness and privacy) | Open |
| R2 | A late "session expired" reply for an old login logs out the new one | Low | Open |
| R3 | A request body over 100 kB returns 500 instead of 413 | Low | Open |
| C2 | The one-tap demo sign-in has no rate limit and no cap on concurrent world creation | Hardening | Open; not load-tested |
| H1 | No `Cache-Control: no-store` on signed-in API responses, and no Content Security Policy on the web page | Hardening | Open |
| D1 | Dependency advisories in the shipped bundle have no reachable path in this app | Hardening | Triaged |

### S1: names on the live map (High, fixed)

**The problem.** Friends' captions on the map ("Alex • 2 min ago") were handed to Leaflet as plain strings, and Leaflet inserts string tooltip content as HTML. A name is whatever its owner typed, so markup in a name became live markup for everyone else at the event. It ran as soon as they opened the map, with access to their login token. The pin's initial was already escaped. The caption next to it was a second, unescaped sink.

**Where.** `src/components/map/MapCanvas.js`, at the two places that set a tooltip: `bindTooltip` when a pin first appears, and `setTooltipContent` when its caption changes.

**The fix.** Captions now go to Leaflet as a text node (`captionNode`), so a name always shows as its characters. A changed caption is now detected by comparing it with the caption stored for the pin. The old check compared it with the tooltip's content, which is now a node rather than a string.

**Checked by:**
- `src/components/map/MapCanvas.tooltip.test.js`, which runs the real Leaflet. It renders a friend pin whose name contains markup, both when the pin first appears and after its caption changes. It checks that the caption's text is exactly the name, that no element was created, and that no code ran. Both injection tests fail on the old code and pass on the fix. A third test checks that captions still update as time passes.
- A real-browser check: the app was pointed at the local test API with a sharing member whose name contains markup. The caption shows the raw characters and nothing ran.
- All 410 app tests pass, and `CI=true npm run build` is clean.

**Still worth doing.** Add a Content Security Policy to the web page (H1) as a second line of defence.

### S2: logout doesn't revoke sessions (Medium)

Logging out only clears the token on the device (`src/services/authService.js`). The server accepts any correctly signed token until it expires after 7 days, and there's no logout endpoint. On its own this is the usual trade-off with stateless tokens. S1 showed how a token could be copied, though. (An earlier draft of this review called this an accepted risk "because there is no XSS sink". That premise was wrong.)

**Fix:** add a session version to each user and include it in the token. `requireAuth` then rejects tokens with an old version. Logging out, or changing the password, bumps the version.

### S3: password policy (Medium)

The minimum password length is 6 (`server/src/validation.js`), common passwords are accepted, and there's no way to change a password.

**Fix:**
- Raise the minimum to at least 8, and reject a short list of common passwords locally.
- Add a password-change route that requires the current password and revokes other sessions (see S2).

### F-1: proxy trust and the login rate limit (Medium, depends on the host)

`render.yaml` sets `TRUST_PROXY=3`. If fewer than three proxies actually sit in front of the API, `X-Forwarded-For` values a client sends itself decide which rate-limit bucket counts its attempts, so the 20-attempts-per-15-minutes login limit can be sidestepped. This was confirmed locally with no proxy in front. The real proxy chain on Render wasn't checked.

**Fix:** set `TRUST_PROXY` to the verified hop count (often 1), and confirm `req.ip` matches the client's address. Getting it wrong on the low side is safe. Consider also limiting attempts per email address.

**Tests:** the test suite turns rate limits off, so it should gain one test that runs the limiter with a fixed proxy setting.

### R1 and R2: account switching (client)

- **R1:** in `src/context/AppContext.js`, the startup profile refresh isn't tied to the session that sent it. If someone logs out and logs in as someone else before it answers, the app shows the previous account's profile. That profile includes the email address and payment handles. The stored token stays the new account's, so no requests are made as the wrong person.
- **R2:** `src/services/api.js` treats any 401 on a request that carried a token as "this session expired", even when the token was an older one. The startup refresh's own 401 handling in `AppContext.js` has the same gap.

**Fix:** ignore a reply, success or failure, unless it belongs to the session that's current now. The app already does this for its other session-sensitive requests.

### R3: oversized body (Low)

Request bodies over 100 kB are rejected, but the error handler in `server/src/middleware/errorHandler.js` doesn't recognise body-parser's `entity.too.large` error, so the client gets a generic 500 instead of a 413. Nothing internal is revealed.

**Fix:** return 413 with a short message for that error type.

### C2: the demo sign-in

`POST /api/auth/demo` deliberately has no rate limit. Pruning keeps at most 300 worlds, but nothing limits how fast or how many at once new worlds can be created. This wasn't load-tested. Once F-1 is fixed, so that client addresses can be trusted, add a modest limit per address and cap concurrent world creation.

### H1: headers

API responses get Helmet's headers, but signed-in responses carry no `Cache-Control: no-store`. The static web page has no Content Security Policy, so the policy has to be set on the static host.

### D1: dependencies

The API (`server/`) has no audit findings.

In the app's bundle, two flagged packages actually ship:

- **`maplibre-gl` (critical advisory):** the advisory concerns MapLibre's attribution HTML. The Leaflet bridge turns off MapLibre's own attribution control, and the map style comes from a fixed URL, so the advisory's path isn't reachable here. Upgrade anyway.
- **`react-router-dom` (moderate advisories):** one needs server-side rendering, and the other needs navigation to an address an attacker controls. Neither applies to this app.

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
