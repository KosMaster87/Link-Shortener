Führe einen Feature-Freeze-Gate-Check für Tag 23 durch.

## Ziel

Entscheide klar zwischen:

- `FREEZE_ON` (keine neuen Features, nur Stabilität/Polish)
- `FREEZE_OFF` (kritisches Kernfeature fehlt)

## Input

Nutze `$ARGUMENTS` als Kontext (optional: aktuelle offene Tasks/Ideen).

## Vorgehen

1. Prüfe die 4 Gate-Fragen:
   - Sind alle Kernfeatures implementiert?
   - Bestehen die Haupttests?
   - Läuft der Happy Path (Registrieren -> Login -> Link kürzen -> Dashboard -> Logout)?
   - Fehlt ein launch-kritisches Feature?
2. Antworte mit einer klaren Entscheidung und kurzer Begründung.
3. Erfasse alle neuen Ideen in `POST_LAUNCH.md` statt sie zu implementieren.
4. Leite anschließend zu den nächsten Schritten über: `/tag-23-bug-hunt`, dann `/tag-23-prioritize`.

## Wichtige Regel

Keine neuen Features implementieren. Nur parken.

## Output-Format

1. Entscheidung: `FREEZE_ON` oder `FREEZE_OFF`
2. Gate-Tabelle (4 Fragen, Ja/Nein)
3. Top-3 Risiken für Launch
4. Nächster konkreter Befehl
