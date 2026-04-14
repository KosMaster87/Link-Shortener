# CLAUDE.md

## Deployment

- **Plattform:** Render (render.yaml im Root)
- **Production-URL:** https://link-shortener-h40z.onrender.com
- **Health-Check:** https://link-shortener-h40z.onrender.com/health
- **Monitoring:** UptimeRobot (ausstehend)
- **DB:** Render PostgreSQL (Frankfurt) via DATABASE_URL + USE_DATABASE_URL=true
- **Schema:** manuell eingespielt via psql (schema.sql + migrations 002, 003)

## Projekt-Übersicht

**LinkShort** — URL-Shortener Mini-SaaS mit Klick-Analytics und Dashboard (lnk.sh/abc123).

## Tech-Stack

- **JS:** ES2024, ESM, Node.js 24 LTS, npm
- **Backend:** node:http, pg (Raw SQL)
- **Frontend:** Statisches HTML + CSS + Vanilla JS
- **Testing:** node:test + node:assert

## Commands

```bash
npm start            # Server starten (port 3000, lädt .env automatisch)
npm run preview      # Production-Modus lokal (NODE_ENV=production)
npm test             # Alle Tests (node:test, concurrency=1, echte DB)
npm run lint         # ESLint über gesamtes Projekt
```

Einzelne Test-Suites:

```bash
node --env-file-if-exists=.env --test tests/link-service.test.js
node --env-file-if-exists=.env --test tests/analytics-service.test.js
```

Scripts (benötigen `.env` mit `ANTHROPIC_API_KEY`):

```bash
node --env-file-if-exists=.env bin/describe-url.js <url>
node --env-file-if-exists=.env scripts/batch-describe.js
```

## Projektstruktur

```
server.js                    HTTP-Server, Routing, Security-Headers, Rate-Limit-Guard
src/
  config.js                  Alle Env-Variablen zentral — nie process.env direkt lesen
  db/
    index.js                 pg Pool (nutzt config.database.*)
    schema.sql               Basis-Schema: short_links, link_clicks
    migrations/
      002_add_users.sql      users-Tabelle + user_id FK auf short_links
      003_add_description.sql
      004_add_feedback.sql
  middleware/
    auth.js                  requireAuth (401 bei fehlendem Token) / optionalAuth
  routes/                    Nur HTTP — kein Business Logic, kein direkter DB-Zugriff
    links.js                 CRUD für Short-Links (GET/POST/PUT/DELETE/PATCH)
    redirect.js              /:code → 302 + fire-and-forget Click-Tracking
    analytics.js             /api/links/:code/clicks|referrers|devices|period
    auth.js                  POST /api/auth/register|login → JWT
    dashboard.js             GET /api/dashboard/* (Auth required)
    feedback.js              POST /api/feedback (Ausnahme: macht DB direkt — Tech Debt)
  services/                  Business Logic — kein HTTP, keine req/res
    link-service.js          createLink, getLink, getAllLinks, deleteLink, updateLink, toggleActive
    analytics-service.js     trackClick, getStats, getClicksByPeriod, getReferrers, getDeviceStats
    dashboard-service.js     getOverviewStats, getTopLinks, getClicksPerDay, getReferrerBreakdown
    auth-service.js          register, login (scrypt, timing-safe)
    email-service.js         sendFeedbackNotification → Resend REST API (fetch, kein nodemailer)
  utils/
    result.js                ok(data) / err(input) — einziges erlaubtes Result-Pattern
    jwt.js                   createToken / verifyToken (HMAC-SHA256, node:crypto)
    rate-limit.js            Sliding Window In-Memory, Buckets: general/createLink/login
    validators.js            isValidUrl, validateAlias, validateLimit, validateDays, validatePeriod
    device-classifier.js     classifyDevice (WARNUNG: exportiert aber nie importiert — Dead Code)
public/                      Statisches Frontend (HTML/CSS/Vanilla JS), serviert via serveStatic
tests/                       Echte PostgreSQL-DB, kein Mocking
bin/                         CLI-Scripts (describe-url.js via Claude Haiku)
scripts/                     Batch-Jobs (batch-describe.js, pr-review.js)
```

## Datenbank

- PostgreSQL, DB: `linkshort`
- Unix-Socket `/var/run/postgresql` (peer-Auth, kein Passwort)
- DB-User: `dev2k` (Superuser)
- Starten: `npm start`

## Coding-Konventionen

