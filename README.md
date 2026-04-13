# LinkShort

A minimal URL shortener built with Node.js and PostgreSQL. Create short links, track clicks, and view analytics in a dashboard.

**Live:** https://link-shortener.dev2k.org

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
- Feedback widget on all pages (no auth required), with email notification via Resend

## Planned

- Redis caching for redirect endpoints (Cache-Aside pattern, TTL-based, fallback to DB)

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
psql linkshort < src/db/migrations/004_add_feedback.sql

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

# Option A (production)
# DATABASE_URL=postgresql://user:pass@host:5432/linkshort
# USE_DATABASE_URL=true

# Option B (local/alternative)
PGHOST=/var/run/postgresql
PGPORT=5432
PGDATABASE=linkshort
PGUSER=your-local-pg-user
PGPASSWORD=
USE_DATABASE_URL=false

# Required
JWT_SECRET=replace-with-a-long-random-string
SESSION_EXPIRY=86400

# Email notifications (optional — skip to disable)
RESEND_API_KEY=
FROM_EMAIL=
TO_EMAIL=

# Optional
ANTHROPIC_API_KEY=sk-ant-...
LOG_LEVEL=info
RATE_LIMIT_MAX=100
```

### Lokale Entwicklung vs. Production DB

`DATABASE_URL` wird **nur genutzt wenn `USE_DATABASE_URL=true`** gesetzt ist.
Lokal greift standardmäßig die Unix-Socket-Konfiguration über die `PG*`-Variablen.

| Umgebung | USE_DATABASE_URL | Genutzte Verbindung                                          |
| -------- | ---------------- | ------------------------------------------------------------ |
| Lokal    | `false`          | `PGHOST`, `PGUSER`, `PGDATABASE` (Unix-Socket)               |
| CI       | `false`          | `PGHOST`, `PGUSER`, `PGDATABASE` (TCP, aus Workflow-Secrets) |
| Render   | `true`           | `DATABASE_URL` (Render PostgreSQL / Managed PostgreSQL)      |

> **Hinweis:** Ist `DATABASE_URL` gesetzt und `USE_DATABASE_URL=false`, erscheint eine Warnung im Server-Log. Das ist kein Fehler — der Server nutzt trotzdem die lokale DB.

**Neon lokal testen** (bewusst, nicht Standard):

```bash
USE_DATABASE_URL=true npm start
```

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

### Feedback

| Method | Path          | Body                            | Auth |
| ------ | ------------- | ------------------------------- | ---- |
| POST   | /api/feedback | `{ type, description, email? }` | none |

`type`: `bug` \| `improvement` \| `other`. Returns `201 { message }` on success.

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
│   │   ├── dashboard.js
│   │   └── feedback.js
│   ├── services/
│   │   ├── auth-service.js
│   │   ├── link-service.js
│   │   ├── analytics-service.js
│   │   ├── dashboard-service.js
│   │   └── email-service.js
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
│   ├── style.css
│   └── feedback-widget.js
├── tests/
│   ├── analytics-devices.test.js
│   ├── analytics-period.test.js
│   ├── analytics-referrers.test.js
│   ├── link-service.test.js
│   ├── analytics-service.test.js
│   ├── auth-service.test.js
│   ├── dashboard-auth.test.js
│   ├── e2e-redirect.test.js
│   ├── feedback.test.js
│   └── email-service.test.js
├── .env.example
├── package.json
└── README.md
```

## Automation

- `scripts/batch-describe.js` generates missing URL descriptions for rows where `description IS NULL`
- `.github/workflows/pr-review.yml` runs an automated Claude-based PR review for internal pull requests
- `scripts/pr-review.js` builds the review comment and updates the existing bot comment instead of posting duplicates

## Developer

Konstantin Aksenov
GitHub: https://github.com/KosMaster87
Email: Konstantin.Aksenov@dev2k.org
Portfolio: https://portfolio.dev2k.org
