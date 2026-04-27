# LinkShort – Architektur-Dokumentation

## Projektstruktur

```text
link-shortener/
├── server.js                      # HTTP-Server, Routing, Security-Header, Rate-Limits
├── package.json                   # Node 22, ESM, Scripts, Dependencies
├── .github/
│   └── workflows/
│       └── ci.yml                 # Lint + Tests mit Postgres-Service
├── bin/
│   └── describe-url.js            # CLI-Helfer für URL-Beschreibungen via Anthropic
├── public/
│   ├── index.html                 # Link-Erstellung
│   ├── dashboard.html             # Dashboard-UI
│   ├── login.html                 # Login-UI
│   ├── style.css                  # Globale Styles
│   └── app.js                     # Frontend-Logik (aktuell noch TODO-Skelett)
├── src/
│   ├── db/
│   │   ├── index.js               # pg Pool
│   │   ├── schema.sql             # Basisschema
│   │   └── migrations/
│   │       ├── 002_add_users.sql
│   │       └── 003_add_description.sql
│   ├── middleware/
│   │   └── auth.js                # Bearer-Token prüfen, req.user setzen
│   ├── routes/
│   │   ├── analytics.js           # /api/links/:code/* Analytics-Endpunkte
│   │   ├── auth.js                # /api/auth/register und /login
│   │   ├── dashboard.js           # /api/dashboard/*
│   │   ├── links.js               # CRUD für Short-Links
│   │   └── redirect.js            # /:code -> 302 Redirect + Click-Tracking
│   ├── services/
│   │   ├── analytics-service.js   # Klickspeicherung, Bot-Filter, Aggregationen
│   │   ├── auth-service.js        # Register/Login, Passwort-Hashing
│   │   ├── dashboard-service.js   # Globale Dashboard-Queries
│   │   └── link-service.js        # Link-CRUD, Slug-Generierung, URL-Validierung
│   └── utils/
│       ├── device-classifier.js   # mobile/tablet/desktop Klassifizierung
│       ├── jwt.js                 # JWTs ohne externe Library
│       ├── rate-limit.js          # In-Memory Sliding-Window-Limiter
│       ├── result.js              # ok()/err()
│       └── validators.js          # URL-, Alias-, Query-Validierung
└── tests/
    ├── analytics-devices.test.js
    ├── analytics-period.test.js
    ├── analytics-referrers.test.js
    ├── analytics-service.test.js
    ├── dashboard-auth.test.js
    ├── e2e-redirect.test.js
    └── link-service.test.js
```

---

## API-Endpunkte

| Method   | Path                                                     | Schutz           | Funktion                                    |
| -------- | -------------------------------------------------------- | ---------------- | ------------------------------------------- |
| `POST`   | `/api/auth/register`                                     | Rate-Limit       | User anlegen, JWT zurückgeben               |
| `POST`   | `/api/auth/login`                                        | Rate-Limit       | Login prüfen, JWT zurückgeben               |
| `GET`    | `/api/links`                                             | optional JWT     | Eigene Links bei Token, sonst alle Links    |
| `POST`   | `/api/links`                                             | JWT + Rate-Limit | Link anlegen                                |
| `PUT`    | `/api/links/:code`                                       | JWT + Ownership  | Ziel-URL aktualisieren                      |
| `DELETE` | `/api/links/:code`                                       | JWT + Ownership  | Link löschen                                |
| `PATCH`  | `/api/links/:code/toggle`                                | JWT + Ownership  | `is_active` umschalten                      |
| `GET`    | `/api/links/:code/clicks`                                | öffentlich       | Aggregierte Link-Stats                      |
| `GET`    | `/api/links/:code/clicks/period?period=day\|week\|month` | öffentlich       | Klicks nach Periode gruppiert               |
| `GET`    | `/api/links/:code/referrers`                             | öffentlich       | Referrer-Breakdown                          |
| `GET`    | `/api/links/:code/devices`                               | öffentlich       | Device-Breakdown                            |
| `GET`    | `/api/links/:code/stats`                                 | öffentlich       | Gesamtstatistik für einen Link              |
| `GET`    | `/api/dashboard/overview`                                | JWT              | `total_links`, `total_clicks`, Durchschnitt |
| `GET`    | `/api/dashboard/top-links`                               | JWT              | Top-Links nach Klicks                       |
| `GET`    | `/api/dashboard/clicks-per-day`                          | JWT              | Zeitreihe für die letzten n Tage            |
| `GET`    | `/api/dashboard/referrer/:code`                          | JWT              | Top-Referrer für einen Link                 |
| `GET`    | `/:code`                                                 | öffentlich       | Redirect + asynchrones Click-Tracking       |
| `GET`    | `/`, `/*.html`, `/*.css`, `/*.js`                        | öffentlich       | Statische Dateien aus `public/`             |

