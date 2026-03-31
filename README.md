# LinkShort

A minimal URL shortener built with Node.js and PostgreSQL. Create short links, track clicks, and view analytics in a dashboard.

## Features

- Create short links with optional custom slug
- Click tracking with referrer, user-agent, and bot detection
- Dashboard: overview stats, clicks per day, top links, referrer breakdown
- JWT authentication (register/login)
- Rate limiting per IP, security headers, input validation

## Installation

```bash
# 1. Clone & install
git clone https://github.com/KosMaster87/link-shortener.git && cd link-shortener
npm install

# 2. Create PostgreSQL database
createdb linkshort

# 3. Apply schema
psql linkshort < src/db/schema.sql
psql linkshort < src/db/migrations/002_add_users.sql

# 4. Configure environment
cp .env.example .env
# Generate a JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output as JWT_SECRET in .env

# 5. Start
npm start
```

Server runs on `http://localhost:3000`.

## Configuration

Copy `.env.example` to `.env`:

```env
JWT_SECRET=replace-with-a-long-random-string
PGDATABASE=linkshort        # PostgreSQL database name
# PORT=3000                 # optional, default 3000
# NODE_ENV=development      # production suppresses stack traces
```

PostgreSQL connects via Unix socket (`/var/run/postgresql`). Override host, port, and user via standard `PGHOST`, `PGPORT`, `PGUSER` env vars.

## Testing

```bash
npm test
```

Requires a running PostgreSQL instance with the `linkshort` database.

## API

### Auth

| Method | Path               | Body                  | Response          |
| ------ | ------------------ | --------------------- | ----------------- |
| POST   | /api/auth/register | `{ email, password }` | `{ token, user }` |
| POST   | /api/auth/login    | `{ email, password }` | `{ token, user }` |

### Links

All write operations require `Authorization: Bearer <token>`.

| Method | Path                    | Body / Params    | Response       |
| ------ | ----------------------- | ---------------- | -------------- |
| GET    | /api/links              | —                | Array of links |
| POST   | /api/links              | `{ url, slug? }` | Created link   |
| PUT    | /api/links/:code        | `{ url }`        | Updated link   |
| PATCH  | /api/links/:code/toggle | —                | Toggled link   |
| DELETE | /api/links/:code        | —                | 204 No Content |
| GET    | /:code                  | —                | 302 Redirect   |

### Dashboard

| Method | Path                          | Query Params  |
| ------ | ----------------------------- | ------------- |
| GET    | /api/dashboard/overview       | —             |
| GET    | /api/dashboard/top-links      | limit (1–100) |
| GET    | /api/dashboard/clicks-per-day | days (1–365)  |
| GET    | /api/dashboard/referrer/:code | —             |

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
| Day 14 | Documentation                           | Done   |

## Developer

Konstantin Aksenov
GitHub: https://github.com/KosMaster87
Email: Konstantin.Aksenov@dev2k.org