- Dateien: kebab-case | Funktionen: camelCase | DB-Tabellen: snake_case
- ESM, Named Exports bevorzugen
- Routes kennen HTTP, Services kennen nur Business Logic
- Services kommunizieren nicht direkt — Routes koordinieren den Flow

## Function Rules

- Eine Aufgabe pro Funktion, max. 14 Zeilen
- Keine verschachtelten Funktionen — in separate auslagern
- Arrow Functions bevorzugen
- JSDoc: `@param` + `@returns` für alle exports, `@fileoverview` Header pro Datei
- Typedef-Kommentare im Service der sie verwendet
- Namen: 3–5 Wörter, camelCase
- Keine Magic Numbers — benannte Konstanten (`MAX_SLUG_ATTEMPTS = 3`)

## File Size Limits

- Funktionen: max. 14 Zeilen
- Services: max. 100 LOC
- Dateien: max. 400 LOC

## Error Handling

- `ok(data)` / `err(input)` aus `src/utils/result.js` — nie manuell `{ success: true/false }` bauen
- `err()` normalisiert defensiv zu `{ code, message? }`:
  - `err("NOT_FOUND")` → `{ code: "NOT_FOUND" }`
  - `err({ code: "INVALID_INPUT", message: "..." })` → unverändert
  - Objekte ohne `code` → `{ code: "UNEXPECTED", ...input }`
- Services geben strukturierte Fehler zurück: immer `{ code, message }` — nie rohe Strings
- Routes übersetzen via `ERROR_STATUS`-Map: `ERROR_STATUS[result.error.code] ?? 500`
- HTTP Status Mapping (vollständig):
  - `INVALID_URL` → 422 | `SLUG_TAKEN` → 409 | `NOT_FOUND` → 404
  - `INVALID_INPUT` → 400 | `DB_ERROR` → 500 | `UNEXPECTED` → 500
- Error Response Body: `{ error: result.error.code, message: result.error.message }`
- Error Messages mit Kontext: `"days must be 1–365. Received: -1"`

## Input Validation Rules (dashboard-service)

- `limit` (getTopLinks): Ganzzahl 1–100, sonst `INVALID_INPUT`
- `days` (getClicksPerDay): Ganzzahl 1–365, sonst `INVALID_INPUT`
- `code` (getReferrerBreakdown): Existenz-Check gegen `short_links`, sonst `NOT_FOUND`
- Validation findet im Service statt — Routes parsen nur (parseInt + Fallback auf Default)

## Code Patterns

- **Services:** Validierung am Anfang, frühe Returns. Muster: `src/services/link-service.js`
- **Routes:** Nur HTTP, kein Business Logic. Muster: `src/routes/links.js`
- **Analytics:** Fire-and-forget mit `.catch()` — Fehler loggen, nicht weitergeben
- **Request-Daten:** Referrer, User-Agent, IP in der Route extrahieren, als Parameter übergeben
- **Tests:** Echte PostgreSQL-DB (keine Mocks), `describe`/`it`, `createdCodes`-Cleanup in `afterEach`. Muster: `tests/link-service.test.js`

## Analytics Exploration Findings (Tag 18)

- Click-Tracking liegt in `link_clicks`: `id`, `code`, `clicked_at`, `referrer`, `user_agent`, `ip_hash`, `is_bot`
- Bestehende Aggregation pro Link liegt in `src/services/analytics-service.js` (`getStats`, `queryTotalClicks`, `queryClicksByDay`, `queryReferrers`, `queryUniqueVisitors`)
- Device-Stats implementiert via SQL CTE + CASE/WHEN in `queryDeviceStats` — kein In-Memory-Scan
- Für neue Analytics-Features bestehende Queries erweitern statt parallel neue Logik aufzubauen
- Dashboard-Routes sind mit `requireAuth` geschützt (`server.js` checkAuth-Guard)

## Dashboard-Queries - Bekannte Risiken

