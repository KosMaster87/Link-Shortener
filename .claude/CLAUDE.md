# CLAUDE.md

## Projekt-Übersicht

**LinkShort** — URL-Shortener Mini-SaaS mit Klick-Analytics und Dashboard (lnk.sh/abc123).

## Tech-Stack

- **JS:** ES2024, ESM, Node.js 24 LTS, npm
- **Backend:** node:http, pg (Raw SQL)
- **Frontend:** Statisches HTML + CSS + Vanilla JS
- **Testing:** node:test + node:assert

## Projektstruktur

- `server.js` — HTTP Server Entry Point
- `src/routes/` — Route Handler (HTTP-Schicht)
- `src/services/` — Business Logic
- `src/db/` — Schema + pg Pool Setup
- `src/utils/` — Helper (result.js: ok/err)
- `public/` — Statische Dateien
- `tests/` — Tests

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
