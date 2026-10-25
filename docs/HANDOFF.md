# Handoff: where EventBuddy stands (25 Oct 2026)

`CLAUDE.md` has the stack, commands and conventions. This note covers what was just finished, what comes next, and the traps to avoid.

## State

- `main` is at `18de0410` (adds CLAUDE.md) and is clean. The Afterglow redesign (`462729b7`) is pushed, and CI passed for it (run 40219933874: API and Web app both succeeded). Only the web app on Render needed a redeploy.
- Test counts: about 248 app tests and 259 server tests, all passing. One Discover test sometimes logs an `act(...)` warning. It's a timing issue, not a failure.

## The plan the user signed up for

The goal is to take the app from "junior to mid-level" to a senior-level showcase: a striking UI and a smooth feel.

| Phase | What | Status |
|---|---|---|
| 1 | Design direction (canvas: https://claude.ai/artifact/LuBq4gJpNUEP1g3BZvoTRS) | Done |
| 2 | Afterglow design system and every screen rebuilt | Done |
| 3 | **Feel:** route transitions, draggable sheets, optimistic UI, haptics | **Next. Offered, not yet requested** |
| 4 | Real time: WebSockets for chat and locations, an activity feed | Not started |
| 5 | Engineering: TypeScript, Playwright, Lighthouse and accessibility audits, Sentry, a keep-awake ping for Render | Not started |
| 6 | Signature "day-of mode", case study, demo video | Not started |

Don't start a phase until the user asks for it.

### Notes for phase 3

- Sheets today are `.sheet` and `.sheet-scrim` in `src/styles/index.css`. They slide up but can't be dragged. Used by PlaceSheet, LocalEventSheet and the Map panels.
- Haptics: Capacitor 7 is already in, so use `@capacitor/haptics` on iOS and do nothing on the web. Any new package has to be free.
- Motion has to respect `prefers-reduced-motion`. Afterglow already has fallbacks for `prefers-reduced-transparency` and for browsers without `backdrop-filter`. Keep both.
- After phase 3, retake the README screenshots (`docs/screenshots/*.jpg`). They still show the pre-Afterglow look.

## Afterglow in one paragraph

A deep plum night (`night #120e1c`) lit by each event's photo. `PhotoBackdrop` blows up a 48px copy of the photo and blurs it behind the screen; `AmbientGlow` sits under everything. On top, `.card` is tinted translucent with no blur, and `.glass` uses real backdrop blur, saved for floating things like the tab bar, chips and the hero card's panes. The accent is coral `#ff8f5e`, and text on it is `text-night`. Primary buttons are white pills (`bg-fg text-night`). The font is Geist. The floating tab bar (`Footer.js`) is absolutely positioned, so scrolling screens add `TAB_BAR_CLEARANCE` (`pb-28`). Home is a timeline: a "Now" or "N days" marker beside each event, with `NextUpCard` as the hero.

## Decisions already made (don't reopen them)

- **Cover photos:** no picker. Each type has 10 Unsplash photos in a fixed order (`src/utils/coverPhotos.js`). The server sets `coverIndex` by counting the organizer's existing events of that type, modulo 10, and picks again when the type changes. Never random. Clients can't set it.
- **Location:** found automatically once per launch or login (`AppContext`), unless the user picked a city themselves (`place.source === 'search'`). Typing a city (`CitySearch`) is only the fallback.
- **Event map:** opened from an event, the map shows only that event. Friends appear only while it's on. A meetup can be planned in advance and lasts until at least noon UTC the day after the event starts. Nearby events are searched for the event's own dates (`from`/`to`, up to 31 days).
- **Meetup flag:** a centered crosshair pin plus a `ResizeObserver` that calls `invalidateSize`. That is what fixed the flag jumping when saved. Don't take either out.

## Working with this user

- They want whole features built and the reasoning explained, with no TODOs left for them.
- Git: when asked, commit on a new branch. When asked, merge into `main` locally with a fast-forward and **don't push**. The user pushes and deletes the branch. After they push, watch CI in the background with `gh`, matching the full SHA, and report the result.
- Commit messages: one sentence on what the user gets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The user does these themselves: creating accounts, entering passwords, payments, Render dashboard and environment changes, and anything public.
- Ask before downloading files.
- Secrets live only in the git-ignored `server/.env`.
- **Don't log out of the local demo world in the browser.** The user created events there (Hike, Coachella, Stage Coach), and logging out loses them. Checking Login visually needs a separate browser profile or a fresh demo.
