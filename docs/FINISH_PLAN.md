# The showcase finish plan

Adopted 27 Oct 2026. Codex reviewed the whole app and proposed a long polish list. Claude checked it against the code and argued it down, Codex revised it, and the user took the revision with Claude's four edits (marked *edit* below). It replaces the old "4c, then 4d" order: finish the core journey before adding to it.

The scope stays the same: a $0 portfolio showcase for friends planning trips, with the browser and the iPhone app equally important. Demo data is disposable. Nothing here promises durable accounts or uptime.

## The work, in order

1. **Two correctness fixes.**
   - **Expense creates are safe to retry.** A `clientId` per new expense, like payments and messages, so a lost response and a retry save one expense. A reused id with a different expense is refused.
   - **Chat is marked read only up to what you've seen.** Today `useChat` marks the newest message read even while you're scrolled up. Test arriving while scrolled up, jumping to the latest, and coming back from the background.
2. **One demo and copy pass.**
   - Say near **Try the demo** that it's a private, temporary sample. *Edit:* say that EventBuddy never moves money; it only records what you mark paid. The payment apps it opens do move real money.
   - Give the picnic, the event that's on today, a small schedule and ledger that fit its chat and map.
   - Replace the startup bar that fills by elapsed time (capped at 95%) with an honest waiting state and a way out of a long wait.
   - Fix the settle-up claim. `settleUp` is greedy and isn't always the fewest payments (owed $6/$4, owing $4/$3/$3 gives 4 payments where 3 would do), so the README and the comment should say "a short list of payments". Don't build a minimum solver.
   - Take the "Add a Ticketmaster API key" setup sentence (`server/src/discover/ticketmaster.js`) out of what visitors see.
   - *Edit:* times and currency get one README line ("times are local to the event; US dollars only") and tests only where a real bug turns up. No general time-zone work.
3. **4c, the activity feed, in its compact form.** Done 28 Oct (`fc591c4a`).
   - On EventDetails, one or two lines plus **See all**, which opens the shared `Sheet`. It doesn't compete with the four actions.
   - Actors come from the server, and everything renders as text.
   - No coordinates and no meetup note in the history.
   - Removed members get 404.
   - *Edit:* `record` is awaited before the response, so the `event` poke that follows always finds the new line, and a failed record never fails the write. ~~No timeout.~~ Reversed on 28 Oct after Codex's review of the 4c plan: the wait is bounded at 2 s, because expense and payment routes record inside the per-event ledger lock. A line that lands later pokes `event` itself.
   - *Edit:* if a fresh newest page doesn't overlap the pages already loaded (more than a page arrived while away), it replaces the list instead of leaving a gap.
   - If this grows much beyond that, defer it rather than lower the bar.
4. **4d, scripted demo friends.** Built 28 Oct on `demo-friends` (see `docs/HANDOFF.md`).
   - Labelled as simulated, and only inside the visitor's own demo world.
   - A small fixed script through the normal routes and pokes.
   - Stops when the owner leaves, never runs twice after a reconnect, and never touches another world.
5. **The abuse backlog.**
   - A per-visitor budget for creating demo worlds. `req.ip` is right behind Render's proxies (F-1).
   - A budget for queued socket messages per socket.
   - Bounded local tests, one process.
6. **A small real-browser suite and the phone checks.**
   - **Playwright, against a real throwaway API:** two people, invite and join, chat, an expense retry after a lost response, a recorded payment, and socket loss falling back to polling if it stays small.
   - **The iOS Simulator pass:** the socket's real Origin, keyboard and sheets, navigation, invites, reconnecting.
   - **A short physical-iPhone check of location sharing:** start, lock, update, stop or expire, and permission denied. The user does this. If it doesn't happen, the README qualifies the background-location claim.
   - **A quick accessibility check:** keyboard, VoiceOver and enlarged text. Not a certification.
7. **Rehearse and package.**
   - Check both Render services after deploying.
   - Run every suite.
   - Walk the same journey in the browser and on the iPhone.
   - Update the screenshots, the limitations and a short demo video.

## When it's finished

All of the above passes, and:
- no known critical or high security issue or core-flow bug is open;
- what the README claims for the browser and iPhone matches the evidence;
- the temporary-data limits are clear.

Lower-priority bugs get written down instead of growing the release.

## Not in this release

- **Phase 5 work:** Vite and the MapLibre upgrade, TypeScript, broader browser tests, Lighthouse and accessibility scores, performance work, and native storage and build hardening.
- **Real-user launch work:** durable data and backups, account recovery and deletion, real time-zone and currency support, the App Store, battery and privacy validation, and more than one server.
- **Day-of mode (Phase 6),** after this release.
