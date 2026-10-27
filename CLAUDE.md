# EventBuddy

Phone app for planning group events: schedule, group chat, split costs, live location map, and Discover (Ticketmaster). It's a portfolio showcase, so code quality and the README matter to reviewers. `README.md` has the full feature list, design decisions and project structure. Read it only when you need that background.

## Stack
- **App** (`src/`): React 18 (Create React App, plain JS, no TypeScript), React Router 6, Tailwind, Leaflet. Capacitor 7 wraps it as the iPhone app (`ios/`).
- **API** (`server/`): Node 22, Express 5, Mongoose 9, JWT auth, CommonJS (`require`). With no `MONGODB_URI` it runs in demo mode on an in-memory MongoDB seeded from `server/src/seed/demoData.js`.
- Hosted free on Render (`render.yaml`). The running budget is $0, so don't add paid services or anything that needs a real database.

## Commands
- `npm run dev`: app (:3000) and API (:4000) together. CRA proxies `/api` to :4000.
- `npm test -- --watchAll=false`: app tests (Jest + Testing Library).
- `npm run test:server`: API tests (`node --test`, Supertest, in-memory MongoDB).
- `npm run build`: production build. CI sets `CI=true`, so **lint warnings fail the build**.
- Run only the tests for the files you touched while iterating, e.g. `npm test -- --watchAll=false src/utils/ledger.test.js` or `cd server && node --test tests/expenses.test.js`.

## Where things go
- `src/components/screens/`: one file per route, with its test next to it.
- `src/components/common/`: shared UI, exported from `index.js`.
- `src/hooks/`: data hooks. `src/services/`: API calls (everything goes through `apiRequest` in `services/api.js`).
- `src/utils/`: pure logic (money, ledger, dates, chat, map), each with a unit test.
- `src/testUtils/fakeApi.js`: the fake API that screen tests use.
- `server/src/routes/`: one router per resource. Access checks go through `eventAccess.js`, input checks through `validation.js`, and errors are thrown as `HttpError` from `errors.js`.

## Conventions
- **Phone only.** Design for about 390px wide. No desktop or tablet layouts. (`ShowcaseFrame` only frames the phone view on a laptop.)
- **Theme tokens, not raw colors:** `bg-night`, `bg-surface`, `bg-raised`, `text-fg`, `text-muted`, `text-faint`, `border-line`, `accent`, `go` (see `tailwind.config.js`). Text on an accent fill is `text-night`, not white.
- **Money is integer cents** (`amountCents`) everywhere. Format it only at the edge, with `utils/money.js`.
- Comments explain *why* in plain sentences, like the existing files. User-facing error messages are short and friendly.
- Any change that touches behavior needs tests, and both test suites must pass before you commit.
- Commit messages: a short sentence describing what the user gets, e.g. "Keep the meetup flag where it was set".

## Working style
- The user wants whole features implemented, not TODOs left for them.
- For a big feature: plan it in plan mode (Opus), build it (Sonnet), then ask the `reviewer` subagent to check the diff before committing.

## Autonomous development boundaries
These rules guide behavior. `.claude/settings.json` (permissions and the sandbox) is what enforces them.

Go ahead without asking: edit project files, run local tests and builds, install dependencies the manifests declare into the project, and make local commits on task branches.

Never:
- Use `sudo`, `su`, `doas`, or ask for administrator rights.
- Format disks or change the operating system's security protections.
- Read, print, upload or commit credentials or production secrets.
- Get around a restriction with another language, tool or subprocess.
- Change permission rules, sandbox settings or these boundaries without the user's approval.

Ask the user first before you:
- Delete directories recursively or throw away uncommitted work.
- Rewrite git history, force-push, push, publish, deploy or merge a PR.
- Install global software or change files outside the project and the session's temp directories.
- Change ownership, broad file permissions, shell profiles, launch agents or system settings.
- Reset a database, delete persistent data or Docker volumes, or run a destructive migration.
- Stop or restart a running service, or edit files it watches, when that could erase in-memory data. For EventBuddy, editing anything in `server/` restarts the dev API (`node --watch`) and wipes the local demo world.

Before a destructive action, name the exact target and how to recover it. Run experiments against throwaway test databases in a separate checkout.

## Explain permission requests in plain English
Keep routine work that is already authorized moving without asking again.

Before asking to do a restricted action, explain:
1. What you want to do, in everyday language.
2. Why the task needs it.
3. Exactly which project, files, service, account or data it affects.
4. Whether it could delete work, expose information, publish something, spend money or interrupt a running app.
5. Whether it can be undone, and what recovering would involve.
6. A safer alternative, when there is a practical one.

Keep it short and specific. Put any technical commands after the plain-English explanation, so the user can decide without having to read the command.

Use this format:

**Action:** What you want to do.
**Reason:** Why it helps.
**Impact:** What changes, and what could be lost or exposed.
**Recovery:** How to undo it, or a clear statement that it can't be undone.
**Alternative:** A safer option, if there is one.
**Permission:** One clear question that names the action and its target.

For example:

**Action:** Restart EventBuddy's local backend, the program that saves and loads your events.
**Reason:** It needs to load the updated server code.
**Impact:** This server keeps the demo data in memory only, so restarting it erases the events you added this session.
**Recovery:** Those events can't be brought back unless we save a copy first.
**Alternative:** Start a separate test server and leave your current one running.
**Permission:** May I restart your current EventBuddy backend, or should I use a separate test server?

Don't:
- Ask vague questions such as "Proceed?" or "Allow access?"
- Call an action safe without checking what it actually targets.
- Hide a destructive action inside "cleanup", "setup" or "fix permissions".
- Treat approval for one action as permission for unrelated later actions.
- Treat silence as approval.
- Change security settings, or get around a blocked command, to finish the task.

If a permission rule blocks an action, explain the restriction and offer an alternative that is allowed. A "yes" in the conversation doesn't authorize changing the permission rules themselves.
