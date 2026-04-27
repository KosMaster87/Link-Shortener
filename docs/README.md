# Documentation Structure

Dieser Ordner enthält nur manuell geschriebene Projektdokumentation.

## Ordner

- `manual/architecture/` - Architektur, Moduluebersichten, API-Flow
- `manual/decisions/` - ADRs und technische Entscheidungen
- `manual/how-to/` - Schritt-fuer-Schritt-Anleitungen
- `manual/runbooks/` - Betrieb, Incident- und Deployment-Runbooks

## Trennung der Doku-Typen

- Manuell gepflegte Doku: `docs/manual/`
- Generierte API-Referenz und Docusaurus-Seite: `docs-site/`
- Generierte API-Dateien: `docs-site/docs/api/` (nicht manuell bearbeiten)
- Build-Ausgabe: `docs-site/build/` (nicht manuell bearbeiten)

## Befehle

Vom Projekt-Root aus:

```bash
npm run docs:dev
npm run docs:build
npm run docs:serve
```
