Review den Code in $ARGUMENTS.

## Review-Ebenen

### Ebene 1: Lesbarkeit

- Sind die Variablennamen aussagekräftig?
- Ist die Funktion zu lang oder komplex? (Limit: 14 Zeilen laut CLAUDE.md)
- Gibt es verwirrende Stellen?
- Fehlen Kommentare an wichtigen Stellen?

### Ebene 2: Robustheit

- Welche Edge Cases sind nicht abgedeckt?
- Wo könnten unerwartete Inputs Probleme machen?
- Sind die Fehlermeldungen hilfreich für Debugging?
- Werden Result-Objekte korrekt verwendet (ok/err, nie throw)?

### Ebene 3: Wartbarkeit

- Wie einfach wäre es, diesen Code zu erweitern?
- Welche Teile sind zu stark gekoppelt?
- Was würde den nächsten Entwickler verwirren?
- Verstößt etwas gegen die Patterns aus der CLAUDE.md?

## Output

Gib mir eine priorisierte Liste der Top 5 Verbesserungen.
Für jede Verbesserung:

1. Was ist das Problem?
2. Warum ist es ein Problem?
3. Wie würde ich es lösen?

Beginne mit dem wichtigsten. Wenn $ARGUMENTS leer ist, frag mich, welche Datei oder welchen Ordner ich reviewen möchte.
