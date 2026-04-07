---
description: Deployment-Readiness von LinkShort strukturiert prüfen
allowed-tools: Read, Bash, Grep, Glob
---

# Deploy Check

Prüfe, ob das Projekt deployment-ready ist.

## Deine Aufgabe

1. Tests prüfen: `npm test`
2. Lint prüfen: `npm run lint`
3. Build-Check: Wenn kein Build-Script existiert, als "N/A" markieren und begründen
4. Suche nach offenen TODOs/FIXMEs
5. Suche nach Debug-Code (`console.log`, `debugger`, `.only`)
6. Prüfe, ob `.env.example` mit im Code verwendeten Variablen übereinstimmt

## Output-Format

Gib einen kompakten Status-Report aus:

- Tests: ✅/❌ (Anzahl oder Kurzbegründung)
- Lint: ✅/❌ (Fehler/Warnings)
- Build: ✅/❌/N/A (mit Begründung)
- TODO/FIXME: ⚠️ Liste oder "keine"
- Debug-Code: ⚠️ Liste oder "keiner"
- Env-Variablen: ✅/❌ (fehlende Variablen nennen)

Am Ende: `READY` oder `NOT READY` mit kurzer Begründung.
