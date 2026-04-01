Lies die aktuelle CLAUDE.md vollständig, damit du bestehende Abschnitte nicht duplizierst.

Dann füge einen neuen Abschnitt "Automatische Qualitätschecks" ein – nach dem Entwicklungs-Workflow.

Der Abschnitt dokumentiert:

1. Was nach jeder Dateiänderung durch Claude automatisch läuft (PostToolUse Hooks):
   - Prettier: Formatierung der geänderten Dateien
   - ESLint: Linting + Auto-Fix der geänderten Dateien
   - node --test: Test-Suite

2. Was vor jedem git commit läuft (lint-staged via husky):
   - \*.js: Prettier + ESLint --fix
   - Bei ESLint-Errors wird der Commit abgebrochen

3. Was manuell bleibt:
   - Datenbankmigrationen
   - git push / Deployment
   - npm run lint für vollständigen Projekt-Lint außerhalb von Claude

4. Wo die Konfiguration liegt:
   - Claude Hooks: .claude/settings.local.json
   - Git Hooks: .husky/pre-commit + lint-staged in package.json
   - ESLint: eslint.config.js

Schreibe auf Deutsch. Halte den Abschnitt kurz: Tabelle für automatische Checks, kurze Liste für manuelle Checks.
