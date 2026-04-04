/**
 * @fileoverview Integrationstests für getReferrers
 * @description Testet Referrer-Aggregation pro Short-Link gegen die echte Datenbank.
 *   Keine Mocks — so erkennen wir SQL-Fehler und Schema-Probleme sofort.
 * @module tests/analytics-referrers.test
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import { getReferrers, trackClick } from "../src/services/analytics-service.js";
import { createLink } from "../src/services/link-service.js";

let testCode;

beforeEach(async () => {
  const result = await createLink({ url: "https://example.com/referrer-test" });
  testCode = result.data.code;
});

afterEach(async () => {
  await pool.query("DELETE FROM link_clicks WHERE code = $1", [testCode]);
  await pool.query("DELETE FROM short_links WHERE code = $1", [testCode]);
});

after(async () => {
  await pool.end();
});

// ─── Leeres Ergebnis ──────────────────────────────────────────────────────────

describe("getReferrers – leeres Ergebnis", () => {
  // Ein Link ohne Klicks soll ein leeres Array zurückgeben, nicht null oder Fehler.
  it("gibt leeres Array zurück wenn keine Klicks vorhanden", async () => {
    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.deepEqual(result.data, []);
  });
});

// ─── Sortierung und Aggregation ───────────────────────────────────────────────

describe("getReferrers – Sortierung", () => {
  // ABSTEIGENDE SORTIERUNG: Der meistgenutzte Referrer muss an erster Stelle stehen.
  // Ohne ORDER BY COUNT DESC wäre die Reihenfolge nicht-deterministisch — dieser
  // Test erkennt ein fehlendes ORDER BY sofort.
  it("gibt Referrer absteigend nach count sortiert zurück", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com",
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://github.com",
      userAgent: "Mozilla/5.0",
      ip: "3.3.3.3",
    });

    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data[0].referrer, "https://twitter.com");
    assert.equal(result.data[0].count, 2);
    assert.equal(result.data[1].referrer, "https://github.com");
    assert.equal(result.data[1].count, 1);
  });

  // AGGREGATION: Mehrere Klicks desselben Referrers sollen zu einem Eintrag
  // zusammengefasst werden. Ohne GROUP BY kämen 3 Einzeleinträge zurück.
  it("aggregiert mehrere Klicks desselben Referrers korrekt", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://example.com",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://example.com",
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://example.com",
      userAgent: "Mozilla/5.0",
      ip: "3.3.3.3",
    });

    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].count, 3);
  });
});

// ─── Null-Referrer → "Direct" ─────────────────────────────────────────────────

describe("getReferrers – Null-Referrer", () => {
  // NULL-REFERRER: trackClick speichert null/leer als "Direct" (via buildAndInsert).
  // getReferrers soll diesen gespeicherten Wert unverändert zurückgeben.
  // Warum: Ein leerer Referrer kommt von Bookmarks, E-Mails oder direkter Eingabe.
  // Ohne "Direct"-Default wäre dieser Traffic in der Statistik unsichtbar.
  it("null-Referrer erscheint als 'Direct' im Ergebnis", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });

    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].referrer, "Direct");
  });

  // LEERER STRING → "Direct": Semantisch identisch mit null — beide bedeuten
  // "kein Referrer". Ein Refactor von `referrer || DIRECT` zu `referrer ?? DIRECT`
  // würde "" als eigenen Eintrag speichern und wäre ein stiller Breaking Change.
  it("leerer Referrer ('') erscheint als 'Direct' im Ergebnis", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });

    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data[0].referrer, "Direct");
  });
});

// ─── Bot-Filter ───────────────────────────────────────────────────────────────

describe("getReferrers – Bot-Filter", () => {
  // BOTS AUSBLENDEN: Ein Bot-Klick von google.com und ein Human-Klick von twitter.com.
  // Das Ergebnis darf nur twitter.com zeigen — google.com ist Bot-Traffic und
  // würde das Referrer-Bild verfälschen (SEO-Bot ≠ echter Besucher).
  it("Bot-Klicks werden aus der Referrer-Aggregation ausgeblendet", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
      ip: "66.249.64.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com",
      userAgent: "Mozilla/5.0",
      ip: "1.2.3.4",
    });

    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].referrer, "https://twitter.com");
  });

  // NUR BOTS: Wenn alle Klicks Bot-Klicks sind, muss das Ergebnis leer sein.
  it("gibt leeres Array zurück wenn alle Klicks Bot-Klicks sind", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent: "Googlebot/2.1",
      ip: "66.249.64.1",
    });

    const result = await getReferrers(testCode);

    assert.equal(result.success, true);
    assert.deepEqual(result.data, []);
  });
});

// ─── Fehlerfälle ──────────────────────────────────────────────────────────────

describe("getReferrers – Fehlerfälle", () => {
  // NOT_FOUND: Unbekannter Code soll NOT_FOUND zurückgeben, keinen DB-Fehler.
  // Gibt konsistentes Verhalten wie getStats und getClicksByPeriod.
  it("gibt err('NOT_FOUND') für unbekannten Code", async () => {
    const result = await getReferrers("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });
});
