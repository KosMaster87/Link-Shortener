# LinkShort

KI Coding Mastery course project (Tag 13 state).

LinkShort is a URL shortener with analytics, dashboard reporting, authentication, and ownership-based access control.

## Features

- Create short links from long URLs
- Redirect via short code (`GET /:code`)
- Track clicks (referrer, user agent, bot filtering)
- Analytics endpoints and dashboard metrics
- Authentication with JWT (`register` and `login`)
- Ownership protection for write operations
- Rate limiting and security headers

## Tech Stack

| Layer    | Technology                  |
| -------- | --------------------------- |
| Runtime  | Node.js (ESM)               |
| API      | Native `node:http`          |
| Database | PostgreSQL (`pg`, raw SQL)  |
| Frontend | HTML/CSS/Vanilla JavaScript |
| Tests    | `node:test` + `node:assert` |

## Project Structure

```text
link-shortener/
├── server.js
├── src/
│   ├── db/
│   │   ├── index.js
│   │   ├── schema.sql
│   │   └── migrations/
│   │       └── 002_add_users.sql
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── links.js
│   │   ├── redirect.js
│   │   ├── analytics.js
│   │   └── dashboard.js
│   ├── services/
│   │   ├── auth-service.js
│   │   ├── link-service.js
│   │   ├── analytics-service.js
│   │   └── dashboard-service.js
│   └── utils/
│       ├── jwt.js
│       ├── rate-limit.js
│       └── result.js
├── public/
│   ├── index.html
│   ├── login.html
│   ├── dashboard.html
│   ├── app.js
│   └── style.css
├── tests/
│   ├── link-service.test.js
│   ├── analytics-service.test.js
│   └── e2e-redirect.test.js
├── .env.example
├── package.json
└── README.md
```

## API Access Rules

- Public:
  - `GET /:code`
  - `GET /api/links/:code/clicks`
- Protected (login required):
  - `POST /api/links`
  - `PUT /api/links/:code`
  - `PATCH /api/links/:code/toggle`
  - `DELETE /api/links/:code`
- Ownership rule:
  - User A can only modify links owned by User A.
  - User B receives `403 FORBIDDEN` for links owned by User A.

## Security Notes

- Password hashing: async `crypto.scrypt` (`salt:hash` format)
- JWT signing: HMAC-SHA256 via `node:crypto`
- Token TTL: 24 hours
- Login errors are generic (`INVALID_CREDENTIALS`) to avoid user enumeration
- Rate limits:
  - `general`: 100/min
  - `createLink`: 10/min
  - `login`: 5/min
- Body size limit (`413`) and security headers enabled

## Quick Start

Requirements:

- Node.js 20+
- PostgreSQL

Setup:

```bash
npm install
cp .env.example .env
```

Edit `.env` and set at least:

```env
JWT_SECRET=replace-with-a-long-random-string
```

Start the server:

```bash
npm start
```

Run tests:

```bash
npm test
```

The npm scripts load `.env` automatically via `node --env-file-if-exists=.env`.

## Course Progress

| Day    | Topic                                   | Status |
| ------ | --------------------------------------- | ------ |
| Day 0  | Setup and project definition            | Done   |
| Day 1  | CLAUDE.md and project configuration     | Done   |
| Day 2  | Architecture, database, server skeleton | Done   |
| Day 3  | URL shortening feature                  | Done   |
| Day 4  | Iteration and refactoring               | Done   |
| Day 5  | TDD analytics service                   | Done   |
| Day 6  | Commands and reusable workflows         | Done   |
| Day 7  | Integration, E2E, frontend polish       | Done   |
| Day 8  | Context and token awareness             | Done   |
| Day 9  | MCP server with direct database access  | Done   |
| Day 10 | Analytics dashboard via MCP             | Done   |
| Day 11 | Error handling and edge cases           | Done   |
| Day 12 | Performance and optimization            | Done   |
| Day 13 | Security review and authentication      | Done   |

## Developer

Konstantin Aksenov
GitHub: https://github.com/KosMaster87
Email: Konstantin.Aksenov@dev2k.org
