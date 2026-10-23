# EventBuddy: All-In-One Activity Organizer

EventBuddy is a versatile web application designed to help users discover, manage, and track events across music, sports, and outdoor activities. Built with modern web technologies, this project highlights full-stack development skills and attention to user experience.

## Quick Start

You need **Node.js 22** (`node -v`). With [nvm](https://github.com/nvm-sh/nvm), run `nvm use` in the project folder.

```bash
git clone https://github.com/Wrd123/EventBuddy.git
cd EventBuddy
npm install
npm --prefix server install
npm run dev
```

`npm run dev` starts the web app on http://localhost:3000 and the API on http://localhost:4000. Open the web app and log in with the demo account:

- Email: `user@example.com`
- Password: `password`

With no database configured, the API uses a temporary in-memory MongoDB that is loaded with demo events and reset on every restart.

## Connecting MongoDB Atlas

To keep data between restarts, use a free MongoDB Atlas cluster:

1. Create a free cluster at https://www.mongodb.com/cloud/atlas.
2. Under **Database Access**, add a database user with a password.
3. Under **Network Access**, allow your current IP address.
4. Choose **Connect > Drivers** on the cluster and copy the connection string.
5. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` to that string, with your password filled in and `/eventbuddy` as the database name. Also set `JWT_SECRET` (the file shows how to generate one).
6. Run `npm --prefix server run seed` once to add the demo account and events.

`server/.env` is git-ignored. Never commit it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app and API together |
| `npm start` | Web app only (expects the API on port 4000) |
| `npm run server` | API only, restarting on changes |
| `npm test` | Web app tests |
| `npm run test:server` | API tests (uses an in-memory MongoDB) |
| `npm run build` | Production build of the web app |

## Features

- Create events, single or multi-day, with friends invited
- Upcoming and past events, with a day-by-day schedule
- Accounts with secure login (hashed passwords, expiring tokens)
- Group chat, expenses and a map (preview, not yet connected to the API)
- Discover music, sports, and outdoor events (preview data)

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, React Router, Tailwind CSS |
| Backend | Node.js, Express, MongoDB (Mongoose), JWT authentication |
| Testing | Jest and Testing Library (web), Node test runner and Supertest (API) |
| Tools | Git, npm, GitHub Actions CI |

## Project Structure

```
EventBuddy/
├── src/                  # React web app
│   ├── components/       # Screens, layout and shared components
│   ├── context/          # App-wide auth and event state
│   ├── hooks/            # Reusable hooks (location, event loading)
│   ├── services/         # API calls (auth, events)
│   └── utils/            # Date helpers
├── server/               # Express API
│   ├── src/
│   │   ├── models/       # MongoDB models (User, Event)
│   │   ├── routes/       # /api/auth and /api/events
│   │   ├── middleware/   # Login checks and error handling
│   │   └── seed/         # Demo account and events
│   └── tests/            # API tests
├── public/               # Static assets
└── .github/workflows/    # CI
```

## Purpose & Value

This project was created to hone practical web development skills including building responsive interfaces, organizing component-based UIs, and designing for diverse event categories. It demonstrates your ability to craft intuitive, user-focused solutions with real world application potential.
