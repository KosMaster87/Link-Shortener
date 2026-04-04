# Feature Development Workflow

Ich möchte ein neues Feature entwickeln: $ARGUMENTS

Führe den Agentic Development Workflow durch.

## Phase 0: Preflight

- Prüfe, ob ein Feature-Branch aktiv ist.
- Wenn nein, schlage einen Branch-Namen vor.
- Mache noch keine Codeänderungen.

## Phase 1: Explore

Nutze einen Explore-Agent und liefere:

1. Relevante Module/Dateien
2. Bestehende Patterns
3. Wiederverwendbare Logik
4. Risiken (Security, Performance, Konsistenz)

## Phase 2: Plan

Erstelle einen phasenweisen Plan:

- Jede Phase unabhängig testbar
- klare Datei-Liste pro Phase
- Abhängigkeiten und Risiken
- Commit-Checkpoint nach jeder Phase > 3 Dateien

Wenn ein Security-Problem gefunden wurde: zuerst Security-Fix planen.

Warte auf meine Bestätigung vor der Implementierung.

## Phase 3: Implement (nach Freigabe)

- Implementiere nur die bestätigte Phase
- Nach der Phase:
  - kurze Diff-Zusammenfassung
  - Tests/Lint-Status
  - Commit-Vorschlag

## Phase 4: Validate

- Kritisches Review: Edge Cases, Error Handling, Performance
- Pflichtchecks:
  - npm test
  - npm run lint
  - manuelle API-Checks (falls HTTP-Feature)

## Phase 5: Ship

- Push + PR mit Summary und Test Plan
- Wenn gh nicht verfügbar: Fallback über GitHub Web UI
- Merge erst nach grüner Pipeline und Review
