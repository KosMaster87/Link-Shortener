# TECH DEBT - Link-Shortener

Aktueller Stand nach Tag 12 (Performance & Optimierung).

---

## Offene Punkte (priorisiert)

## P1 - getTopLinks skaliert linear bei Wachstum

**Datei:** `src/services/dashboard-service.js`

**Befund:**

- `getTopLinks` ist eine Vollaggregation (`GROUP BY` ueber alle Codes).
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

## P1 - Test-Design: "leere DB"-Annahme ist fragil

**Datei:** `tests/link-service.test.js` (Testfall mit Erwartung auf 0 Inactive-Links)

**Befund:**

- Mindestens ein Test setzt implizit eine leere oder sterile DB voraus.
- In aktiver Dev-DB mit Seed-/Produktionsnahen Daten wird der Test rot, obwohl kein Feature-Bug vorliegt.

**Risiko:**

- Falsch-negative Testfehler blockieren Releases und verwischen echte Regressionen.

**Plan (nächster Test-Refactor):**

1. Testdaten strikt pro Test erzeugen und wieder entfernen.
2. Assertions nur auf testeigene Datensätze.
3. Keine globale "DB ist leer"-Annahme.

---

## P2 - Dashboard-Caching (bewusst verschoben)

**Datei:** `src/services/dashboard-service.js`

**Befund:**

- Fuer Dashboard-Overview ist ein kurzer TTL-Cache sinnvoll.
- Tag 12 Fokus lag auf Messen/Verstehen/Fixen; Caching wurde absichtlich vertagt.

**Plan (Tag 12.5 / Tag 13+):**

1. In-Memory Cache mit `Map` und TTL (60s) fuer `getOverviewStats`.
2. Helferfunktionen `getCached(key)` und `setCache(key, data)`.
3. Cache-Hit/Miss im Debug-Log sichtbar machen.
4. Guard gegen unendliches Wachstum (max keys oder nur feste Keys).

**Akzeptanzkriterien:**

- Bei Cache-Hit keine DB-Query fuer Overview.
- Rueckgabe bleibt identisch zum aktuellen API-Format.
- Keine Aenderung am Error-Handling.

---

## P3 - Referrer: Double-Query kann spaeter vereinfacht werden

**Datei:** `src/services/dashboard-service.js`

**Befund:**

- `getReferrerBreakdown` macht erst `codeExists()`, dann Referrer-Query.
- Funktional korrekt, aber 1 zusätzlicher Roundtrip.

**Plan (optional):**

1. Auf eine Query-Strategie pruefen (CTE / JOIN), die Existenz und Aggregation kombiniert.
2. Verhalten fuer `NOT_FOUND` exakt beibehalten.

---

## Notizen

- `idx_link_clicks_code` bleibt sinnvoll für Point-Lookups (z. B. Referrer pro Code).
- Für Vollaggregationen (`getTopLinks`) ist der Haupthebel nicht der Index, sondern Voraggregation (Materialized View).
- `clicks-per-day` Datum-Serialisierung wurde bereits auf stabiles `YYYY-MM-DD` gefixt.
