/**
 * @fileoverview Characterization Tests für die Redirect-Logik
 * @description Dokumentiert das aktuelle Verhalten des Redirect-Pfads exakt —
 *   inklusive des bekannten Bugs, dass inaktive Links trotzdem weiterleiten.
 *
 *   Zwei Testebenen:
 *   - Service Layer (getLink): direkte DB-Verbindung, kein Server nötig.
 *   - HTTP Layer (GET /:code): echte HTTP-Requests, Server muss laufen (`npm start`).
 *
 *   Was dokumentiert wird:
 *   - Aktiver Link → 302 ✓
 *   - Inaktiver Link → 302 (BUG: sollte 404 sein) ← explizit markiert
 *   - Unbekannter Code → 404 ✓
 *   - Click-Tracking fire-and-forget ✓ (Referrer, UA, ip_hash, Bot-Flag)
 *
 * @module tests/characterization-redirect.test
 */
import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import {
  createLink,
  getLink,
  toggleActive,
} from "../src/services/link-service.js";

const BASE = "http://localhost:3000";

// Sammelt alle Codes dieses Testlaufs — afterEach räumt nur diese weg.
// ON DELETE CASCADE löscht link_clicks automatisch mit.
const createdCodes = [];

afterEach(async () => {
  if (createdCodes.length > 0) {
    await pool.query("DELETE FROM short_links WHERE code = ANY($1)", [
      createdCodes,
    ]);
    createdCodes.length = 0;
  }
});

after(async () => {
  await pool.end();
});

// ── Setup-Helper ──────────────────────────────────────────────────────────────

/**
 * Legt einen aktiven Link direkt über den Service an (kein HTTP).
 * @param {string} url
 * @returns {Promise<string>} code
 */
const createActive = async (url) => {
  const result = await createLink({ url });
  const { code } = result.data;
  createdCodes.push(code);
  return code;
};

/**
 * Legt einen Link an und schaltet ihn sofort auf is_active = false.
 * Nutzt toggleActive, damit der Zustand 1:1 dem entspricht, was ein echter
 * PATCH /api/links/:code/toggle erzeugen würde.
 * @param {string} url
 * @returns {Promise<string>} code
 */
const createInactive = async (url) => {
  const code = await createActive(url);
  await toggleActive(code);
  return code;
};

// ── Service Layer: getLink ────────────────────────────────────────────────────