---

## Routing- und Request-Flow

### `server.js`

|                    |                                                      |
| ------------------ | ---------------------------------------------------- |
| **Verantwortung**  | Zentraler HTTP-Entry-Point mit nativen Node-APIs     |
| **Input**          | Request-Methode, URL, Header, optional JSON-Body     |
| **Output**         | JSON-Responses, 302-Redirects oder statische Dateien |
| **Abhängigkeiten** | Alle Route-Module, `requireAuth`, `isAllowed`        |

Wichtige Verhaltensdetails:

- Body-Limit: 16 KB, bei Überschreitung `413 PAYLOAD_TOO_LARGE`
- Security-Header: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`
- Statische Dateien werden direkt aus `public/` gelesen
- Auth für geschützte Endpunkte wird über einen Promise-Wrapper um `requireAuth()` eingebunden
- Rate-Limits werden vor Route-Handlern angewendet

---

## Datenbank-Schema

### Effektives Schema im laufenden Projekt

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE short_links (
  code         TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  description  TEXT
);

CREATE TABLE link_clicks (
  id         SERIAL PRIMARY KEY,
  code       TEXT REFERENCES short_links(code) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  referrer   TEXT,
  user_agent TEXT,
  ip_hash    TEXT,
  is_bot     BOOLEAN NOT NULL DEFAULT FALSE
);
```

### Migrationen

| Datei                                       | Zweck                                        |
| ------------------------------------------- | -------------------------------------------- |
| `src/db/migrations/002_add_users.sql`       | Fügt `users` und `short_links.user_id` hinzu |
| `src/db/migrations/003_add_description.sql` | Fügt `short_links.description` hinzu         |

Hinweise:

- `src/db/schema.sql` bildet nur das Basisschema ohne `users` und ohne `description` ab.
- Die reale Projektstruktur ergibt sich aus `schema.sql` plus Migrationen.
- Die lokale Datenbank `linkshort` hat `description` bereits aktiv.

---

## Kernmodule

### `src/routes/links.js`

|                    |                                                      |
| ------------------ | ---------------------------------------------------- |
| **Verantwortung**  | HTTP-Schicht für Link-CRUD                           |
| **Input**          | `req.body`, `params.code`, optional `req.user`       |
| **Output**         | JSON mit 200, 201, 204, 400, 401, 403, 404, 409, 422 |
| **Abhängigkeiten** | `link-service.js`                                    |

Besonderheiten:

- `GET /api/links` liefert bei vorhandenem Token nur die Links des eingeloggten Users
- Schreiboperationen prüfen nach Auth noch explizit Ownership über `checkOwnership()`
- Fehlercodes aus dem Service werden in passende HTTP-Statuscodes übersetzt

### `src/services/link-service.js`

|                    |                                                                      |
| ------------------ | -------------------------------------------------------------------- |
| **Verantwortung**  | Link anlegen, lesen, aktualisieren, löschen, aktivieren/deaktivieren |
| **Input**          | `{ url, alias? }`, `code`, optional `userId`                         |
| **Output**         | `ok(data)` oder `err({ code, message })`                             |
| **Abhängigkeiten** | `db/index.js`, `result.js`, `validators.js`                          |

Besonderheiten:

- Slug-Laenge: 6 Zeichen, alphanumerisch, generiert mit `crypto.randomBytes()`
- Maximal 3 automatische Slug-Versuche bei Kollisionen
- Reservierte Aliase: unter anderem `api`, `admin`, `dashboard`, `login`, `logout`, `static`
- `isValidUrl()` erlaubt nur `http`/`https` und blockiert lokale Hosts wie `localhost` oder `127.0.0.1`

### `src/routes/redirect.js`

|                     |                                                   |
| ------------------- | ------------------------------------------------- |
| **Verantwortung**   | Kurzcode aufloesen und Browser weiterleiten       |
| **Input**           | `params.code`, Header wie Referrer und User-Agent |
| **Output**          | `302 Location` oder `404`                         |
| **Abhaengigkeiten** | `link-service.js`, `analytics-service.js`         |

Besonderheiten:

- Click-Tracking läuft fire-and-forget und blockiert den Redirect nicht
- IP wird aus `req.socket.remoteAddress` gelesen

### `src/routes/analytics.js`

