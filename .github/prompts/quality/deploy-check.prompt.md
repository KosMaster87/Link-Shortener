---
agent: ask
description: "Nutzen wenn: ein PR gemergt oder ein Render-Deploy vorbereitet wird"
---

# Deploy-Check — Link-Shortener

Alle Punkte durchgehen bevor ein Branch gemergt oder ein Deploy ausgelöst wird.

---

## 1. Code-Qualität

```bash
npm run lint        # ESLint — keine Fehler
npm test            # alle 148+ Tests grün
```

- [ ] `npm run lint` fehlerfrei
- [ ] Alle Tests grün
- [ ] Neue Features haben Tests
- [ ] Kein `console.log` im Produktionscode

---

## 2. Code-Hygiene

- [ ] Keine auskommentierten Code-Blöcke
- [ ] Keine `TODO` / `FIXME` ohne GitHub Issue
- [ ] Keine hardcodierten URLs oder Magic Numbers
- [ ] Keine `debugger`-Statements

---

## 3. Datenbank

- [ ] Neue DB-Änderungen haben Migration in `src/db/migrations/`
- [ ] Migration wurde auf lokalem Schema getestet
- [ ] `schema.sql` spiegelt aktuellen Stand wider
- [ ] Migrations-Datei folgt Namenskonvention: `00X_beschreibung.sql`

---

## 4. Konfiguration & Secrets

- [ ] Keine API-Keys oder Passwörter im Code
- [ ] `.env` nicht committed (steht in `.gitignore`)
- [ ] `.env.example` enthält alle benötigten Keys (mit leerem Wert)
- [ ] `render.yaml` enthält keine echten Secret-Werte (`sync: false` für Secrets)

---

## 5. Render-Deployment

- [ ] `render.yaml` ist aktuell
- [ ] Alle Env-Vars sind im Render-Dashboard gesetzt (inkl. `DATABASE_URL` für Neon)
- [ ] `USE_DATABASE_URL=true` ist gesetzt
- [ ] Health-Endpoint `GET /health` antwortet mit 200

---

## 6. Nach dem Deploy

```bash
# Smoke Test gegen Production
curl https://link-shortener.dev2k.org/health
```

- [ ] `/health` gibt `200 OK` zurück
- [ ] Ein Test-Link kann erstellt und aufgerufen werden
- [ ] Dashboard lädt ohne Fehler
