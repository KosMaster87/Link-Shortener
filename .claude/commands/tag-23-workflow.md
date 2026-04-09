Führe den kompletten Tag-23-Workflow aus. Arbeite strikt sequenziell.

## Reihenfolge

1. `/tag-23-freeze`
2. `/tag-23-bug-hunt`
3. `/tag-23-prioritize`
4. `/tag-23-prelaunch`

## Regeln

- Kein Scope-Creep, keine neuen Features
- Immer erst priorisierte Fixes, dann Re-Check
- Ergebnisse kompakt und entscheidungsorientiert ausgeben

## Direkte Umsetzung im Projekt (nicht automatisiert abhandeln)

Diese Punkte sollen nach der Analyse konkret im Code umgesetzt werden:

- Loading States mit `finally`
- Zentraler `apiFetch()` Wrapper mit 401-Handling
- Technische Fehlermeldungen in nutzerfreundliche Texte übersetzen
- Empty States für Listen/Dashboard
- Auth-UX Flows (falsches Passwort, Session-Ablauf, Logout, Guarded Routes)

## Output

1. Aktueller Schritt
2. Ergebnis
3. Nächste Aktion
