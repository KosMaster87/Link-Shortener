---
agent: ask
description: "Nutzen wenn: ein Bug oder unerwartetes Verhalten im Link-Shortener untersucht wird"
argument-hint: "Bereich oder Datei wo der Bug auftritt (z.B. analytics-service, redirect-route)"
---

# Bug analysieren: $input

---

## 1. Symptom beschreiben

Beantworte zuerst:

- **Was passiert?** (Fehlermeldung, falscher Wert, falsches Verhalten)
- **Wann passiert es?** (immer / nur bei bestimmten Eingaben / nach einem Schritt)
- **Was sollte passieren?**
- **Was wurde schon probiert?**

---

## 2. Bereich eingrenzen

Datenfluss im Link-Shortener — von außen nach innen:

```
HTTP-Request (Route)
  → Service-Aufruf
    → DB-Query (pg.Pool)
      → PostgreSQL
```

Reihenfolge der Prüfung:

1. **Route** — kommt der Request an? Werden Parameter korrekt geparst?
2. **Service** — validiert der Service die Eingabe? Wird Fehler korrekt zurückgegeben?
3. **DB-Query** — ist das SQL korrekt? Gibt PostgreSQL den erwarteten Typ zurück?
4. **Config** — sind alle Env-Vars gesetzt? (`PGHOST`, `DATABASE_URL`, `JWT_SECRET`)
5. **Migration** — ist die Tabelle / Spalte vorhanden? (`src/db/migrations/` prüfen)

---

## 3. Diagnose-Befehle

```bash
# Linter prüfen
npm run lint

# Nur Unit/Service-Tests (ohne Server)
npm run test:raw tests/link-service.test.js
npm run test:raw tests/analytics-service.test.js

# Alle Tests (startet Server automatisch)
npm test

# Server manuell starten und Logs beobachten
npm start

# DB-Schema prüfen
psql -U $PGUSER -d $PGDATABASE -c "\d short_links"
psql -U $PGUSER -d $PGDATABASE -c "\d link_clicks"
```

---

## 4. Fehlercode-Referenz (PostgreSQL)

| Code    | Bedeutung                                                       |
| ------- | --------------------------------------------------------------- |
| `23503` | Foreign Key verletzt — referenzierter Datensatz existiert nicht |
| `23505` | Unique Constraint — Wert bereits vorhanden                      |
| `42P01` | Tabelle existiert nicht — Migration fehlt                       |
| `28P01` | Auth-Fehler — falsche DB-Credentials                            |

---

## 5. Fix dokumentieren

Nach dem Fix:

- [ ] Test für den Fehlerfall ergänzt
- [ ] CHANGELOG oder Commit-Message erklärt die Ursache
