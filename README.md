# LinkShort

[![CI](https://github.com/KosMaster87/Link-Shortener/actions/workflows/ci.yml/badge.svg)](https://github.com/KosMaster87/Link-Shortener/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-green)

**Live:** https://link-shortener.dev2k.org

## Was es macht

Ein URL-Shortener mit Analytics-Dashboard und Feedback-Widget.
Nutzer kürzen lange URLs, sehen Klick-Statistiken pro Link (letzte 7/30 Tage)
und können direkt im Interface Feedback senden.

**Tech-Stack:** Node.js (natives `node:http`) · PostgreSQL · Vanilla JS · Hosting: Render · CI/CD: GitHub Actions

## Entwicklungsansatz

- **Strukturierte KI-Prompts** mit Kontext und Constraints — Code bleibt konsistent mit dem gewählten Stack, kein Blind-Trust in generierte Ausgaben
- **TDD** (Tests vor der Implementierung) — Regressions in Production mehrfach verhindert, Coverage als Qualitätssignal nicht als Pflicht
- **Dependency Injection** für alle externen Services — vollständig ohne echten Netzwerkzugriff testbar

> KI-gestützt entwickelt mit Claude Code — mit Review-Mindset, nicht als Shortcut

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
# DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.eu-central-1.aws.neon.tech/linkshort?sslmode=require&channel_binding=require
# USE_DATABASE_URL=true

# Option B (local/alternative)
PGHOST=/var/run/postgresql
PGPORT=5432
PGDATABASE=linkshort
PGUSER=your-local-pg-user
PGPASSWORD=
USE_DATABASE_URL=false

# Required — generieren: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=
SESSION_EXPIRY=86400

# Email notifications (optional — skip to disable)
RESEND_API_KEY=
FROM_EMAIL=
TO_EMAIL=

# Optional — benötigt für scripts/batch-describe.js und PR-Review-Workflow
ANTHROPIC_API_KEY=
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
| Render   | `true`           | `DATABASE_URL` (Neon PostgreSQL, gepoolte URL mit `-pooler`) |

> **Hinweis:** Ist `DATABASE_URL` gesetzt und `USE_DATABASE_URL=false`, erscheint eine Warnung im Server-Log. Das ist kein Fehler — der Server nutzt trotzdem die lokale DB.

**Neon lokal testen** (bewusst, nicht Standard):

```bash
USE_DATABASE_URL=true npm start
```

### Render + Neon (Empfohlen)

- In Render `DATABASE_URL` als Secret setzen (Neon Connection String)
- In Render `USE_DATABASE_URL=true` setzen
- Für Pooling den `-pooler` Host von Neon nutzen
- Passwort bleibt identisch, nur der Hostname ändert sich

Für die vollständige Umstellung inkl. Datenmigration siehe `NEON_MIGRATION_RUNBOOK.md`.

### Incident Quickcheck (3 Min)

1. Beide Health-URLs prüfen: `/health` auf `onrender.com` und `dev2k.org` müssen `200` liefern.
2. Render-Logs prüfen: bei DB-Fehlern (`database removed`, `connection terminated`) sofort Incident notieren.
3. Render-Environment prüfen: `DATABASE_URL` gesetzt und `USE_DATABASE_URL=true`.
4. Neon prüfen: aktiver Endpoint/Branch, Compute startbar, Connection-String unverändert.
5. Nach Fix verifizieren: beide Monitore wieder grün, sonst Manual Redeploy auslösen.

One-liner (beide Health-Checks, mit PASS/FAIL + Exit-Code):

```bash
ok=1; for u in https://link-shortener-h40z.onrender.com/health https://link-shortener.dev2k.org/health; do c=$(curl -sS -o /tmp/health.out -w "%{http_code}" "$u") || c=000; printf "\n== %s ==\nHTTP %s\n" "$u" "$c"; cat /tmp/health.out; echo; [[ "$c" == "200" ]] || ok=0; done; [[ $ok -eq 1 ]] && echo "ALL HEALTH CHECKS PASS" || { echo "HEALTH CHECK FAILED"; exit 1; }
```

`ANTHROPIC_API_KEY` is required for `scripts/batch-describe.js` and the automated PR review workflow.

## Testing

```bash
npm test
```

`npm test` startet den lokalen Server bei Bedarf automatisch (Port 3000),
fuehrt die komplette Suite aus und beendet den Server danach wieder.

Falls du die Suite ohne diesen Helper direkt laufen lassen willst:

```bash
npm run test:raw
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
