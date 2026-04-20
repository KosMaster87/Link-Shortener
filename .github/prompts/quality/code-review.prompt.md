---
agent: ask
description: "Nutzen wenn: ein Pull Request reviewt oder eine Datei gegen Projektstandards geprüft wird"
argument-hint: "Dateipfad oder Feature-Name (z.B. src/services/link-service.js)"
---

# Code Review: $input

---

## 1. Architekturregeln

- [ ] Route enthält keine Business Logic — nur HTTP-Parsing und Service-Aufruf
- [ ] Business Logic liegt im Service, nicht in der Route
- [ ] Service gibt strukturierten Fehler zurück: `ok(data)` / `err({ code, message })`
- [ ] Route übersetzt Service-Fehler via `ERROR_STATUS[code] ?? 500`
- [ ] DB-Zugriff nur in Services — nie direkt in Routen oder `server.js`

## 2. Code-Qualität

- [ ] Funktionen max. ~15 Zeilen
- [ ] Eine Aufgabe pro Funktion
- [ ] Keine verschachtelten Callbacks oder tiefen Promise-Chains
- [ ] `async/await` statt `.then()/.catch()` Chains
- [ ] Named Exports, keine Default Exports

## 3. Fehlerbehandlung

- [ ] Services werfen keine rohen Strings — immer `err({ code, message })`
- [ ] Error Messages enthalten Kontext: `"days muss 1–365 sein. Erhalten: -1"`
- [ ] Kein leeres `catch` (`catch (e) {}`)
- [ ] Fire-and-forget Operationen haben `.catch()` (z.B. `trackClick`)

## 4. Tests

- [ ] Test-Datei vorhanden
- [ ] Happy Path getestet
- [ ] Fehlerfall getestet
- [ ] Keine echte DB in Unit-Tests (gemockt)
- [ ] E2E-Tests testen den echten HTTP-Endpunkt

## 5. Security

- [ ] Keine Secrets im Code
- [ ] User-Input wird validiert bevor er in DB-Queries gelangt
- [ ] JWT-Validierung vorhanden bei geschützten Routen
- [ ] Kein offengelegtes Stack Trace in API-Responses

## 6. Code-Hygiene

- [ ] `npm run lint` fehlerfrei
- [ ] Keine `console.log` in Produktionscode
- [ ] Naming Conventions: camelCase Funktionen, kebab-case Dateien
- [ ] Keine auskommentierten Blöcke