describe("getLink – Service Layer", () => {
  // HAPPY PATH: Ein frisch angelegter Link hat is_active = TRUE per DB-Default.
  // getLink gibt alle Felder korrekt zurück.
  it("gibt aktiven Link mit korrekten Feldern zurück", async () => {
    const code = await createActive("https://example.com/char-svc-active");

    const result = await getLink(code);

    assert.equal(result.success, true);
    assert.equal(result.data.code, code);
    assert.equal(
      result.data.originalUrl,
      "https://example.com/char-svc-active",
    );
    assert.equal(result.data.isActive, true);
    assert.ok(result.data.createdAt instanceof Date);
    assert.equal(result.data.userId, null);
  });

  // KNOWN BUG – Service Layer:
  //   getLink filtert NICHT auf is_active. Die SQL-Query lautet:
  //     "SELECT * FROM short_links WHERE code = $1"
  //   Ein deaktivierter Link kommt mit success=true zurück, isActive=false.
  //   handleRedirect sieht daher kein Fehlersignal und leitet weiter.
  //
  // Fix (eine von zwei Stellen):
  //   "SELECT * FROM short_links WHERE code = $1 AND is_active = TRUE"
  //
  // Wenn dieser Test auf NOT_FOUND umspringt, ist der Bug auf Service-Ebene behoben.
  it("gibt inaktiven Link zurück — KNOWN BUG: kein is_active-Filter in getLink", async () => {
    const code = await createInactive("https://example.com/char-svc-inactive");

    const result = await getLink(code);

    // BUG: erwartet wäre { success: false, error: { code: "NOT_FOUND" } }
    assert.equal(result.success, true);
    assert.equal(result.data.isActive, false); // bestätigt: Link ist wirklich inaktiv
    assert.equal(result.data.code, code);
  });

  // FEHLERFALL: Unbekannter Code → NOT_FOUND. Korrekt implementiert.
  it("gibt NOT_FOUND zurück für unbekannten Code", async () => {
    const result = await getLink("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });
});

// ── HTTP Layer: GET /:code ────────────────────────────────────────────────────
// Voraussetzung: `npm start` — Server auf localhost:3000.
// redirect: "manual" verhindert dass fetch dem 302 automatisch folgt.

describe("GET /:code – HTTP Redirect", () => {
  // HAPPY PATH: Aktiver Link → 302 mit korrektem Location-Header.
  it("aktiver Link → 302 mit korrekter Location", async () => {
    const code = await createActive("https://example.com/char-http-active");

    const res = await fetch(`${BASE}/${code}`, { redirect: "manual" });

    assert.equal(res.status, 302);
    assert.equal(
      res.headers.get("location"),
      "https://example.com/char-http-active",
    );
  });

  // KNOWN BUG – Route Layer:
  //   handleRedirect prüft result.data.isActive nach getLink() nicht.
  //   Code (redirect.js:42ff):
  //     const result = await getLink(params.code);
  //     if (!result.success) return send(res, 404, ...);
  //     // ← hier fehlt: if (!result.data.isActive) return send(res, 404, ...)
  //     res.writeHead(302, { Location: result.data.originalUrl });
  //
  // Fix (zweite Stelle, alternativ zu getLink-Fix):
  //   if (!result.data.isActive) return send(res, 404, { error: "NOT_FOUND" });
  //
  // Wenn dieser Test auf 404 umspringt, ist der Bug auf Route-Ebene behoben.
  it("inaktiver Link → 302 — KNOWN BUG: sollte 404 sein", async () => {
    const code = await createInactive("https://example.com/char-http-inactive");

    const res = await fetch(`${BASE}/${code}`, { redirect: "manual" });

    // BUG: erwartet wäre 404. Aktuelles Verhalten: 302 auf die Original-URL.
    assert.equal(res.status, 302);
    assert.equal(
      res.headers.get("location"),
      "https://example.com/char-http-inactive",
    );
  });

  // FEHLERFALL: Unbekannter Code → 404 JSON. Korrekt implementiert.
  it("unbekannter Code → 404 mit NOT_FOUND Body", async () => {
    const res = await fetch(`${BASE}/xxxxxx`, { redirect: "manual" });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "NOT_FOUND");
  });

  // ROUTER-CONSTRAINT: Der Code-Regex in server.js ist /^\/([a-zA-Z0-9]{6})$/.
  // Codes mit falscher Länge treffen den Redirect-Handler nicht — serveStatic
  // liefert 404, weil keine passende Datei in public/ existiert.
  it("Code mit 5 Zeichen → 404 (kein Regex-Match im Router)", async () => {
    const res = await fetch(`${BASE}/xxxxx`, { redirect: "manual" });

    assert.equal(res.status, 404);
  });

  it("Code mit 7 Zeichen → 404 (kein Regex-Match im Router)", async () => {
    const res = await fetch(`${BASE}/xxxxxxx`, { redirect: "manual" });

    assert.equal(res.status, 404);
  });

  // SECURITY HEADERS: Alle Responses sollen die konfigurierten Security-Header tragen —
  // auch Redirects. Stellt sicher dass applySecurityHeaders vor routeGet aufgerufen wird.
  it("302-Response enthält Security-Header", async () => {
    const code = await createActive("https://example.com/char-secheaders");

    const res = await fetch(`${BASE}/${code}`, { redirect: "manual" });

    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.ok(res.headers.get("strict-transport-security"));
  });
});

// ── Click-Tracking (fire-and-forget) ─────────────────────────────────────────
// trackClick läuft nach dem 302 asynchron — kurze Wartezeit für den DB-Write.
// Direkte Abfrage auf link_clicks (nicht via /stats), um den Rohzustand zu sehen.

describe("Click-Tracking – fire-and-forget", () => {
  // HAPPY PATH: Ein Klick schreibt genau eine Zeile in link_clicks.
  it("schreibt einen Eintrag in link_clicks", async () => {
    const code = await createActive("https://example.com/char-track-basic");

    await fetch(`${BASE}/${code}`, { redirect: "manual" });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT * FROM link_clicks WHERE code = $1",
      [code],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, code);
  });

  // REFERRER: Der Referer-Header (RFC-Schreibfehler, aber korrekt im HTTP-Standard)
  // wird in link_clicks.referrer gespeichert.
  it("speichert Referer-Header als referrer", async () => {
    const code = await createActive("https://example.com/char-track-referrer");

    await fetch(`${BASE}/${code}`, {
      redirect: "manual",
      headers: { Referer: "https://referring-site.example/page" },
    });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT referrer FROM link_clicks WHERE code = $1",
      [code],
    );
    assert.equal(rows[0].referrer, "https://referring-site.example/page");
  });

  // KEIN REFERRER: trackClick setzt "Direct" als Fallback (buildAndInsert:
  //   const safeReferrer = referrer || DIRECT;)
  it("speichert 'Direct' wenn kein Referer-Header gesetzt ist", async () => {
    const code = await createActive("https://example.com/char-track-direct");

    await fetch(`${BASE}/${code}`, { redirect: "manual" });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT referrer FROM link_clicks WHERE code = $1",
      [code],
    );
    assert.equal(rows[0].referrer, "Direct");
  });

  // BOT-ERKENNUNG: "Googlebot" enthält "bot" — trifft BOT_PATTERNS in analytics-service.js.
  // is_bot=true → dieser Klick erscheint nicht in getStats/totalClicks.
  it("setzt is_bot=true für Googlebot User-Agent", async () => {
    const code = await createActive("https://example.com/char-track-bot");

    await fetch(`${BASE}/${code}`, {
      redirect: "manual",
      headers: {
        "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
      },
    });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT is_bot FROM link_clicks WHERE code = $1",
      [code],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].is_bot, true);
  });

  // NORMALER UA: Browser-UA enthält kein Bot-Pattern → is_bot=false.
  it("setzt is_bot=false für normalen Browser User-Agent", async () => {
    const code = await createActive("https://example.com/char-track-human");

    await fetch(`${BASE}/${code}`, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT is_bot FROM link_clicks WHERE code = $1",
      [code],
    );
    assert.equal(rows[0].is_bot, false);
  });

  // IP-HASH: redirect.js nutzt socket.remoteAddress (kein x-forwarded-for —
  // der wäre fälschbar). analytics-service.js hasht die IP mit SHA-256.
  // Ergebnis: 64 Hex-Zeichen, nie Klartext-IP.
  it("speichert ip_hash als 64-stelligen SHA-256 Hex-String, nicht als Klartext", async () => {
    const code = await createActive("https://example.com/char-track-iphash");

    await fetch(`${BASE}/${code}`, { redirect: "manual" });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT ip_hash FROM link_clicks WHERE code = $1",
      [code],
    );
    assert.equal(rows.length, 1);
    assert.equal(typeof rows[0].ip_hash, "string");
    assert.equal(rows[0].ip_hash.length, 64);
    assert.ok(
      /^[0-9a-f]{64}$/.test(rows[0].ip_hash),
      "ip_hash muss genau 64 Hex-Zeichen sein",
    );
  });

  // BUG-FOLGE: Weil handleRedirect inaktive Links trotzdem weiterleitet,
  // läuft auch trackClick durch. Klicks auf inaktive Links werden in die DB
  // geschrieben — obwohl der Link "deaktiviert" ist.
  //
  // Wenn der is_active-Bug behoben wird (404 vor dem trackClick-Aufruf),
  // muss dieser Test auf rows.length === 0 geändert werden.
  it("trackt Klick auch für inaktive Links — Folge des is_active-Bugs", async () => {
    const code = await createInactive(
      "https://example.com/char-track-inactive",
    );

    await fetch(`${BASE}/${code}`, { redirect: "manual" });
    await new Promise((r) => setTimeout(r, 100));

    const { rows } = await pool.query(
      "SELECT code FROM link_clicks WHERE code = $1",
      [code],
    );
    // BUG: Bei korrektem 404 würde trackClick nie aufgerufen → rows.length === 0.
    // Aktuelles Verhalten: Klick wird trotzdem geschrieben.
    assert.equal(rows.length, 1);
  });

  // FIRE-AND-FORGET: handleRedirect wartet nicht auf trackClick.
  // Der 302 kommt sofort — trackClick läuft im Hintergrund weiter.
  // Dieser Test verifiziert, dass der 302 auch dann korrekt kommt,
  // wenn der Klick-Write noch aussteht.
  it("sendet 302 sofort ohne auf den Klick-Write zu warten", async () => {
    const code = await createActive("https://example.com/char-track-faf");
    const start = Date.now();

    const res = await fetch(`${BASE}/${code}`, { redirect: "manual" });

    // 302 muss vor dem DB-Write ankommen. 200ms ist großzügig genug,
    // dass ein echter DB-Write (der ~10-50ms dauert) nicht durchfällt.
    const elapsed = Date.now() - start;
    assert.equal(res.status, 302);
    assert.ok(
      elapsed < 200,
      `302 kam erst nach ${elapsed}ms — zu langsam für fire-and-forget`,
    );
  });
});
