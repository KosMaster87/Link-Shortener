# CLAUDE.md

## Projekt-Übersicht

**Name:** LinkShort
**Typ:** Mini-SaaS (API + statisches Web-Frontend)
**Zweck:** URL-Shortener mit Klick-Analytics und Dashboard
**Zielgruppe:** Marketing-Teams, Content-Creator, Blogger

Der Service erstellt kurze Links (z.B. lnk.sh/abc123), trackt jeden Klick
und zeigt Statistiken im Dashboard an.

## Tech-Stack

**Sprache:** JavaScript (ES2024, ESM)
**Runtime:** Node.js 24 LTS
**Package Manager:** npm

**Backend:**

- node:http (nativer HTTP-Server)
- pg (PostgreSQL Client, Raw SQL)

**Frontend:**

- Statisches HTML + CSS + Vanilla JS

**Testing:**

- node:test + node:assert

## Projektstruktur

- `server.js` - HTTP Server Entry Point
- `src/`
  - `routes/` - Route Handler (HTTP-Schicht)
  - `services/` - Business Logic
  - `db/` - Schema + pg Pool Setup
  - `utils/` - Helper (result.js: ok/err)
- `public/` - Statische Dateien (HTML, CSS, JS)
- `tests/` - Tests (node:test)

## Architektur-Entscheidungen

### Routes und Services getrennt

Routes kennen HTTP, Services nur Business Logic.
Vorteil: Services sind isoliert testbar.

### Flache Struktur

Keine tiefen Verschachtelungen. Ordner werden
erst aufgeteilt, wenn sie zu groß werden.

## Datenbank

- **DB:** PostgreSQL, Datenbank: `linkshort`
- **Verbindung:** Unix-Socket `/var/run/postgresql` (peer-Auth, kein Passwort nötig)
- **DB-User:** `dev2k` (PostgreSQL Superuser)
- **Starten:** `npm start` in `link-shortener/`

## Coding-Konventionen

### Naming

- Dateien: kebab-case (link-service.js)
- Funktionen: camelCase (createShortLink)
- DB-Tabellen: snake_case (short_links, link_clicks)

### JavaScript

- ESM Module (import/export)
- Named Exports bevorzugen

## Function Rules

- Eine Aufgabe pro Funktion
- Maximum 14 Zeilen pro Funktion
- Keine verschachtelten Funktionen – in separate Funktionen auslagern
- Komplexe Logik in Helper-Funktionen aufteilen
- Arrow Functions bevorzugen
- JSDoc-Typen für alle Parameter und Rückgabewerte (ersetzt TypeScript-Typen)
- Beschreibende Namen: kurz und präzise (3–5 Wörter max)
- camelCase: createShortLink, nicht Create_Short_Link
- Keine Magic Numbers – benannte Konstanten verwenden
  (Beispiel: const MAX_SLUG_ATTEMPTS = 3, nicht die Zahl 3 direkt im Code)

## File Size Limits

- Funktionen: max. 14 Zeilen
- Modulare Services: max. 100 LOC
- Allgemeine Dateien: max. 400 LOC

### Error Handling

- Result-Objekte statt Exceptions:
  { success: true, data } | { success: false, error: "..." }
- Services geben immer Result zurück
- Routes wandeln Result in HTTP Response um

## JSDoc-Dokumentation

Jede Datei beginnt mit @fileoverview Header.
Jede exportierte Funktion hat @param und @returns.
Typedef-Kommentare leben im Service der sie verwendet.
JSDoc beschreibt konkretes Verhalten: was die Funktion tut, welche Fehler-Codes
sie zurückgibt und unter welchen Bedingungen.

## Code Patterns

### Result-Objekte

Alle Services nutzen `ok()` und `err()` aus `src/utils/result.js`.
Nie manuell `{ success: true/false }` bauen, immer die Helper verwenden.

### Services

Alle Services folgen dem Aufbau in `src/services/link-service.js`:
`ok()`/`err()` statt throw, Validierung am Anfang, frühe Returns.

### Error Handling

Error Messages enthalten Kontext + was falsch gelaufen ist:
`"Invalid URL: must start with http:// or https://. Received: ftp://example.com"`

### Routes

Routes kennen nur HTTP — kein Business Logic. Muster: `src/routes/links.js`.
Service-Result direkt in HTTP-Status übersetzen via `ERROR_STATUS`-Map.

### Tests

Integrationstests gegen echte PostgreSQL-DB (keine Mocks). Muster: `tests/link-service.test.js`.
`describe`/`it`-Struktur, `createdCodes`-Cleanup in `afterEach`, `assert.equal` für Fehlerfälle,
`assert`-Chain für Erfolgsfälle. Kommentare erklären _warum_, nicht _was_.