|                     |                                                               |
| ------------------- | ------------------------------------------------------------- |
| **Verantwortung**   | Analytics-Endpunkte für Stats, Perioden, Referrer und Devices |
| **Input**           | `params.code`, Query `period`                                 |
| **Output**          | JSON mit aggregierten Zahlen                                  |
| **Abhaengigkeiten** | `analytics-service.js`                                        |

### `src/services/analytics-service.js`

|                     |                                                         |
| ------------------- | ------------------------------------------------------- |
| **Verantwortung**   | Klicks speichern und Analytics aggregieren              |
| **Input**           | `{ linkId, referrer, userAgent, ip }`, `code`, `period` |
| **Output**          | Result-Objekte mit Klick- oder Breakdown-Daten          |
| **Abhaengigkeiten** | `db/index.js`, `result.js`, `validators.js`             |

Besonderheiten:

- Bot-Erkennung über User-Agent-Muster wie `bot`, `crawler`, `spider`, `externalhit`
- IP-Adressen werden vor Speicherung via SHA-256 gehasht
- `NULL`-Referrer werden als `Direct` gespeichert bzw. aggregiert
- Unique Visitors basieren auf `COUNT(DISTINCT ip_hash)`
- Perioden-Aggregation nutzt `DATE_TRUNC(day|week|month, ...)`
- Timezone für Tages- und Periodenaggregation ist aktuell fest auf UTC gesetzt

### `src/routes/auth.js`

|                     |                                 |
| ------------------- | ------------------------------- |
| **Verantwortung**   | Register und Login über HTTP    |
| **Input**           | `{ email, password }`           |
| **Output**          | JWT plus User-Daten oder Fehler |
| **Abhaengigkeiten** | `auth-service.js`, `jwt.js`     |

### `src/services/auth-service.js`

|                    |                                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| **Verantwortung**  | Accounts anlegen und Zugangsdaten prüfen                                          |
| **Input**          | `email`, `password`                                                               |
| **Output**         | User-Daten oder `INVALID_INPUT`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `DB_ERROR` |
| **Abhängigkeiten** | `db/index.js`, `result.js`, Node `crypto`                                         |

Besonderheiten:

- Passwort-Hashing mit `crypto.scrypt`, 16-Byte Salt, 64-Byte Key
- Vergleich über `timingSafeEqual()`
- E-Mail wird lowercased gespeichert und gelesen

### `src/middleware/auth.js`

|                     |                                           |
| ------------------- | ----------------------------------------- |
| **Verantwortung**   | Bearer-Token prüfen und `req.user` setzen |
| **Input**           | `Authorization: Bearer <token>`           |
| **Output**          | `next()` oder `401 UNAUTHORIZED`          |
| **Abhaengigkeiten** | `jwt.js`                                  |

### `src/utils/jwt.js`

|                   |                                                      |
| ----------------- | ---------------------------------------------------- |
| **Verantwortung** | JWTs erstellen und verifizieren                      |
| **Algorithmus**   | HMAC-SHA256 mit Base64URL-Encoding                   |
| **Payload**       | `sub`, `email`, `iat`, `exp`                         |
| **TTL**           | 24 Stunden                                           |
| **Secret**        | `JWT_SECRET` oder Fallback `change-me-in-production` |

### `src/services/dashboard-service.js`

|                     |                                                         |
| ------------------- | ------------------------------------------------------- |
| **Verantwortung**   | Aggregationen für das geschützte Dashboard              |
| **Input**           | `limit`, `days`, `code`                                 |
| **Output**          | Overview, Top-Links, Klicks-pro-Tag, Referrer-Breakdown |
| **Abhaengigkeiten** | `db/index.js`, `result.js`, `validators.js`             |

Besonderheiten:

- `total_links` zählt nur aktive Links
- `total_clicks` und Dashboard-Auswertungen filtern Bot-Traffic über `is_bot = FALSE`
- `limit` ist auf 1 bis 100, `days` auf 1 bis 365 begrenzt

### `src/utils/rate-limit.js`

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Verantwortung** | In-Memory Sliding-Window-Limits pro IP und Bucket |
| **Buckets**       | `general`, `createLink`, `login`                  |
| **Einschränkung** | Nur für Single-Process-Deployment geeignet        |

### `src/utils/device-classifier.js`

|                   |                                                                  |
| ----------------- | ---------------------------------------------------------------- |
| **Verantwortung** | User-Agents als `tablet`, `mobile` oder `desktop` klassifizieren |
| **Logik**         | Tablet-Prüfung vor Mobile-Prüfung                                |

