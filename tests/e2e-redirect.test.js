/**
 * @fileoverview E2E-Tests für den Link-Redirect-Flow
 * @description Testet den kompletten Redirect-Pfad über echte HTTP-Requests
 *   gegen einen laufenden Server auf localhost:3000. Kein Mocking – so erkennen
 *   wir Integrationsfehler zwischen Route, Service und Datenbank.
 *
 *   Voraussetzung: Server muss manuell gestartet sein (`npm start`).
 *
 * @module tests/e2e-redirect.test
 */
import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";

const BASE = "http://localhost:3000";

// Sammelt Codes der in diesem Lauf erstellten Links – afterEach räumt nur
// diese weg. Kein globales DELETE: npm test läuft parallel, ein globales
// DELETE FROM short_links würde Daten anderer Test-Dateien löschen und
// dort FK-Violations oder fehlerhafte Zählungen verursachen.
const createdCodes = [];

afterEach(async () => {
  if (createdCodes.length === 0) return;
  // ON DELETE CASCADE löscht link_clicks automatisch mit.
  await pool.query("DELETE FROM short_links WHERE code = ANY($1)", [
    createdCodes,
  ]);
  createdCodes.length = 0;
});

after(async () => {
  await pool.end();
});

// ─── Redirect ─────────────────────────────────────────────────────────────────

describe("GET /{code} – Redirect", () => {
  // HAPPY PATH: Der vollständige Flow – Link anlegen, aufrufen, Stats prüfen.
  // redirect: "manual" verhindert, dass fetch dem 302 automatisch folgt,
  // damit wir Status und Location-Header direkt prüfen können.
  it("leitet zur Original-URL weiter und trackt den Klick", async () => {
    const createRes = await fetch(`${BASE}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/target" }),
    });
    const { code } = await createRes.json();
    createdCodes.push(code);

    const redirectRes = await fetch(`${BASE}/${code}`, { redirect: "manual" });

    assert.equal(redirectRes.status, 302);
    assert.equal(
      redirectRes.headers.get("location"),
      "https://example.com/target",
    );

    // trackClick ist fire-and-forget – kurz warten bis der DB-Write abgeschlossen ist.
    await new Promise((r) => setTimeout(r, 100));

    const statsRes = await fetch(`${BASE}/api/links/${code}/stats`);
    const stats = await statsRes.json();
    assert.equal(stats.totalClicks, 1);
  });

  // 404 für unbekannten Code: Der Server darf nicht abstürzen oder
  // eine generische Fehlerseite liefern – JSON mit NOT_FOUND erwartet.
  it("antwortet mit 404 für unbekannten Code", async () => {
    const res = await fetch(`${BASE}/xxxxxx`, { redirect: "manual" });

    assert.equal(res.status, 404);
  });

  // BOT-FILTER: Der Googlebot-UA soll von trackClick als is_bot=true markiert
  // werden. getStats filtert Bots per is_bot=FALSE – totalClicks muss 0 bleiben.
  it("zählt Bot-Traffic nicht in totalClicks", async () => {
    const createRes = await fetch(`${BASE}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/bot-test" }),
    });
    const { code } = await createRes.json();
    createdCodes.push(code);

    await fetch(`${BASE}/${code}`, {
      redirect: "manual",
      headers: { "User-Agent": "Googlebot/2.1" },
    });

    await new Promise((r) => setTimeout(r, 100));

    const statsRes = await fetch(`${BASE}/api/links/${code}/stats`);
    const stats = await statsRes.json();
    assert.equal(stats.totalClicks, 0);
  });

  // MEHRERE KLICKS: Sequentielle Aufrufe müssen einzeln gezählt werden.
  // Parallel wäre schneller, aber race conditions auf dem Fire-and-forget-
  // Track könnten Klicks verschlucken – sequentiell ist deterministischer.
  it("zählt mehrere Klicks korrekt", async () => {
    const createRes = await fetch(`${BASE}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/multi" }),
    });
    const { code } = await createRes.json();
    createdCodes.push(code);

    for (let i = 0; i < 5; i++) {
      await fetch(`${BASE}/${code}`, { redirect: "manual" });
    }

    // Mehr Wartezeit wegen 5 fire-and-forget DB-Writes.
    await new Promise((r) => setTimeout(r, 200));

    const statsRes = await fetch(`${BASE}/api/links/${code}/stats`);
    const stats = await statsRes.json();
    assert.equal(stats.totalClicks, 5);
  });
});