| Risiko                                                                                               | Kategorie              | Lösung                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Kein Index auf `link_clicks.code` und `link_clicks.clicked_at`                                       | Performance            | `CREATE INDEX idx_link_clicks_code ON link_clicks(code);` + `CREATE INDEX idx_link_clicks_time ON link_clicks(clicked_at);` |
| `clicked_at` ist TIMESTAMPTZ (UTC) — `DATE_TRUNC` ohne `AT TIME ZONE` liefert UTC-Tage, nicht lokale | Zeitzone               | Immer explizit `AT TIME ZONE 'UTC'` oder `AT TIME ZONE 'Europe/Berlin'` für deutsche User                                   |
| `is_bot = FALSE` ist DEFAULT — alle Testklicks sind `false`, auch ohne UA-Check                      | Edge Case: Bots        | Alle Dashboard-Queries explizit filtern: `AND is_bot = FALSE`                                                               |
| `link_clicks.code` ist nullable — stille Datenlücken möglich                                         | Edge Case: Null values | `WHERE code IS NOT NULL` in Aggregations-Queries                                                                            |
| Nur 4 Testklicks, 36 Sekunden, 1 IP — keine echten Verteilungen sichtbar                             | Datenbasis             | Seed-Script mit realistischen Testdaten vor Dashboard-Implementation erforderlich                                           |

## Performance Patterns

### getTopLinks: Vollaggregation — Index hilft nicht, Materialized View bei Wachstum

`getTopLinks` aggregiert alle `link_clicks` für alle Codes gleichzeitig (`GROUP BY sl.code`).
PostgreSQL wählt korrekt **Hash Right Join + Seq Scan** — ein Index auf `link_clicks.code`
ändert den Plan nicht, weil alle Rows ohnehin gelesen werden müssen.

