Erstelle oder erweitere Tests für $ARGUMENTS.

## Kontext

- Das Projekt ist LinkShort, ein URL-Shortener mit Klick-Analytics
- Tests gehören nach tests/
- Wir nutzen node:test + node:assert/strict

## Test-Pattern

Folge dem Pattern aus tests/link-service.test.js:

- describe-Blöcke für Funktionsgruppen
- it-Blöcke mit aussagekräftigen Beschreibungen
- Arrange-Act-Assert Struktur
- before/afterEach/after für Lifecycle (echte DB, keine Mocks)
- Edge Cases explizit testen: leere Eingaben, ungültige Werte, doppelte Einträge
- Error Cases: assert.equal(result.success, false) + assert.equal(result.error, "...")

## Wichtige Patterns aus der CLAUDE.md

- Services geben Result-Objekte zurück: ok(data) / err(message)
- Integrationstests gegen echte PostgreSQL-DB (keine Mocks)
- Kommentare erklären warum, nicht was

## Was du tun sollst

1. Lies die CLAUDE.md für Kontext und Coding-Konventionen
2. Analysiere den zu testenden Code unter src/services/
3. Identifiziere die wichtigsten Testfälle: Happy Path, Edge Cases, Error Cases
4. Erstelle die Tests nach dem Pattern aus tests/link-service.test.js
5. Führe die Tests aus und zeig mir das Ergebnis

Wenn $ARGUMENTS leer ist, frag mich, was ich testen möchte.
