Konsolidiere alle Findings aus Tag 23 in eine klare Launch-Prioritätenliste.

## Ziel

Eine umsetzbare Reihenfolge ohne Ablenkung.

## Input

Nutze `$ARGUMENTS` als Quelle (z. B. Ergebnisse aus `/tag-23-bug-hunt`).
Wenn leer, sammle die letzten relevanten Findings aus dem Chat-Kontext.

## Sortierung (verpflichtend)

1. `BLOCKER` - App ohne Fix nicht sinnvoll nutzbar
2. `CRITICAL` - schwere Bugs, müssen vor Launch weg
3. `SHOULD-FIX` - hoher Qualitätsgewinn
4. `NICE-TO-HAVE` - optional, in Backlog

## Für BLOCKER und CRITICAL

Zeige jeweils:

- Betroffene Datei/Komponente
- Problematischer Codeausschnitt (kurz)
- Lösungsvorschlag (konkret)
- Aufwand: einfach/mittel/komplex
- Verifikationstest (wie geprüft wird)

## Für SHOULD-FIX und NICE-TO-HAVE

Nur Kurzbeschreibung + Nutzen.

## Abschluss

- Markiere die Top-3 Low-Hanging-Fruits (hoher Impact, niedriger Aufwand)
- Gib die empfohlene Abarbeitungsreihenfolge als nummerierte Liste aus
