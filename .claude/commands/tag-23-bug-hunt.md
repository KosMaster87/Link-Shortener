Analysiere die Codebasis für Tag 23 mit einem harten, launch-orientierten Review.

## Ziel

Systematisches Bug-Hunting ohne Schönreden.

## Scope

Wenn `$ARGUMENTS` leer ist:

- Starte mit Hotspot-Scan und wähle die 3 kritischsten Dateien aus:
  - eine API-Route
  - ein Auth-Modul
  - eine Frontend-Logik-Datei
    Wenn `$ARGUMENTS` gesetzt ist:
- Analysiere genau die angegebenen Dateien/Ordner.

## Prüfkriterien

- Logische Fehler
- Unbehandelte Edge Cases
- Null/Undefined-Risiken
- Fehlendes Error Handling
- Race Conditions bei async Code

## Analyse-Modi (pro Datei)

1. Logic Bugs: Verhalten mit leer/null/undefined/Whitespace/Sonderzeichen/langen Inputs simulieren
2. Edge Cases: DB down, API 500, Session-Ablauf, gleichzeitige Requests
3. Error Handling: async ohne try/catch, Promise ohne catch, geworfene aber ungefangene Fehler
4. Race Conditions: konkurrierende Writes, inkonsistenter State zwischen awaits

## Priorisierung

Nutze Schweregrad:

- `CRITICAL` App unbenutzbar / Security / Datenverlust
- `MAJOR` Feature kaputt oder unzuverlässig
- `MINOR` suboptimal, aber nutzbar
- `COSMETIC` textlich/optisch

## Output-Format

A) Top-Hotspots (falls Scan aktiv)
B) Findings je Datei nach Priorität
C) Für jedes `CRITICAL`/`MAJOR`:

- Problem
- Repro
- Fix-Idee
- Aufwand: einfach/mittel/komplex
  D) Konsolidierte Liste aller offenen Issues

## Tag-23 Abgrenzung

Die folgenden Punkte werden im Projekt direkt umgesetzt, nicht hier automatisiert gelöst:

- Loading States
- Zentraler `apiFetch()` Wrapper
- Benutzerfreundliche Error Messages
- Empty States
- Auth-UX Flows
