# Branch Protection — Übersicht

Dieses Verzeichnis dokumentiert die Branch-Protection-Strategie für den `master`-Branch des Link-Shortener-Projekts.

## Aktiver Ruleset: Baseline (Solo)

Für Einzel-Entwickler ausgelegt — schützt gegen direkte riskante Änderungen, erzwingt PR-basierten Merge mit CI.

### Aktive Regeln

| Regel                                     | Eingestellt |
| ----------------------------------------- | ----------- |
| Restrict deletions                        | ✅          |
| Block force pushes                        | ✅          |
| Require linear history                    | ✅          |
| Require pull request before merging       | ✅          |
| Dismiss stale PR approvals on new commits | ✅          |
| Require conversation resolution           | ✅          |
| Require status checks to pass             | ✅          |

### Required Status Checks

- `test` — Pflicht, blockiert Merge bei Fehler

**Nicht als Required Check:** `coverage-soft-gate` — absichtlich, weil dieser Job `continue-on-error: true` hat und nur warnt.

## Roadmap: Wann wird `coverage-soft-gate` zum echten Gate?

| Zeitraum     | Maßnahme                                          |
| ------------ | ------------------------------------------------- |
| Jetzt        | `continue-on-error: true` — warnt, blockiert nie  |
| In ~4 Wochen | Coverage-Threshold auf 30% setzen, weiterhin soft |
| In ~8 Wochen | `continue-on-error: false` — echter Gate bei 60%  |

## GitHub Einrichtung (einmalig)

1. Repository → **Settings** → **Rules** → **Rulesets** → **New ruleset**
2. Name: `main-protection-baseline`
3. Target branches: `refs/heads/master`
4. Regeln nach der Tabelle oben aktivieren
5. Bei „Required status checks": `test` eintragen (exakter Job-Name aus `ci.yml`)
6. Speichern

## Strict-Erweiterungen (wenn Team wächst)

```
+ Require signed commits
+ required_approving_review_count: 1
+ require_code_owner_review
+ Auto-request Copilot review (copilot_code_review)
```
