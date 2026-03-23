---
description: Neues Feature nach dem LinkShort-Pattern erstellen
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Feature: $ARGUMENTS

## Workflow

### Phase 1: Verstehen

Bevor du Code schreibst:

1. Lies die CLAUDE.md für Kontext und Patterns
2. Schau dir src/services/link-service.js als Referenz an
3. Verstehe, wie das neue Feature in die Architektur passt (Routes → Services → DB)

### Phase 2: Tests zuerst

Nach dem TDD-Pattern aus tests/link-service.test.js:

1. Erstelle die Test-Datei in tests/
2. Schreibe Tests für: Happy Path, Edge Cases, Error Cases (node:test + node:assert/strict)
3. Führe die Tests aus – sie sollten alle rot sein

### Phase 3: Implementation

Nach den Patterns aus der CLAUDE.md:

1. Erstelle den Service in src/services/ nach dem Pattern von link-service.js
2. Result-Objekte verwenden (ok/err aus src/utils/result.js), keine Exceptions
3. Validierung am Anfang, frühe Returns bei Fehlern
4. Falls nötig: Route in src/routes/ nach dem Pattern von src/routes/links.js

### Phase 4: Verifizieren

1. Führe die Tests aus – sie sollten alle grün sein
2. Wenn Tests fehlschlagen, analysiere warum und fixe
3. Zeig mir das finale Ergebnis mit Test-Output

## Wenn $ARGUMENTS leer ist

Frag mich:

1. Wie heißt das Feature?
2. Was soll es tun?
3. Was sind Input/Output?
