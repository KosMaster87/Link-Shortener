/**
 * @fileoverview Integrationstests für analytics-service
 * @description Testet trackClick und getStats gegen die echte Datenbank.
 *   Keine Mocks – so finden wir echte SQL-Fehler und Schema-Probleme,
 *   die gemockte Tests verstecken würden.
 *
 *   Voraussetzung: link_clicks braucht eine ip_hash-Spalte:
 *   ALTER TABLE link_clicks ADD COLUMN ip_hash TEXT;
 *   ALTER TABLE link_clicks ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT FALSE;
 *
 * @module tests/analytics-service.test
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import { createLink } from "../src/services/link-service.js";
import {
  getStats,
  trackClick,
} from "../src/services/analytics-service.js";

// Der Test-Link bleibt über alle Tests bestehen; Klicks werden in afterEach
// bereinigt. Warum nicht beforeEach? Link-Erstellung hat eine DB-Roundtrip-
// Kosten – einmal reicht, solange ON DELETE CASCADE die Klicks löscht.
let testCode;

before(async () => {
  const result = await createLink({ url: "https://example.com/analytics" });
  testCode = result.data.code;
});

afterEach(async () => {
  // Klicks löschen, Link bleibt stehen – so startet jeder Test mit 0 Klicks.
  await pool.query("DELETE FROM link_clicks WHERE code = $1", [testCode]);
});

after(async () => {
  await pool.query("DELETE FROM short_links WHERE code = $1", [testCode]);
  await pool.end();
});

// ─── trackClick ──────────────────────────────────────────────────────────────

describe("trackClick", () => {
  // HAPPY PATH: Wir prüfen nicht nur success, sondern lesen den Klick
  // direkt aus der DB. So erkennen wir sofort, wenn Felder falsch gemappt
  // oder Werte transformiert werden (z.B. ip_hash nicht gesetzt).
  it("speichert Klick mit code, referrer und userAgent", async () => {
    const result = await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com/user/status/123",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      ip: "192.168.1.100",
    });

    assert.equal(result.success, true);

    const { rows } = await pool.query(
      "SELECT * FROM link_clicks WHERE code = $1",
      [testCode],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].referrer, "https://twitter.com/user/status/123");
    assert.equal(rows[0].user_agent, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
    // ip_hash muss gesetzt sein – aber nicht die originale IP
    assert.ok(rows[0].ip_hash);
    assert.notEqual(rows[0].ip_hash, "192.168.1.100");
  });

  // NULL-REFERRER → "Direct": Viele Links werden direkt aufgerufen (z.B. aus
  // E-Mails, Bookmarks). Ohne diesen Default wären diese Klicks in der
  // Statistik unsichtbar oder würden null-Werte produzieren.
  it("speichert fehlenden Referrer als 'Direct'", async () => {
    const result = await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      ip: "10.0.0.1",
    });

    assert.equal(result.success, true);

    const { rows } = await pool.query(
      "SELECT referrer FROM link_clicks WHERE code = $1",
      [testCode],
    );
    assert.equal(rows[0].referrer, "Direct");
  });

  // BOT-FILTER: Klicks von bekannten Bots sollen nicht in die Statistik
  // einfließen. Wir prüfen, dass der Klick entweder gar nicht gespeichert
  // wird oder is_bot = true gesetzt ist – beides verhindert Verfälschung.
  it("speichert Bot-Traffic nicht (Googlebot)", async () => {
    const result = await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
      ip: "66.249.64.1",
    });

    // Bot-Klick gibt success zurück (kein Fehler), wird aber nicht gezählt
    assert.equal(result.success, true);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND (is_bot = FALSE OR is_bot IS NULL)",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // UNGÜLTIGE LINK-ID: Der Service soll prüfen, ob der Link existiert.
  // Ohne diese Prüfung würde ein DB-Constraint-Fehler nach oben blubbern
  // statt einen sauberen Result-Fehler zurückzugeben.
  it("gibt err('NOT_FOUND') zurück für unbekannte linkId", async () => {
    const result = await trackClick({
      linkId: "xxxxxx",
      referrer: "https://example.com",
      userAgent: "Mozilla/5.0",
      ip: "1.2.3.4",
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "NOT_FOUND");
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe("getStats", () => {
  // LEERE STATS: Ein neuer Link ohne Klicks soll valide Statistiken zurückgeben,
  // keine Fehler oder null-Werte. Warum: Das Dashboard rendert auch für neue
  // Links – ein Crash hier wäre ein UX-Bug.
  it("gibt leere Statistiken für Link ohne Klicks zurück", async () => {
    const result = await getStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.totalClicks, 0);
    assert.deepEqual(result.data.clicksByDay, []);
    assert.deepEqual(result.data.topReferrers, []);
    assert.equal(result.data.uniqueVisitors, 0);
  });

  // TOTAL CLICKS: Wir speichern eine bekannte Anzahl Klicks und prüfen die
  // Summe. Getrennt von clicksByDay, damit ein Fehler in der GROUP BY-Logik
  // den Zähler-Test nicht maskiert.
  it("zählt totalClicks korrekt", async () => {
    await trackClick({ linkId: testCode, referrer: "https://a.com", userAgent: "Mozilla/5.0", ip: "1.1.1.1" });
    await trackClick({ linkId: testCode, referrer: "https://b.com", userAgent: "Mozilla/5.0", ip: "2.2.2.2" });
    await trackClick({ linkId: testCode, referrer: "https://c.com", userAgent: "Mozilla/5.0", ip: "3.3.3.3" });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.totalClicks, 3);
  });

  // TOP REFERRERS: Wir prüfen Sortierung und Aggregation. Zwei Klicks von
  // twitter.com, einer von github.com – twitter muss an erster Stelle stehen.
  it("aggregiert topReferrers absteigend nach Anzahl", async () => {
    await trackClick({ linkId: testCode, referrer: "https://twitter.com", userAgent: "Mozilla/5.0", ip: "1.1.1.1" });
    await trackClick({ linkId: testCode, referrer: "https://twitter.com", userAgent: "Mozilla/5.0", ip: "2.2.2.2" });
    await trackClick({ linkId: testCode, referrer: "https://github.com", userAgent: "Mozilla/5.0", ip: "3.3.3.3" });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.topReferrers[0].referrer, "https://twitter.com");
    assert.equal(result.data.topReferrers[0].count, 2);
    assert.equal(result.data.topReferrers[1].referrer, "https://github.com");
    assert.equal(result.data.topReferrers[1].count, 1);
  });

  // CLICKS BY DAY: Klicks desselben Tages sollen zu einem Eintrag aggregiert
  // werden. Wir legen mehrere Klicks an – alle landen heute – und erwarten
  // genau einen Eintrag in clicksByDay.
  it("gruppiert clicksByDay nach Datum (ein Eintrag pro Tag)", async () => {
    await trackClick({ linkId: testCode, referrer: "https://a.com", userAgent: "Mozilla/5.0", ip: "1.1.1.1" });
    await trackClick({ linkId: testCode, referrer: "https://b.com", userAgent: "Mozilla/5.0", ip: "2.2.2.2" });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    // Beide Klicks sind heute → genau ein Tageseintrag
    assert.equal(result.data.clicksByDay.length, 1);
    assert.equal(result.data.clicksByDay[0].count, 2);
    // date ist ein ISO-Datumsstring (YYYY-MM-DD)
    assert.match(result.data.clicksByDay[0].date, /^\d{4}-\d{2}-\d{2}$/);
  });

  // UNIQUE VISITORS: Zwei Klicks von derselben IP sollen nur als ein
  // Unique Visitor zählen. Wir testen die Hash-Deduplizierung, nicht die
  // Rohdaten – so bleibt der Test gültig auch wenn sich das Hash-Verfahren
  // ändert, solange die Semantik (gleiche IP = 1 Visitor) stimmt.
  it("zählt uniqueVisitors anhand von ip_hash (gleiche IP = 1)", async () => {
    const sameIp = "192.168.0.1";
    await trackClick({ linkId: testCode, referrer: "https://a.com", userAgent: "Mozilla/5.0", ip: sameIp });
    await trackClick({ linkId: testCode, referrer: "https://b.com", userAgent: "Mozilla/5.0", ip: sameIp });
    await trackClick({ linkId: testCode, referrer: "https://c.com", userAgent: "Mozilla/5.0", ip: "10.0.0.5" });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    // 3 Klicks, aber nur 2 unterschiedliche IPs
    assert.equal(result.data.uniqueVisitors, 2);
  });

  // FEHLERFALL: getStats für unbekannten Code gibt NOT_FOUND zurück.
  // Wir prüfen den error-String explizit – konsistentes Verhalten über
  // alle Service-Funktionen soll sichtbar sein.
  it("gibt err('NOT_FOUND') zurück für unbekannten code", async () => {
    const result = await getStats("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error, "NOT_FOUND");
  });
});
