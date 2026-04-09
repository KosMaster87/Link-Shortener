Führe einen funktionalen Pre-Launch-Check für Tag 23 durch.

## Ziel

Prüfen, ob die App sich für echte Nutzer fertig anfühlt.

## Prüfpakete

1. Happy Path

- Startseite -> Registrieren -> Login -> Link kürzen -> Kurzlink kopieren -> Dashboard -> Logout

2. UX Quick Checks

- Form-Validation-Feedback vorhanden
- Keyboard-Tab-Reihenfolge logisch
- Fokus sichtbar
- Responsive bei 375px
- Interaktive Elemente mindestens 44x44px

3. Accessibility Basics

- `img` mit sinnvollem `alt`
- Inputs mit zugehörigem Label
- Kontrast grob auf WCAG-AA-Risiken prüfen

4. Browser-Mindestcheck (Plan)

- Chrome Desktop
- Firefox Desktop
- Mobile Browser (Checkliste erstellen, falls kein Gerät verfügbar)

## Output-Format

A) Checkliste mit `PASS/FAIL/UNKNOWN`
B) Bei jedem `FAIL`: Ursache + kleinster möglicher Fix
C) Launch-Empfehlung:

- `GO` (keine BLOCKER)
- `GO_WITH_RISKS` (nur bekannte Rest-Risiken)
- `NO_GO` (BLOCKER vorhanden)

## Hinweis

Keine neuen Features einführen, nur Stabilität/Polish.
