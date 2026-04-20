## Zusammenfassung

Was wurde geändert und warum?

## Art der Änderung

- [ ] feat — neue Funktion
- [ ] fix — Bugfix
- [ ] docs — nur Dokumentation
- [ ] refactor — kein neues Feature, kein Fix
- [ ] test — Tests hinzugefügt oder angepasst
- [ ] chore — Build, CI, Abhängigkeiten

## Betroffener Bereich

- [ ] `src/routes/` — HTTP-Schicht
- [ ] `src/services/` — Business Logic
- [ ] `src/db/` — Schema oder Migration
- [ ] `src/config.js` — Konfiguration
- [ ] `.github/` — CI oder Workflows
- [ ] `docs/` — Dokumentation

## Qualitäts-Checks

- [ ] `npm run lint` fehlerfrei
- [ ] `npm test` — alle Tests grün
- [ ] Neue Features haben Tests
- [ ] Kein `console.log` im Produktionscode

## Datenbank

- [ ] Keine DB-Änderungen — nicht relevant
- [ ] Neue Migration in `src/db/migrations/` vorhanden
- [ ] `schema.sql` ist aktuell

## Security

- [ ] Keine Secrets, API-Keys oder Tokens im Code
- [ ] `.env` nicht committed
- [ ] `.env.example` aktualisiert (wenn neue Vars)
- [ ] CORS / Auth nicht geschwächt

## Test-Nachweis

Beschreibe kurz, wie du die Änderung getestet hast (lokal, welche Fälle, etc.).

## Checkliste

- [ ] PR-Scope ist fokussiert (ein Feature / ein Fix)
- [ ] Docs aktualisiert, wenn sich Verhalten geändert hat
- [ ] Branch-Name folgt Konvention (`feat/`, `fix/`, `chore/`)