### `src/utils/result.js`

|                   |                                                            |
| ----------------- | ---------------------------------------------------------- |
| **Verantwortung** | Einheitliches Result-Pattern für Services                  |
| **Output**        | `{ success: true, data }` oder `{ success: false, error }` |

---

## Frontend

| Datei                   | Rolle                                                          |
| ----------------------- | -------------------------------------------------------------- |
| `public/index.html`     | Formular für neue Short-Links                                  |
| `public/dashboard.html` | Dashboard-Oberfläche für Listen und Statistiken                |
| `public/login.html`     | Login-Seite für JWT-basierten Zugriff                          |
| `public/style.css`      | Gemeinsame Styles                                              |
| `public/app.js`         | Frontend-Verhalten, aktuell noch als TODO-Skelett dokumentiert |

Aktueller Stand:

- Das Routing für statische Seiten ist serverseitig bereits vorhanden.
- `public/app.js` enthält derzeit nur kommentierte TODOs für Create-, List-, Stats- und Delete-Flows.

---

## Tests

| Datei                               | Scope                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| `tests/link-service.test.js`        | Link-CRUD und Service-Regeln                           |
| `tests/analytics-service.test.js`   | Click-Tracking, Bot-Filter, `ip_hash`, Unique Visitors |
| `tests/analytics-period.test.js`    | Periodenaggregation für day/week/month                 |
| `tests/analytics-referrers.test.js` | Referrer-Auswertung                                    |
| `tests/analytics-devices.test.js`   | Device-Klassifizierung und Analytics-Integration       |
| `tests/dashboard-auth.test.js`      | Auth-Guard für alle `/api/dashboard/*`-Routen          |
| `tests/e2e-redirect.test.js`        | Redirect-End-to-End über echte HTTP-Requests           |

Testcharakter:

- Es sind überwiegend Integrations- und E2E-nahe Tests gegen echte Datenbank und echten Serverlauf.
- `dashboard-auth.test.js` erwartet einen laufenden Server unter `http://localhost:3000`.

---

## CI und Entwicklungs-Workflow

### `.github/workflows/ci.yml`

CI besteht aus zwei Jobs:

1. `lint`
   - `npm ci`
   - `npm run lint`

2. `test`
   - Postgres-16-Service in GitHub Actions
   - Setup von `src/db/schema.sql` und `src/db/migrations/002_add_users.sql`
   - Start des Servers via `npm start`

- anschließend `npm test`

Wichtige Beobachtung:

- `003_add_description.sql` ist aktuell noch nicht Teil des CI-DB-Setups.
- Die Architektur-Doku sollte deshalb zwischen Basisschema, Migrationen und effektivem Laufzeit-Schema unterscheiden.

### `package.json`

- Runtime: Node.js ESM (`"type": "module"`)
- Start: `node --env-file-if-exists=.env server.js`
- Tests: `node --env-file-if-exists=.env --test --test-concurrency=1`
- Linting: ESLint
- Format-/Pre-Commit-Flow: Husky + lint-staged + Prettier

---

## Architektur-Entscheidungen und aktueller Stand

- Kein Express oder separates Router-Framework: Routing bleibt direkt in `server.js`
- Auth ist JWT-basiert und bewusst ohne externe JWT-Library implementiert
- Services nutzen durchgängig das Result-Pattern statt Exceptions als API nach oben
- Analytics filtern Bots konsequent über `is_bot = FALSE` aus allen relevanten Auswertungen
- IPs werden nicht im Klartext gespeichert, sondern vor Persistenz gehasht
- Dashboard-Endpunkte sind der einzige klar geschützte Analysebereich für Gesamtmetriken
- Das Projekt hat bereits die Dependencies für KI-gestützte Automatisierung (`@anthropic-ai/sdk`) und ein CLI-Helferskript in `bin/describe-url.js`, aber noch keinen produktiven Batch-Workflow unter `scripts/`

---

## Gegenüber dem alten Dokument korrigiert

- Projektstruktur um Auth, Dashboard, Middleware, Utils, Login-Seite, CI und Migrationen erweitert
- API von 5 Endpunkten auf den realen Stand gebracht
- `users`, `user_id`, `description`, `ip_hash`, `is_bot` dokumentiert
- Frontend nicht mehr als vollständig umgesetzt beschrieben, sondern als teilweise vorbereitete UI mit offenem `app.js`
- Testumfang und CI-Setup explizit aufgenommen
- Architektur-Entscheidungen an den heutigen Code angepasst
