# TECH DEBT - Link-Shortener

Aktueller Stand nach Tag 12 (Performance & Optimierung).

---

## Offene Punkte (priorisiert)

## P1 - getTopLinks skaliert linear bei Wachstum

**Datei:** `src/services/dashboard-service.js`

**Befund:**

- `getTopLinks` ist eine Vollaggregation (`GROUP BY` über alle Codes).
- `EXPLAIN ANALYZE` zeigt korrekt Hash Join + Seq Scan.
- Ein Index auf `link_clicks.code` hilft hier kaum, da alle Zeilen gelesen werden müssen.

**Risiko:**

- Bei hohem Click-Volumen steigt die Latenz deutlich (linear).

**Plan (später):**

1. Materialized View für voraggregierte Top-Links einführen.
2. `REFRESH MATERIALIZED VIEW CONCURRENTLY` zeitgesteuert (z. B. alle 1-5 Minuten).
3. Query in `getTopLinks` auf View umstellen.
4. Vorher/Nachher mit `EXPLAIN ANALYZE` dokumentieren.

---

## P2 - Dashboard-Caching (bewusst verschoben)

**Datei:** `src/services/dashboard-service.js`

**Befund:**

- Für Dashboard-Overview ist ein kurzer TTL-Cache sinnvoll.
- Tag 12 Fokus lag auf Messen/Verstehen/Fixen; Caching wurde absichtlich vertagt.

**Plan (Tag 12.5 / Tag 13+):**

1. In-Memory Cache mit `Map` und TTL (60s) für `getOverviewStats`.
2. Helferfunktionen `getCached(key)` und `setCache(key, data)`.
3. Cache-Hit/Miss im Debug-Log sichtbar machen.
4. Guard gegen unendliches Wachstum (max keys oder nur feste Keys).

**Akzeptanzkriterien:**

- Bei Cache-Hit keine DB-Query für Overview.
- Rückgabe bleibt identisch zum aktuellen API-Format.
- Keine Änderung am Error-Handling.

---

## P3 - Referrer: Double-Query kann später vereinfacht werden

**Datei:** `src/services/dashboard-service.js`

**Befund:**

- `getReferrerBreakdown` macht erst `codeExists()`, dann Referrer-Query.
- Funktional korrekt, aber 1 zusätzlicher Roundtrip.

**Plan (optional):**

1. Auf eine Query-Strategie prüfen (CTE / JOIN), die Existenz und Aggregation kombiniert.
2. Verhalten für `NOT_FOUND` exakt beibehalten.

---

## P3 - Rate-Limit HTTP-Orchestrierung sauberer trennen

**Datei:** `server.js`, später `src/middleware/rate-limiter.js`

**Befund:**

- Die Sliding-Window-Logik liegt bereits sauber in `src/utils/rate-limit.js`.
- Die HTTP-seitige Verdrahtung der Buckets (`general`, `createLink`, `login`) und das Senden von `429` liegen noch in `server.js`.
- Für das kleine native-`node:http` Setup ist das aktuell ok, aber die Verantwortlichkeiten sind nicht ganz sauber getrennt.

**Risiko:**

- `server.js` wird mit jeder weiteren Security-Regel schwerer lesbar.
- Rate-Limit-Policy und HTTP-Antwortlogik sind enger gekoppelt als nötig.

**Plan (später):**

1. Kleinen HTTP-Helfer oder Middleware-Datei `src/middleware/rate-limiter.js` einführen.
2. Funktion wie `applyRateLimit(req, res, bucket)` kapselt Bucket-Prüfung und `429`-Response.
3. `server.js` reduziert sich auf Routing-Entscheidungen statt Limit-Details.
4. Vorhandene Logik in `src/utils/rate-limit.js` unverändert als technische Basis behalten.

---

## P3 - Legacy-Links ohne Besitzer bereinigen

**Datei:** neues Script, z. B. `scripts/assign-orphan-links.js`

**Befund:**

- Durch die Migration auf User/Ownership können bestehende `short_links` mit `user_id = NULL` existieren.
- Der aktuelle Ownership-Check ist korrekt strikt: `NULL !== user.id` und blockiert damit Bearbeiten/Löschen solcher Links.
- Das ist sicher, aber für Alt-Daten operativ unpraktisch.

**Risiko:**

- Vorhandene Legacy-Links bleiben dauerhaft herrenlos.
- Admin/Owner können diese Links ohne Nachmigration nicht mehr pflegen.

**Plan (später):**

1. Ein einmaliges Script bauen, das alle `short_links` mit `user_id = NULL` einem definierten Admin-User zuweist.
2. Script soll den Admin per E-Mail suchen und bei fehlendem User sauber abbrechen.
3. Vorher/Nachher Anzahl betroffener Links loggen.
4. Kursentscheidung dokumentieren: Option A (Assignment-Script) statt NULL-Ausnahme im Ownership-Check.

---

## Notizen

- `idx_link_clicks_code` bleibt sinnvoll für Point-Lookups (z. B. Referrer pro Code).
- Für Vollaggregationen (`getTopLinks`) ist der Haupthebel nicht der Index, sondern Voraggregation (Materialized View).
- `clicks-per-day` Datum-Serialisierung wurde bereits auf stabiles `YYYY-MM-DD` gefixt.

## P2 - Claude Hooks robust machen und projektweit standardisieren

**Datei:** `.claude/settings.local.json` (später optional `.claude/settings.json` für Team-Default)

**Befund:**

- Hook-Setup ist vorhanden, aber sollte als standardisierte Qualitäts-Pipeline dokumentiert und stabil gehalten werden.
- Ziel: Bei jeder Dateiänderung automatisch formatieren/linten/testen; riskante Bash-Kommandos vor Ausführung prüfen.

**Geplante Konfiguration (Referenz):**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "sh -c 'set -f; for f in $CLAUDE_FILE_PATHS; do npx prettier --write \"$f\" --log-level error; done'"
          },
          {
            "type": "command",
            "command": "sh -c 'set -f; for f in $CLAUDE_FILE_PATHS; do case \"$f\" in *.js|*.mjs|*.cjs|*.jsx|*.ts|*.tsx) npx eslint \"$f\" --fix --quiet ;; esac; done'"
          },
          {
            "type": "command",
            "command": "node --test 2>/dev/null || true"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'rm -rf'; then echo 'Gefährlicher Befehl blockiert' >&2; exit 2; fi"
          }
        ]
      }
    ]
  }
}
```

**Risiko:**

- Ohne Standardisierung kann das Verhalten zwischen lokalen Setups variieren.
- Globales `node --test` nach jedem Edit kann bei wachsender Test-Suite spürbar langsamer werden.

**Plan (später):**

1. Hook-Verhalten in `CLAUDE.md` als Projektstandard dokumentieren.
2. Optional: von `settings.local.json` auf versionierte Team-Defaults umstellen.
3. Test-Hook später auf selektive Tests oder schnellen Smoke-Test optimieren.
