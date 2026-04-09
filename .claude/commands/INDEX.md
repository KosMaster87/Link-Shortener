# Commands Index

Schnellübersicht für Custom Commands im LinkShort-Projekt.

## Schnellwahl

- Kleine bis mittlere Feature-Umsetzung (TDD-first): `/feature <name>`
- Grosses Feature mit Explore/Plan/Validate/Ship: `/feature-workflow <name>`
- Bestehenden Code kritisch prüfen: `/review <pfad>`
- Deployment-Readiness standardisiert prüfen: `/deploy-check`
- Tests erstellen oder erweitern: `/test <modul|datei>`
- CLAUDE.md um Hook-/Qualitätschecks erweitern: `/update-claude-md-hooks`
- Tag-23 Feature-Freeze entscheiden: `/tag-23-freeze`
- Tag-23 Bug-Hunting staffelweise: `/tag-23-bug-hunt [pfad...]`
- Tag-23 Findings priorisieren: `/tag-23-prioritize`
- Tag-23 funktionalen Pre-Launch-Check fahren: `/tag-23-prelaunch`
- Tag-23 Ende-zu-Ende Workflow ausführen: `/tag-23-workflow`

## Command-Liste

| Command                   | Datei                       | Zweck                                                                         | Typischer Einsatz                             |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `/feature`                | `feature.md`                | Feature nach LinkShort-Pattern mit TDD-Phasen umsetzen                        | Wenn du schnell in die Implementierung willst |
| `/feature-workflow`       | `feature-workflow.md`       | Voller Agentic Workflow (Preflight, Explore, Plan, Implement, Validate, Ship) | Bei komplexen Features über mehrere Dateien   |
| `/review`                 | `review.md`                 | Strukturierte Code-Review-Analyse in 3 Ebenen                                 | Vor Merge oder bei Qualitätsproblemen         |
| `/deploy-check`           | `deploy-check.md`           | Deployment-Readiness mit Tests/Lint/Env-Check                                 | Vor Release oder vor erstem Production-Deploy |
| `/test`                   | `test.md`                   | Testfälle für Services erstellen/ausbauen                                     | Bei neuen Features oder Regressionen          |
| `/update-claude-md-hooks` | `update-claude-md-hooks.md` | Doku-Update für automatische Qualitätschecks                                  | Wenn Hook-/Lint-Setup geändert wurde          |
| `/tag-23-freeze`          | `tag-23-freeze.md`          | Feature-Freeze-Gate prüfen und Post-Launch-Ideen parken                       | Start von Tag 23                              |
| `/tag-23-bug-hunt`        | `tag-23-bug-hunt.md`        | Kritische Dateien systematisch auf Bugs/Risiken prüfen                        | Nach Freeze-Gate                              |
| `/tag-23-prioritize`      | `tag-23-prioritize.md`      | Findings in BLOCKER/CRITICAL/SHOULD-FIX/NICE-TO-HAVE sortieren                | Vor Fix-Session                               |
| `/tag-23-prelaunch`       | `tag-23-prelaunch.md`       | Funktionale Go/No-Go-Checks (Happy Path, UX, A11y, Responsive)                | Vor Launch                                    |
| `/tag-23-workflow`        | `tag-23-workflow.md`        | Orchestriert den kompletten Tag-23-Ablauf                                     | Wenn du alles in Reihenfolge fahren willst    |

## Empfohlener Standard-Flow

1. Grosser Scope: erst `/feature-workflow`, danach phasenweise umsetzen.
2. Lokaler Scope: direkt `/feature`.
3. Vor Ship: `/review` und `/deploy-check` ausführen, danach final `npm test` und `npm run lint`.

## Hinweise

- Bei Security-Findings immer erst Security-Fix, dann Feature-Erweiterung.
- Nach jeder grösseren Phase committen (Review-Checkpoint).
- Falls `gh` nicht verfügbar ist: PR über GitHub Web UI als Fallback.
