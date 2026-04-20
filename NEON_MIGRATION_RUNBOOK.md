# Neon Migration Runbook (Render-hosted LinkShort)

Dieses Runbook migriert die Production-Datenbank von Render PostgreSQL zu Neon,
waehrend lokal auf Fedora weiterhin PostgreSQL ueber PG-Variablen genutzt wird.

## Zielbild

- Production auf Render nutzt `DATABASE_URL` von Neon
- Production hat `USE_DATABASE_URL=true`
- Lokal bleibt `USE_DATABASE_URL=false` mit `PGHOST/PGUSER/PGDATABASE`

## Voraussetzungen

- Neon Projekt + Datenbank sind angelegt
- Neon pooled Connection String liegt vor (`-pooler` Host)
- Zugriff auf Render Dashboard (Environment + Manual Deploy)
- Lokales Tooling: `pg_dump`, `psql`

## 1) Neon Connection String vorbereiten

Nutze den pooled Host aus Neon Connect-Dialog:

- Host mit `-pooler`
- `sslmode=require`
- `channel_binding=require`

Beispielstruktur:

`postgresql://USER:PASSWORD@ep-xxxxx-pooler.eu-central-1.aws.neon.tech/DBNAME?sslmode=require&channel_binding=require`

## 2) Schema auf Neon anwenden (falls leer)

Im Repo ausfuehren:

```bash
psql "$NEON_DATABASE_URL" < src/db/schema.sql
psql "$NEON_DATABASE_URL" < src/db/migrations/002_add_users.sql
psql "$NEON_DATABASE_URL" < src/db/migrations/003_add_description.sql
psql "$NEON_DATABASE_URL" < src/db/migrations/004_add_feedback.sql
```

Hinweis: Wenn du statt leerem Ziel eine echte Migration mit Daten machst, kommt der naechste Schritt mit `pg_dump`.

## 3) Daten von Render PostgreSQL nach Neon migrieren

Setze vorher zwei Shell-Variablen:

- `RENDER_DATABASE_URL` (alte Produktions-DB)
- `NEON_DATABASE_URL` (neue Neon-DB, idealerweise pooled)

Dann:

```bash
pg_dump --no-owner --no-privileges --format=plain "$RENDER_DATABASE_URL" > /tmp/linkshort_migration.sql
psql "$NEON_DATABASE_URL" < /tmp/linkshort_migration.sql
```

Optional verifizieren:

```bash
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM links;"
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM feedback;"
```

## 4) Render auf Neon umschalten (Cutover)

Im Render Service `linkshort`:

- `DATABASE_URL` auf Neon-URL setzen
- `USE_DATABASE_URL=true` gesetzt lassen
- Save und Manual Deploy triggern

Die Datei `render.yaml` ist bereits vorbereitet.

## 5) Health und Smoke Checks

Nach Deploy pruefen:

```bash
curl -sS https://link-shortener.dev2k.org/health
curl -i https://link-shortener.dev2k.org/
```

Danach App-Szenarien pruefen:

- Login/Register
- Link erstellen
- Redirect testen
- Dashboard laden
- Feedback absenden

## 6) Rollback Plan

Wenn nach Cutover Probleme auftreten:

- In Render `DATABASE_URL` zur alten Render-DB zurueckstellen
- Redeploy ausloesen
- Incident notieren und Neon-Dump fuer Analyse sichern

## Lokal auf Fedora (bleibt unveraendert)

Lokal weiter so:

- `USE_DATABASE_URL=false`
- `PGHOST=/var/run/postgresql`
- `PGUSER=<lokaler user>`
- `PGDATABASE=linkshort`

Nur fuer gezielte Neon-Tests lokal kurzfristig:

```bash
USE_DATABASE_URL=true DATABASE_URL="...neon..." npm start
```