- Skalierungsgrenze: ~100K Klicks → >500ms Dashboard-Ladezeit (linear)
- Lösung bei Wachstum: `MATERIALIZED VIEW top_links_mv` mit `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- `idx_link_clicks_code` existiert und ist sinnvoll — aber für `getTopLinks` wirkungslos.
  Er nutzt `getReferrerBreakdown` (Point-Lookup), nicht Vollaggregationen.

### DATE-Typ aus pg-Treiber: immer TO_CHAR verwenden

Der pg-Treiber wandelt PostgreSQL `DATE`-Typ in JavaScript `Date`-Objekte um.
`JSON.stringify` erzeugt dann ISO-Timestamps (`"2026-03-29T04:00:00.000Z"`) statt `"YYYY-MM-DD"`.
Je nach Server-Timezone kann das Datum um ±1 Tag versetzt sein.

**Regel:** Datumswerte immer als String zurückgeben:

```sql
TO_CHAR(DATE_TRUNC('day', clicked_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day
```

Nie `::date` casten — der JS-Treiber bricht das Format auf.

### idx_link_clicks_code: wirkt bei Point-Lookups, nicht bei Vollaggregation

| Query                                         | Index genutzt?         | Warum                                   |
| --------------------------------------------- | ---------------------- | --------------------------------------- |
| `getReferrerBreakdown` (`WHERE code = $1`)    | Ja — Bitmap Index Scan | Hochselektiv: 1 Code ≈ 350 von 50K Rows |
| `getTopLinks` (`LEFT JOIN ... GROUP BY code`) | Nein — Hash Right Join | Vollaggregation: alle Rows nötig        |

### getOverviewStats: avg_clicks_per_link im Service berechnen

`avg_clicks_per_link` nicht per SQL-Subquery berechnen — das erzeugt einen redundanten zweiten
Full Scan auf `link_clicks`. Stattdessen nach dem Query im Service:

```js
const avg_clicks_per_link =
  total_links === 0 ? 0 : parseFloat((total_clicks / total_links).toFixed(2));
```

Spart bei 100K Klicks einen kompletten Table Scan pro Dashboard-Aufruf.

## Security Patterns (Tag 13)

### Authentication

- Auth-Routen: `POST /api/auth/register` und `POST /api/auth/login`
- Passwort-Hashing: `node:crypto` `scrypt` (async), Format `salt:hash`
- Token: JWT per HMAC-SHA256, Secret aus `JWT_SECRET`
- Token-TTL für das MVP: 24 Stunden, kein Refresh-Token
- Login-Fehler immer generisch: `Ungültige Anmeldedaten.`
- Kein Leak, ob die E-Mail existiert oder nur das Passwort falsch ist (User-Enumeration vermeiden)

### Authorization

- Schreib-Operationen nur mit Auth: `POST/PUT/PATCH/DELETE /api/links*`
- `401` bei fehlender/ungültiger Authentifizierung
- Ownership-Check vor Änderung/Löschung: `link.userId === req.user.id`
- `403` bei fremden Ressourcen (`FORBIDDEN`)

### Input Validation

- URLs nur mit `http:` oder `https:`
- Gefährliche/interne Ziele blocken: `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`
- Alias-Limit aktiv (`ALIAS_MAX_LENGTH`), reservierte Slugs blockieren
- Validierung früh im Service, vor DB-Zugriff

### SQL-Queries

- Ausschließlich parameterisierte Queries (`$1`, `$2`, ...)
- Keine SQL-String-Interpolation mit User-Input
- User-IDs als UUID (`gen_random_uuid()`)

### Rate Limiting

- In-Memory Sliding Window in `src/utils/rate-limit.js`
- Buckets:
  - `general`: `100/min`
  - `createLink`: `10/min`
  - `login`: `5/min`
- Bei Überschreitung: `429 RATE_LIMITED`

### Security Headers

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### Data Exposure

- Production-Fehlerantworten generisch (`INTERNAL_ERROR`)
- Stacktraces nur in Development-Logs
- Keine Tokens/Secrets/Passwörter in Logs oder Responses
- Frontend darf eigene Notifications rendern, soll aber bei Auth/Security nur generische UI-Texte verwenden
- Regel: `code` für UI-Flow/Verhalten, `message` nur direkt anzeigen wenn sie bereits bewusst sicher formuliert ist

### Environment Config

- Lokale Secrets liegen in `.env` im Projekt-Root und werden nicht committed
- Commitbare Vorlage ist `.env.example`
- npm-Skripte laden `.env` nativ via `node --env-file-if-exists=.env`

### Security Verification (DoD)

- Unauthentifizierte Schreibroute liefert `401`
- Fremder User auf fremden Link liefert `403`
- Oversized Body liefert `413`
- Rate-Limit liefert `429`
- Redirect- und Service-Tests grün (`npm run test`)

## Bekannte Bugs

### P0 — Inaktive Links werden weitergeleitet (nicht gefixed)

**Dateien:** `src/services/link-service.js:107`, `src/routes/redirect.js:42`

`getLink()` filtert nicht nach `is_active`. Ein via Toggle deaktivierter Link leitet weiterhin weiter.

```js
// link-service.js — fehlender Filter:
"SELECT * FROM short_links WHERE code = $1";
// korrekt wäre:
"SELECT * FROM short_links WHERE code = $1 AND is_active = TRUE";

// redirect.js — fehlender Guard nach getLink():
// if (!result.data.isActive) return send(res, 404, { error: "NOT_FOUND" });
```

**Auswirkung:** Das Toggle-Feature (PATCH `/api/links/:code/toggle`) hat keine Wirkung auf Redirects.
**Testlücke:** `tests/e2e-redirect.test.js` testet keinen inaktiven Link.

## Dead Code & Phantom Dependencies

### `nodemailer` — installiert, nie benutzt

`package.json` listet `nodemailer: ^8.0.5` als Production-Dependency.
`email-service.js` nutzt stattdessen native `fetch()` direkt gegen die Resend REST API.
Kein einziger Import von `nodemailer` in der Codebase.

```bash
npm uninstall nodemailer  # ~3 MB entfernen, unnötiger Security-Surface
```

### `classifyDevice` — exportiert, nie importiert

**Datei:** `src/utils/device-classifier.js:29`

`export const classifyDevice` wird nirgends importiert. `analytics-service.js` repliziert die
Patterns direkt in SQL (`TABLET_LIKE`/`MOBILE_LIKE` Arrays in `queryDeviceStats`). Beide
Implementierungen müssen manuell synchron gehalten werden — `analytics-service.js:291` warnt bereits
davor. Entweder die Funktion nutzen oder die Datei entfernen.

### Tote Config-Properties

**Datei:** `src/config.js`

| Property                    | Env-Variable     | Problem                                                                    |
| --------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `config.rateLimit.max`      | `RATE_LIMIT_MAX` | `rate-limit.js` hat hartcodierte `LIMITS` — Env-Variable hat keine Wirkung |
| `config.logging.level`      | `LOG_LEVEL`      | Kein Logger liest diesen Wert                                              |
| `config.auth.sessionExpiry` | `SESSION_EXPIRY` | `jwt.js` hardcodet `TOKEN_TTL_SEC = 86400` — Env-Variable wird ignoriert   |

Ops setzt diese Variablen ohne jede Wirkung. Entweder verdrahten oder aus Config + `.env.example` entfernen.

### `requireEnv` / `optionalEnv` — unnötig exportiert

**Datei:** `src/config.js:12,28`

Beide Funktionen werden nur intern in `config.js` verwendet. Kein externer Import in der gesamten
Codebase. Export entfernen oder als interne Helpers belassen.

## Fehlende Test-Coverage

| Modul                            | Priorität | Was fehlt                                                               |
| -------------------------------- | --------- | ----------------------------------------------------------------------- |
| `src/middleware/auth.js`         | Hoch      | `requireAuth` 401-Pfad, Token-Expiry, Manipulation des Payloads         |
| `src/utils/jwt.js`               | Hoch      | `verifyToken` mit abgelaufenem Token, falscher Signatur                 |
| `src/routes/redirect.js`         | Hoch      | Inaktiver Link → 404 (deckt P0-Bug ab)                                  |
| `src/utils/rate-limit.js`        | Mittel    | Sliding-Window-Korrektheit, Bucket-Isolation                            |
| `src/utils/validators.js`        | Mittel    | `validateAlias` mit reservierten Slugs, `isValidUrl` mit internen Hosts |
| `src/routes/links.js`            | Mittel    | HTTP-Layer: 405 METHOD_NOT_ALLOWED, 403 Ownership                       |
| `src/utils/device-classifier.js` | Niedrig   | Tablet-vor-Mobile-Priorität (Android-Tablet-Edge-Case)                  |
| `src/utils/result.js`            | Niedrig   | `err()` Normalisierung: String / `{code}` / `{kein code}`               |

## Inkonsistente Patterns

### `send()` — 6-fach identisch dupliziert

```js
// Identisch in: analytics.js:28, auth.js:24, dashboard.js:26,
//               feedback.js:21, links.js:31, redirect.js:18
const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
```

Kandidat für `src/utils/http.js` — aber erst extrahieren wenn ein vierter Kontext entsteht.

### `sendResult()` — nur in 2 von 6 Routes

`analytics.js` und `dashboard.js` haben `sendResult()` mit `INTERNAL_CODES`-Filterung
(DB-Fehler ohne `message` nach außen). `links.js` und `auth.js` bauen dasselbe inline —
und leiten `message` bei DB-Fehlern durch. Das ist ein Security-Unterschied, kein Style-Unterschied.

### `feedback.js` — bricht Projektkonventionen

Das einzige Modul das `pool` direkt im Route-Handler importiert und nutzt:

```
❌ Route importiert pool direkt (Konvention: nur Services dürfen DB nutzen)
❌ Roher pg-Fehlercode 42P01 statt err()-Pattern
❌ Kein ERROR_STATUS-Mapping
❌ Kein INTERNAL_CODES-Filter für message
```

Business-Logik und DB-Zugriff gehören in einen `feedback-service.js`.

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

Läuft bei:

- Push auf main
- Pull Requests auf main

Jobs:

- `lint` - ESLint Prüfung
- `test` - Test Suite

### Definition of Done

- Code formatiert (Claude Hooks)
- Linter zufrieden (Claude Hooks + Git Hooks)
- Tests laufen lokal (Git Hooks)
- Lint-Check grün (Stop Hook)
- Pipeline ist grün
- PR wurde reviewed

### Workflow für neue Features

1. Branch erstellen: `git checkout -b feature/name`
2. Entwickeln mit Claude Hooks (Auto-Format)
3. Commit mit Git Hooks (Pre-commit Checks)
4. Push und PR erstellen
5. Pipeline abwarten
6. Review einholen
7. Merge nach Approval

### Bei fehlgeschlagener Pipeline

- Check welcher Job fehlgeschlagen ist
- Logs in GitHub Actions ansehen
- Lokal reproduzieren und fixen
- Erneut pushen

## Automatische Qualitätschecks

### Was Claude automatisch ausführt (PostToolUse Hooks)

Nach jeder Dateiänderung durch Claude laufen folgende Checks automatisch:

| Check        | Tool               | Scope              |
| ------------ | ------------------ | ------------------ |
| Formatierung | `prettier --write` | geänderte Datei    |
| Linting      | `eslint --fix`     | geänderte Datei    |
| Tests        | `node --test`      | gesamte Test-Suite |

### Was vor jedem git commit läuft (lint-staged via Husky)

- `*.js` → `prettier --write` + `eslint --fix`
- Bei ESLint-Errors wird der Commit abgebrochen

### Was manuell bleibt

- Datenbankmigrationen
- `git push` / Deployment
- `npm run lint` für vollständigen Projekt-Lint außerhalb von Claude

### Konfiguration

- Team-Baseline (committed): `.claude/settings.json`
- Persönliche Overrides (nicht committed): `.claude/settings.local.json`
- Git Hooks: `.husky/pre-commit` + `lint-staged` in `package.json`
- ESLint: `eslint.config.js`

## Team Setup

### Shared Commands

Alle Custom Commands: @.claude/commands/INDEX.md

### Drei Ebenen der Claude-Konfiguration

- Projekt: `.claude/settings.json` (committed, gilt für alle)
- Lokal: `.claude/settings.local.json` (nicht committed, persönliche Präferenzen)
- User: `~/.claude/settings.json` (projektübergreifend, nicht im Repo)

Regel: Team-Standards immer auf Projektebene, persönliche Präferenzen nur lokal.

## Documentation Standards

### README

- Bei Feature-Änderungen aktualisieren
- Installation-Steps bei jedem Release testen (Copy-Paste-Test)
- API-Beispiele müssen funktionieren

### Code Comments

- Erkläre WARUM, nicht WAS
- Prefixes: `TODO`, `FIXME`, `HACK`, `NOTE`
- Keine auskommentierten Code-Blöcke

### JSDoc

- Alle public exports dokumentieren
- `@param` mit Typ und Beschreibung
- `@returns` spiegelt Result-Pattern wider: `{ success: true, data: T } | { success: false, error: { code: string, message: string } }`
- `@example` bei komplexen Methoden

### Was NICHT dokumentieren

- Offensichtlicher Code (getters, simple loops)
- Implementation Details die sich ändern können
- Private Hilfsfunktionen

## Agentic Workflows

### Wann Agents nutzen

- Multi-File Refactoring (mehr als 3 Dateien betroffen)
- Codebase-Exploration vor größeren Änderungen
- Parallele, unabhängige Änderungen über mehrere Services
- Pattern-Einführung über die gesamte Codebase

### Wann KEINE Agents

- Einzelne, einfache Änderungen (< 3 Dateien)
- Wenn jeder Schritt manuell reviewed werden soll
- Bei kritischen Änderungen (Security, Payment, Auth)

### Refactoring-Workflow

1. Explore-Agent: Aktuelle Situation verstehen, Abhängigkeiten finden
2. Plan erstellen und reviewen — erst bestätigen, dann ausführen
3. Branch anlegen (`git checkout -b refactor/...`) vor jeder Execution
4. Phasenweise implementieren — nach jeder Phase: `git diff`, Tests, Review
5. Merge erst wenn alle Tests grün

### Multi-File Änderungen

- Immer konkretes Vorher/Nachher-Beispiel mitgeben für Konsistenz
- Erst Dry-Run (`Zeig mir erst welche Dateien betroffen wären`), dann Execute
- Bei Unsicherheit: erst eine Datei, dann Rest nach Bestätigung

## Claude API – Konfiguration

### Einsatzbereich

- URL-Beschreibungen beim Kürzen: claude-haiku-4-5
- Code-Reviews (automatisiert): claude-sonnet-4-6-20250514
- Komplexe Analysen: claude-sonnet-4-6-20250514

### SDK

@anthropic-ai/sdk – installiert als Dependency

### Umgebungsvariablen

ANTHROPIC_API_KEY in .env (niemals committen)
Vorlage: .env.example im Repo

### Kostenstrategie

- Haiku für einfache, häufige Tasks (3× günstiger als Sonnet)
- max_tokens begrenzen (z. B. 100 für Kurzbeschreibungen)
- usage-Feld nach jedem Call loggen

### Script

bin/describe-url.js – URL-Beschreibungs-Generator
Usage: node --env-file-if-exists=.env bin/describe-url.js &lt;url&gt;

scripts/batch-describe.js – Batch-Beschreibungen für short_links ohne description
Usage: node --env-file-if-exists=.env scripts/batch-describe.js

scripts/pr-review.js – PR-Diff per Claude Sonnet reviewen
Input: pr_diff.txt
Output: review_output.md (mit `<!-- pr-review-bot -->` Marker)

### CI/CD (API-basiert)

.github/workflows/pr-review.yml – automatisches PR-Review bei pull_request (opened, synchronize)

- nur für interne PRs (Fork-PRs werden aus Sicherheitsgründen übersprungen)
- nutzt GitHub Secret ANTHROPIC_API_KEY
- aktualisiert vorhandenen Bot-Kommentar statt bei jedem Push einen neuen zu posten
