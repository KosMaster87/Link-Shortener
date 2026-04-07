# Commands Index

Schnellübersicht für Custom Commands im LinkShort-Projekt.

## Schnellwahl

- Kleine bis mittlere Feature-Umsetzung (TDD-first): `/feature <name>`
- Grosses Feature mit Explore/Plan/Validate/Ship: `/feature-workflow <name>`
- Bestehenden Code kritisch prüfen: `/review <pfad>`
- Deployment-Readiness standardisiert prüfen: `/deploy-check`
- Tests erstellen oder erweitern: `/test <modul|datei>`
- CLAUDE.md um Hook-/Qualitätschecks erweitern: `/update-claude-md-hooks`

## Command-Liste

| Command                   | Datei                       | Zweck                                                                         | Typischer Einsatz                             |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `/feature`                | `feature.md`                | Feature nach LinkShort-Pattern mit TDD-Phasen umsetzen                        | Wenn du schnell in die Implementierung willst |
| `/feature-workflow`       | `feature-workflow.md`       | Voller Agentic Workflow (Preflight, Explore, Plan, Implement, Validate, Ship) | Bei komplexen Features über mehrere Dateien   |
| `/review`                 | `review.md`                 | Strukturierte Code-Review-Analyse in 3 Ebenen                                 | Vor Merge oder bei Qualitätsproblemen         |
| `/deploy-check`           | `deploy-check.md`           | Deployment-Readiness mit Tests/Lint/Env-Check                                 | Vor Release oder vor erstem Production-Deploy |
| `/test`                   | `test.md`                   | Testfälle für Services erstellen/ausbauen                                     | Bei neuen Features oder Regressionen          |
| `/update-claude-md-hooks` | `update-claude-md-hooks.md` | Doku-Update für automatische Qualitätschecks                                  | Wenn Hook-/Lint-Setup geändert wurde          |

## Empfohlener Standard-Flow

1. Grosser Scope: erst `/feature-workflow`, danach phasenweise umsetzen.
2. Lokaler Scope: direkt `/feature`.
3. Vor Ship: `/review` und `/deploy-check` ausführen, danach final `npm test` und `npm run lint`.

## Hinweise

- Bei Security-Findings immer erst Security-Fix, dann Feature-Erweiterung.
- Nach jeder grösseren Phase committen (Review-Checkpoint).
- Falls `gh` nicht verfügbar ist: PR über GitHub Web UI als Fallback.
