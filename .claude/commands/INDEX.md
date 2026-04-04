# Commands Index

Schnelluebersicht fuer Custom Commands im LinkShort-Projekt.

## Schnellwahl

- Kleine bis mittlere Feature-Umsetzung (TDD-first): `/feature <name>`
- Grosses Feature mit Explore/Plan/Validate/Ship: `/feature-workflow <name>`
- Bestehenden Code kritisch pruefen: `/review <pfad>`
- Tests erstellen oder erweitern: `/test <modul|datei>`
- CLAUDE.md um Hook-/Qualitaetschecks erweitern: `/update-claude-md-hooks`

## Command-Liste

| Command                   | Datei                       | Zweck                                                                         | Typischer Einsatz                             |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `/feature`                | `feature.md`                | Feature nach LinkShort-Pattern mit TDD-Phasen umsetzen                        | Wenn du schnell in die Implementierung willst |
| `/feature-workflow`       | `feature-workflow.md`       | Voller Agentic Workflow (Preflight, Explore, Plan, Implement, Validate, Ship) | Bei komplexen Features ueber mehrere Dateien  |
| `/review`                 | `review.md`                 | Strukturierte Code-Review-Analyse in 3 Ebenen                                 | Vor Merge oder bei Qualitaetsproblemen        |
| `/test`                   | `test.md`                   | Testfaelle fuer Services erstellen/ausbauen                                   | Bei neuen Features oder Regressionen          |
| `/update-claude-md-hooks` | `update-claude-md-hooks.md` | Doku-Update fuer automatische Qualitaetschecks                                | Wenn Hook-/Lint-Setup geaendert wurde         |

## Empfohlener Standard-Flow

1. Grosser Scope: erst `/feature-workflow`, danach phasenweise umsetzen.
2. Lokaler Scope: direkt `/feature`.
3. Vor Ship: `/review` ausfuehren, dann `npm test` und `npm run lint`.

## Hinweise

- Bei Security-Findings immer erst Security-Fix, dann Feature-Erweiterung.
- Nach jeder groesseren Phase committen (Review-Checkpoint).
- Falls `gh` nicht verfuegbar ist: PR ueber GitHub Web UI als Fallback.
