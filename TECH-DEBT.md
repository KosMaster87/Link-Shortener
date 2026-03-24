# Tech-Debt — analytics-service.js

Gefunden durch `/review` am Tag 06. Sofort-Fixes wurden erledigt, folgendes bleibt für Tag 07:

---

## #2 + #5 — `queryStats` zu lang + keine Konstante

**Datei:** `src/services/analytics-service.js`
**Problem:** `queryStats` hat 29 Zeilen (Limit laut CLAUDE.md: 14). Der WHERE-Ausdruck für Bot-Filterung (`ua NOT ILIKE '%bot%' AND ...`) ist dreimal dupliziert.

**Plan:**

1. Konstante `NON_BOT_WHERE` extrahieren:
   ```js
   const NON_BOT_WHERE = `ua NOT ILIKE '%bot%' AND ua NOT ILIKE '%crawler%' ...`;
   ```
2. `queryStats` in Sub-Funktionen aufteilen (z.B. `buildStatsQuery`, `formatStatsResult`)
3. Tests laufen lassen — kein Verhalten ändert sich

---

## #4 — `insertClick` 5 Positional-Parameter

**Datei:** `src/services/analytics-service.js`
**Problem:** Funktion nimmt 5 einzelne Parameter → fehleranfällig bei Aufruf (falsche Reihenfolge).

**Plan:**

```js
// Jetzt:
async function insertClick(shortId, ip, userAgent, referrer, country)

// Besser:
async function insertClick({ shortId, ip, userAgent, referrer, country })
```

Alle Aufrufe in `trackClick` anpassen + Tests prüfen.

---

## Reihenfolge für Tag 07

1. `NON_BOT_WHERE`-Konstante (rein mechanisch, kein Logik-Risiko)
2. `queryStats` aufteilen (Tests sichern Verhalten)
3. `insertClick` Object-Parameter (Aufrufort anpassen nicht vergessen)
4. Nach jedem Schritt: Tests laufen lassen
