Analysiere dieses Projekt systematisch. Ich bin neu in dieser Codebasis und brauche einen vollständigen Überblick. Gehe die folgenden drei Schritte nacheinander durch:

---

## Schritt 1 — Überblick verschaffen

- Was macht die App? (aus dem Code abgeleitet, nicht aus der README)
- Welcher Tech-Stack wird verwendet?
- Wie ist das Projekt strukturiert?
- Welche externen Dependencies gibt es?
- Wie wird die App gebaut und gestartet?

---

## Schritt 2 — Architektur-Map erstellen

Für jedes Modul/jeden Service:

- Was ist seine Aufgabe?
- Mit welchen anderen Modulen kommuniziert es?
- Welche externen Systeme nutzt es?

Identifiziere die kritischen Pfade:

- Wie fließen Daten durch die App?
- Wo sind die Entry Points (API-Routen, CLI-Commands, Event-Handler)?
- Wo sind die Exit Points (DB-Writes, API-Calls, File-Output)?

---

## Schritt 3 — Schwachstellen identifizieren

Finde technische Schulden:

- Veraltete Dependencies (Major-Versionen hinter aktuell)
- Fehlende Tests (Module ohne zugehörige Test-Dateien)
- Inkonsistente Patterns (verschiedene Error-Handling-Ansätze, Mixed Styles)
- Sicherheitsprobleme (veraltete Pakete mit bekannten CVEs)
- Dead Code (exportierte Funktionen die nirgends importiert werden)

Priorisiere nach Risiko: Was sollte zuerst angegangen werden?

---

## Abschluss

Frage mich am Ende, ob ich eine `CLAUDE.md` basierend auf dieser Analyse erstellen soll, die Tech-Stack, Struktur, erkennbare Konventionen und bekannte Probleme dokumentiert.
