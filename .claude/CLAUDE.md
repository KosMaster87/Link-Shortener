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

- `ok(data)` / `err("...")` aus `src/utils/result.js` — nie manuell `{ success: true/false }` bauen
- Services geben immer Result zurück, Routes übersetzen via `ERROR_STATUS`-Map in HTTP-Status
- Error Messages mit Kontext: `"Invalid URL: must start with http://. Received: ftp://example.com"`

## Code Patterns

- **Services:** Validierung am Anfang, frühe Returns. Muster: `src/services/link-service.js`
- **Routes:** Nur HTTP, kein Business Logic. Muster: `src/routes/links.js`
- **Analytics:** Fire-and-forget mit `.catch()` — Fehler loggen, nicht weitergeben
- **Request-Daten:** Referrer, User-Agent, IP in der Route extrahieren, als Parameter übergeben
- **Tests:** Echte PostgreSQL-DB (keine Mocks), `describe`/`it`, `createdCodes`-Cleanup in `afterEach`. Muster: `tests/link-service.test.js`
