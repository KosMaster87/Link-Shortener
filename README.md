# LinkShort

A minimal URL shortener built with Node.js and PostgreSQL. Create short links, track clicks, and view analytics in a dashboard.

## Features

- Create short links with optional custom slug
- AI-generated short descriptions for stored URLs
- Click tracking with referrer, user-agent, and bot detection
- Analytics API per link: period timeline, referrers, and device distribution
- Dashboard: overview stats, clicks per day, top links, referrer breakdown (auth required)
- JWT authentication (register/login)
- Rate limiting per IP, security headers, input validation
- Batch automation for missing descriptions
- Automated PR review via GitHub Actions + Claude API

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
psql linkshort < src/db/migrations/003_add_description.sql

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
PORT=3000
NODE_ENV=development

# Option A (recommended in production)
# DATABASE_URL=postgresql://user:pass@host:5432/linkshort

# Option B (local/alternative)
PGHOST=/var/run/postgresql
PGPORT=5432
PGDATABASE=linkshort
PGUSER=dev2k
PGPASSWORD=

# Required
JWT_SECRET=replace-with-a-long-random-string
SESSION_EXPIRY=86400

# Optional
ANTHROPIC_API_KEY=sk-ant-...
LOG_LEVEL=info
RATE_LIMIT_MAX=100
```

In production, `DATABASE_URL` is preferred (for managed PostgreSQL like Neon/Supabase). Locally, the PG\* variables work out of the box.

`ANTHROPIC_API_KEY` is required for `scripts/batch-describe.js` and the automated PR review workflow.

## Testing

```bash
npm test
```

Requires a running PostgreSQL instance with the `linkshort` database.

## API

### Health

| Method | Path    | Response                                           |
| ------ | ------- | -------------------------------------------------- |
| GET    | /health | `200 { status: "ok", ... }` or `503` on DB failure |

### Auth

| Method | Path               | Body                  | Response          |
| ------ | ------------------ | --------------------- | ----------------- |
| POST   | /api/auth/register | `{ email, password }` | `{ token, user }` |
| POST   | /api/auth/login    | `{ email, password }` | `{ token, user }` |

### Links

All write operations require `Authorization: Bearer <token>`.

| Method | Path                    | Body / Params    | Response                          |
| ------ | ----------------------- | ---------------- | --------------------------------- |
| GET    | /api/links              | —                | Array of links with `description` |
| POST   | /api/links              | `{ url, slug? }` | Created link                      |
| PUT    | /api/links/:code        | `{ url }`        | Updated link                      |
| PATCH  | /api/links/:code/toggle | —                | Toggled link                      |
| DELETE | /api/links/:code        | —                | 204 No Content                    |
| GET    | /:code                  | —                | 302 Redirect                      |

Each link object includes `code`, `originalUrl`, `description`, `createdAt`, `isActive`, and `userId`.

### Dashboard

All dashboard endpoints require `Authorization: Bearer <token>`.

| Method | Path                          | Query Params  |
| ------ | ----------------------------- | ------------- |
| GET    | /api/dashboard/overview       | —             |
| GET    | /api/dashboard/top-links      | limit (1–100) |
| GET    | /api/dashboard/clicks-per-day | days (1–365)  |
| GET    | /api/dashboard/referrer/:code | —             |

### Analytics

| Method | Path                           | Query Params              |
| ------ | ------------------------------ | ------------------------- |
| GET    | /api/links/:code/clicks        | —                         |
| GET    | /api/links/:code/clicks/period | period (day\|week\|month) |
| GET    | /api/links/:code/referrers     | —                         |
| GET    | /api/links/:code/devices       | —                         |

## Project Structure

```text
link-shortener/
├── server.js
├── render.yaml
├── scripts/
│   ├── batch-describe.js
│   └── pr-review.js
├── .claude/
│   └── commands/
│       └── deploy-check.md
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── pr-review.yml
├── src/
│   ├── config.js
│   ├── db/
│   │   ├── index.js
│   │   ├── schema.sql
│   │   └── migrations/
│   │       ├── 002_add_users.sql
│   │       └── 003_add_description.sql
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
│       ├── device-classifier.js
│       ├── jwt.js
│       ├── rate-limit.js
│       ├── result.js
│       └── validators.js
├── public/
│   ├── index.html
│   ├── login.html
│   ├── dashboard.html
│   ├── app.js
│   └── style.css
├── tests/
│   ├── analytics-devices.test.js
│   ├── analytics-period.test.js
│   ├── analytics-referrers.test.js
│   ├── link-service.test.js
│   ├── analytics-service.test.js
│   ├── dashboard-auth.test.js
│   └── e2e-redirect.test.js
├── .env.example
├── package.json
└── README.md
```

## Automation

- `scripts/batch-describe.js` generates missing URL descriptions for rows where `description IS NULL`
- `.github/workflows/pr-review.yml` runs an automated Claude-based PR review for internal pull requests
- `scripts/pr-review.js` builds the review comment and updates the existing bot comment instead of posting duplicates

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
| Day 15 | Hooks and automatic quality             | Done   |
| Day 16 | Agents and delegated workflows          | Done   |
| Day 17 | CI/CD pipeline and quality gate         | Done   |
| Day 18 | Advanced analytics API workflow         | Done   |
| Day 19 | API foundations and cost awareness      | Done   |
| Day 20 | Automation with batch descriptions      | Done   |
| Day 21 | Team-ready workflows and shared setup   | Done   |
| Day 22 | Deployment hardening and readiness      | Done   |

## Developer

Konstantin Aksenov
GitHub: https://github.com/KosMaster87
Email: Konstantin.Aksenov@dev2k.org
