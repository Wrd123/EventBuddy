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
